const { query, transaction } = require('../db/pool');
const { ApiError } = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { getReplenishment } = require('../utils/replenishment');

// ADMIN only: receive stock -> receipt + stock bump + movement + activity
const receive = asyncHandler(async (req, res) => {
  const { product_id, quantity, buying_price, supplier_id, expiry_date, notes } = req.body;
  const qty = Number(quantity);
  if (!product_id) throw new ApiError(422, 'Product is required');
  if (!Number.isInteger(qty) || qty <= 0) throw new ApiError(422, 'Quantity must be a positive integer');

  const invoicePhoto = (req.file && `/uploads/${req.file.filename}`) || req.body.invoice_photo || null;

  const result = await transaction(async (client) => {
    const { rows: prod } = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [product_id]);
    if (!prod[0]) throw new ApiError(404, 'Product not found');
    const p = prod[0];
    const newStock = Number(p.current_stock || 0) + qty;

    const { rows: rc } = await client.query(
      `INSERT INTO stock_receipts (product_id, quantity, buying_price, supplier_id, expiry_date, invoice_photo, notes, received_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [product_id, qty, buying_price !== undefined ? Number(buying_price) || 0 : Number(p.buying_price || 0),
        supplier_id || p.supplier_id || null, expiry_date || p.expiry_date || null,
        invoicePhoto, notes || '', req.user.id]
    );

    await client.query(
      `UPDATE products SET current_stock = $1,
        buying_price = $2, supplier_id = COALESCE($3, supplier_id),
        expiry_date = COALESCE($4, expiry_date), updated_at = now()
       WHERE id = $5`,
      [newStock, Number(buying_price) || Number(p.buying_price || 0),
        supplier_id || null, expiry_date || null, product_id]
    );

    await client.query(
      `INSERT INTO stock_movements (product_id, type, qty_delta, resulting_stock, actor_id, ref_type, ref_id)
       VALUES ($1,'received',$2,$3,$4,'receipt',$5)`,
      [product_id, qty, newStock, req.user.id, rc[0].id]
    );

    await client.query(
      `INSERT INTO activity_log (actor_id, action, entity, entity_id, details)
       VALUES ($1,'stock.received','product',$2,$3)`,
      [req.user.id, product_id, JSON.stringify({ qty, newStock })]
    ).catch(() => {});

    return { receipt: rc[0], newStock };
  });

  res.status(201).json(result);
});

const movements = asyncHandler(async (req, res) => {
  const { product_id, limit } = req.query;
  const params = [];
  let where = '1=1';
  if (product_id) { params.push(product_id); where += ` AND m.product_id = $${params.length}`; }
  const lim = Math.min(200, Math.max(1, Number(limit) || 50));
  params.push(lim);
  const { rows } = await query(
    `SELECT m.*, p.name AS product_name, u.full_name AS actor_name
     FROM stock_movements m
     JOIN products p ON p.id = m.product_id
     LEFT JOIN users u ON u.id = m.actor_id
     WHERE ${where} ORDER BY m.created_at DESC LIMIT $${params.length}`,
    params
  );
  res.json({ movements: rows });
});

const receipts = asyncHandler(async (req, res) => {
  const { limit } = req.query;
  const lim = Math.min(200, Math.max(1, Number(limit) || 50));
  const { rows } = await query(
    `SELECT sr.*, p.name AS product_name, s.name AS supplier_name, u.full_name AS received_by_name
     FROM stock_receipts sr
     JOIN products p ON p.id = sr.product_id
     LEFT JOIN suppliers s ON s.id = sr.supplier_id
     LEFT JOIN users u ON u.id = sr.received_by
     ORDER BY sr.created_at DESC LIMIT $1`,
    [lim]
  );
  res.json({ receipts: rows });
});

const alerts = asyncHandler(async (req, res) => {
  const isAdmin = req.user?.role === 'ADMIN';
  const { rows: low } = await query(
    `SELECT id, name, unit, current_stock, reorder_level, expiry_date
     FROM products WHERE status = 'active' AND current_stock <= reorder_level
     ORDER BY current_stock ASC LIMIT 50`
  );
  const { rows: exp } = await query(
    `SELECT id, name, unit, current_stock, expiry_date,
       (expiry_date - CURRENT_DATE)::int AS days_left
     FROM products WHERE status = 'active' AND expiry_date IS NOT NULL
       AND expiry_date <= CURRENT_DATE + INTERVAL '30 days'
     ORDER BY expiry_date ASC LIMIT 50`
  );
  const sanitize = (p) => {
    if (isAdmin) return p;
    const { buying_price, ...rest } = p;
    return rest;
  };
  res.json({ lowStock: low.map(sanitize), expiring: exp.map(sanitize) });
});

// GET /api/inventory/replenishment — velocity-based order suggestions. The math
// lives in utils/replenishment.js so the PDF report uses the identical logic.
const replenishment = asyncHandler(async (req, res) => {
  const data = await getReplenishment({ query }, {
    days: req.query.days,
    safety: req.query.safety,
    leadDefault: req.query.leadDefault,
  });
  res.json(data);
});

// ADMIN only: manual stock correction (damaged, expired, missing, personal
// use, counting mistake...). This is NOT a sale: it only moves stock and
// writes a history record, so revenue/profit are untouched.
const adjust = asyncHandler(async (req, res) => {
  const { product_id, quantity, reason, note } = req.body;
  const delta = Number(quantity);
  if (!product_id) throw new ApiError(422, 'Product is required');
  if (!Number.isInteger(delta) || delta === 0) throw new ApiError(422, 'Adjustment must be a non-zero whole number');
  const cleanReason = String(reason || 'other').trim().slice(0, 40) || 'other';
  const cleanNote = String(note || '').trim().slice(0, 200);

  const result = await transaction(async (client) => {
    const { rows: prod } = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [product_id]);
    if (!prod[0]) throw new ApiError(404, 'Product not found');
    const newStock = Number(prod[0].current_stock || 0) + delta;
    if (newStock < 0) {
      throw new ApiError(422, `Adjustment would take stock below zero (have ${prod[0].current_stock})`);
    }
    await client.query('UPDATE products SET current_stock = $1, updated_at = now() WHERE id = $2', [newStock, product_id]);
    await client.query(
      `INSERT INTO stock_movements (product_id, type, qty_delta, resulting_stock, actor_id, ref_type, ref_id)
       VALUES ($1,'adjustment',$2,$3,$4,'adjustment',$5)`,
      [product_id, delta, newStock, req.user.id, cleanReason + (cleanNote ? ` — ${cleanNote}` : '')]
    );
    await client.query(
      `INSERT INTO activity_log (actor_id, action, entity, entity_id, details)
       VALUES ($1,'stock.adjusted','product',$2,$3)`,
      [req.user.id, product_id, JSON.stringify({ delta, newStock, reason: cleanReason, note: cleanNote })]
    ).catch(() => {});
    return { product_id, newStock, delta };
  });

  res.status(201).json(result);
});

module.exports = { receive, movements, receipts, alerts, replenishment, adjust };
