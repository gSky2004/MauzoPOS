const { query, transaction } = require('../db/pool');
const { ApiError } = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { getCustomerCreditState } = require('../utils/credit');

const list = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT c.*, COALESCE((SELECT SUM(s.total) FROM sales s WHERE s.customer_id = c.id),0)::numeric(12,2) AS total_bought
     FROM shop_customers c ORDER BY c.created_at DESC`
  );
  res.json({ customers: rows });
});

// A debt record only needs to identify who owes it. credit_limit and
// credit_terms_days still exist in the table (phase 2) so old rows stay valid,
// but they are no longer part of creating or maintaining a customer.
const create = asyncHandler(async (req, res) => {
  const { name, phone } = req.body;
  if (!name || !String(name).trim()) throw new ApiError(422, 'Name is required');
  const { rows } = await query(
    'INSERT INTO shop_customers (name, phone) VALUES ($1,$2) RETURNING *',
    [String(name).trim().slice(0, 120), String(phone || '').trim().slice(0, 40)]
  );
  res.status(201).json({ customer: rows[0] });
});

const pay = asyncHandler(async (req, res) => {
  const amt = Number(req.body.amount);
  if (!amt || amt <= 0) throw new ApiError(422, 'Invalid amount');
  const method = ['Cash', 'Mobile Money'].includes(req.body.method) ? req.body.method : 'Cash';
  const note = String(req.body.note || '').trim().slice(0, 200);
  // Single atomic statement. The old read-then-update let an overpayment drive
  // the balance negative (customer appears to owe the shop) and let two
  // concurrent payments both pass the same stale balance check.
  //
  // RETURNING yields the NEW row, so the pre-payment balance has to be
  // reconstructed as (balance + amount) -- reading `balance` directly would
  // report what is left after paying as the balance that was owed before.
  const { rows: up } = await query(
    `UPDATE shop_customers SET balance = balance - $1
     WHERE id = $2 AND balance >= $1
     RETURNING *, (balance + $1)::numeric(12,2) AS previous_balance
     `,
    [amt.toFixed(2), req.params.id]
  );
  if (!up[0]) {
    const { rows: cur } = await query('SELECT balance FROM shop_customers WHERE id = $1', [req.params.id]);
    if (!cur[0]) throw new ApiError(404, 'Customer not found');
    throw new ApiError(422, `Payment exceeds the outstanding balance of ${Number(cur[0].balance).toFixed(2)}`);
  }
  const previous = Number(up[0].previous_balance);
  const settled = Number(up[0].balance);
  await query(
    `INSERT INTO activity_log (actor_id, action, entity, entity_id, details) VALUES ($1,'credit.payment','customer',$2,$3)`,
    [req.user.id, req.params.id, JSON.stringify({ amount: amt, method, note, previous_balance: previous, balance_after: settled })]
  ).catch(() => {});
  res.json({ customer: up[0], previous_balance: previous, amount: amt, balance_after: settled, settled });
});

// Debt history has to answer "why does this person owe this much?", so each
// credit sale is returned with the actual items that were handed over, not just
// a total.
const history = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT s.id, s.total, s.amount_paid, s.due_date::text AS due_date, s.created_at, s.reference,
            u.full_name AS shopkeeper_name
     FROM sales s
     LEFT JOIN users u ON u.id = s.shopkeeper_id
     WHERE s.customer_id = $1 AND s.payment_method = 'Credit'
     ORDER BY s.created_at DESC LIMIT 100`,
    [req.params.id]
  );
  const { rows: items } = await query(
    `SELECT si.sale_id, si.quantity, si.line_total, p.name AS product_name
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     LEFT JOIN products p ON p.id = si.product_id
     WHERE s.customer_id = $1 AND s.payment_method = 'Credit'
     ORDER BY si.id`,
    [req.params.id]
  );
  const bySale = new Map();
  for (const it of items) {
    if (!bySale.has(it.sale_id)) bySale.set(it.sale_id, []);
    bySale.get(it.sale_id).push({ name: it.product_name || 'Item', quantity: it.quantity, line_total: it.line_total });
  }
  const sales = rows.map((s) => ({ ...s, items: bySale.get(s.id) || [] }));

  const { rows: paymentRows } = await query(
    `SELECT a.id, a.created_at, a.details, u.full_name AS recorded_by
     FROM activity_log a
     LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.action = 'credit.payment' AND a.entity = 'customer' AND a.entity_id = $1
     ORDER BY a.created_at DESC LIMIT 100`,
    [String(req.params.id)]
  );
  const payments = paymentRows.map((p) => {
    let details = {};
    try {
      details = typeof p.details === 'string' ? JSON.parse(p.details) : (p.details || {});
    } catch {
      details = {};
    }
    return {
      id: p.id,
      created_at: p.created_at,
      amount: Number(details.amount) || 0,
      method: details.method || 'Cash',
      note: details.note || '',
      recorded_by: p.recorded_by || '',
    };
  });
  res.json({ sales, payments });
});

// ADMIN only: reverse a wrongly recorded payment. Atomic: the payment log row
// disappears, the balance goes back up, and the reversal itself is logged so
// the audit trail shows what happened instead of a silent edit.
const reversePayment = asyncHandler(async (req, res) => {
  const { rows: found } = await query(
    `SELECT id, details FROM activity_log
     WHERE id = $1 AND action = 'credit.payment' AND entity = 'customer' AND entity_id = $2`,
    [req.params.paymentId, String(req.params.id)]
  );
  if (!found[0]) throw new ApiError(404, 'Payment not found');
  let amount = 0;
  try {
    const details = typeof found[0].details === 'string' ? JSON.parse(found[0].details) : found[0].details;
    amount = Number(details && details.amount) || 0;
  } catch {
    amount = 0;
  }
  if (!(amount > 0)) throw new ApiError(422, 'Payment has no recorded amount');
  await transaction(async (client) => {
    await client.query('DELETE FROM activity_log WHERE id = $1', [req.params.paymentId]);
    await client.query('UPDATE shop_customers SET balance = balance + $1 WHERE id = $2', [amount.toFixed(2), req.params.id]);
    await client.query(
      `INSERT INTO activity_log (actor_id, action, entity, entity_id, details)
       VALUES ($1,'credit.payment_reversed','customer',$2,$3)`,
      [req.user.id, String(req.params.id), JSON.stringify({ amount, reversed_payment_id: req.params.paymentId })]
    );
  });
  res.json({ reversed: amount });
});

const aging = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT c.*, COALESCE((SELECT SUM(s.total) FROM sales s WHERE s.customer_id = c.id),0)::numeric(12,2) AS total_bought
     FROM shop_customers c ORDER BY c.created_at DESC`
  );
  const states = [];
  for (const customer of rows) {
    const state = await getCustomerCreditState({ query }, customer.id);
    if (state) states.push(state);
  }
  const owing = states.filter((s) => s.total_remaining > 0);
  const overdue = owing.filter((s) => s.status === 'overdue');
  const dueSoon = owing.filter((s) => s.status === 'due_soon');
  const paid = states.filter((s) => s.status === 'paid');
  const sum = (list) => Number(list.reduce((s, x) => s + x.total_remaining, 0).toFixed(2));
  res.json({
    customers: states,
    totals: {
      customers: states.length,
      owing: owing.length,
      overdue: overdue.length,
      paid: paid.length,
      outstanding: sum(owing),
      overdue_amount: sum(overdue),
      due_soon: dueSoon.length,
      due_soon_amount: sum(dueSoon),
    },
  });
});

module.exports = { list, create, pay, history, aging, reversePayment };
