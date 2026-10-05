const { query, transaction } = require('../db/pool');
const { ApiError } = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const METHODS = ['Cash', 'M-Pesa', 'Airtel Money', 'Mixx by Yas', 'HaloPesa', 'Bank', 'Credit'];

// Guard against dates like 2026-02-31 that would otherwise reach Postgres and
// surface as an opaque 500.
const isCalendarDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

const sanitizeSale = (sale, role) => {
  if (role === 'ADMIN') return sale;
  const { cogs, gross_profit, ...rest } = sale;
  return rest;
};

// POST /api/sales — single DB transaction. Client sends product IDs + quantities only.
const create = asyncHandler(async (req, res) => {
  const { items, payment_method, customer_id } = req.body;
  const list = Array.isArray(items) ? items : (typeof items === 'string' ? JSON.parse(items) : []);
  if (!Array.isArray(list) || list.length === 0) throw new ApiError(422, 'Sale items are required');
  if (!METHODS.includes(payment_method)) throw new ApiError(422, 'Invalid payment method');

  const evidencePhoto = (req.file && `/uploads/${req.file.filename}`) || null;
  // Cash and mobile-money sales must be evidenced. A credit sale is a promise to
  // pay, not a handover of goods, so it is recorded without a photo -- otherwise
  // the owner cannot log a debt from the phone at the moment it happens.
  if (!evidencePhoto && payment_method !== 'Credit') throw new ApiError(422, 'Evidence photo is required');

  const result = await transaction(async (client) => {
    let total = 0;
    let cogs = 0;
    const lines = [];

    for (const it of list) {
      const qty = Number(it.quantity);
      if (!it.product_id || !Number.isInteger(qty) || qty <= 0) throw new ApiError(422, 'Invalid sale item');
      const { rows } = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [it.product_id]);
      const p = rows[0];
      if (!p || p.status === 'disabled') throw new ApiError(404, 'Product not available');
      const stock = Number(p.current_stock || 0);
      if (stock < qty) throw new ApiError(422, `${p.name}: only ${stock} in stock`);
      const unitPrice = Number(p.selling_price ?? p.price ?? 0);
      const unitCost = Number(p.buying_price || 0) / (Number(p.bundle_qty || 1) || 1);
      const lineTotal = unitPrice * qty;
      total += lineTotal;
      cogs += unitCost * qty;
      lines.push({ product_id: p.id, quantity: qty, unit_price: unitPrice, unit_cost: unitCost, line_total: lineTotal, name: p.name, newStock: stock - qty });
    }

    const gross = total - cogs;
    let creditCustomerId = null;
    let dueDate = null;
    let amountPaid = 0;
    if (payment_method === 'Credit') {
      if (!customer_id) throw new ApiError(422, 'Customer is required for credit sales');
      const { rows: c } = await client.query('SELECT id FROM shop_customers WHERE id = $1 FOR UPDATE', [customer_id]);
      if (!c[0]) throw new ApiError(404, 'Customer not found');
      creditCustomerId = c[0].id;

      // An optional promise date. No date means the debt is never overdue.
      if (req.body.due_date !== undefined && req.body.due_date !== null && req.body.due_date !== '') {
        const raw = String(req.body.due_date).trim().slice(0, 10);
        if (!isCalendarDate(raw)) throw new ApiError(422, 'Invalid due date');
        dueDate = raw;
      }

      // What the customer handed over at the till. Kept on the sale row rather
      // than the payment ledger so it can never be counted twice.
      const rawPaid = req.body.amount_paid;
      amountPaid = rawPaid === undefined || rawPaid === null || rawPaid === '' ? 0 : Number(rawPaid);
      if (!Number.isFinite(amountPaid) || amountPaid < 0) throw new ApiError(422, 'Amount paid must be zero or more');
      amountPaid = Number(amountPaid.toFixed(2));
      if (amountPaid >= total) {
        throw new ApiError(422, 'Amount paid covers the whole total — record this as a normal sale instead');
      }
    }
    // Trim to something that fits a column, and drop blanks so the field stays
    // NULL instead of an empty string (which would defeat the partial index).
    const reference = typeof req.body.reference === 'string' && req.body.reference.trim()
      ? req.body.reference.trim().slice(0, 120)
      : null;
    const { rows: s } = await client.query(
      `INSERT INTO sales (shopkeeper_id, customer_id, payment_method, reference, total, cogs, gross_profit, evidence_photo, due_date, amount_paid)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.id, creditCustomerId, payment_method, reference, total.toFixed(2), cogs.toFixed(2), gross.toFixed(2), evidencePhoto, dueDate, amountPaid.toFixed(2)]
    );
    const sale = s[0];
    if (creditCustomerId) {
      const owed = Number((total - amountPaid).toFixed(2));
      if (owed > 0) {
        await client.query('UPDATE shop_customers SET balance = balance + $1 WHERE id = $2', [owed.toFixed(2), creditCustomerId]);
      }
    }

    for (const l of lines) {
      await client.query(
        'INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, unit_cost, line_total) VALUES ($1,$2,$3,$4,$5,$6)',
        [sale.id, l.product_id, l.quantity, l.unit_price.toFixed(2), l.unit_cost.toFixed(2), l.line_total.toFixed(2)]
      );
      await client.query('UPDATE products SET current_stock = $1, updated_at = now() WHERE id = $2', [l.newStock, l.product_id]);
      await client.query(
        `INSERT INTO stock_movements (product_id, type, qty_delta, resulting_stock, actor_id, ref_type, ref_id)
         VALUES ($1,'sale',$2,$3,$4,'sale',$5)`,
        [l.product_id, -l.quantity, l.newStock, req.user.id, sale.id]
      );
    }

    await client.query(
      `INSERT INTO activity_log (actor_id, action, entity, entity_id, details)
       VALUES ($1,'sale.recorded','sale',$2,$3)`,
      [req.user.id, sale.id, JSON.stringify({ total, items: lines.length, payment_method, due_date: dueDate, amount_paid: amountPaid })]
    ).catch(() => {});

    return sale;
  });

  res.status(201).json({ sale: sanitizeSale(result, req.user.role) });
});

const today = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT s.*, COUNT(si.id)::int AS items_count, COALESCE(SUM(si.quantity),0)::int AS units
     FROM sales s LEFT JOIN sale_items si ON si.sale_id = s.id
     WHERE s.shopkeeper_id = $1 AND s.created_at::date = CURRENT_DATE
     GROUP BY s.id ORDER BY s.created_at DESC`,
    [req.user.id]
  );
  res.json({ sales: rows.map((s) => sanitizeSale(s, req.user.role)) });
});

const mine = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM sales WHERE shopkeeper_id = $1 ORDER BY created_at DESC LIMIT 200',
    [req.user.id]
  );
  res.json({ sales: rows.map((s) => sanitizeSale(s, req.user.role)) });
});

const all = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT s.*, u.full_name AS shopkeeper_name FROM sales s
     LEFT JOIN users u ON u.id = s.shopkeeper_id
     ORDER BY s.created_at DESC LIMIT 200`
  );
  res.json({ sales: rows });
});

const detail = asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM sales WHERE id = $1', [req.params.id]);
  const sale = rows[0];
  if (!sale) throw new ApiError(404, 'Sale not found');
  if (req.user.role !== 'ADMIN' && sale.shopkeeper_id !== req.user.id) throw new ApiError(403, 'Not your sale');
  const { rows: items } = await query(
    `SELECT si.*, p.name AS product_name FROM sale_items si
     LEFT JOIN products p ON p.id = si.product_id WHERE si.sale_id = $1`,
    [sale.id]
  );
  res.json({ sale: sanitizeSale(sale, req.user.role), items });
});

module.exports = { create, today, mine, all, detail, METHODS };
