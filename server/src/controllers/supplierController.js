const { query } = require('../db/pool');
const { ApiError } = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT s.*,
      (SELECT COUNT(*)::int FROM products p WHERE p.supplier_id = s.id) AS product_count,
      (SELECT MAX(sr.created_at) FROM stock_receipts sr WHERE sr.supplier_id = s.id) AS last_purchase_at
     FROM suppliers s ORDER BY s.name ASC`
  );
  res.json({ suppliers: rows });
});

const create = asyncHandler(async (req, res) => {
  const { name, phone } = req.body;
  if (!name || !String(name).trim()) throw new ApiError(422, 'Supplier name is required');
  const { rows } = await query(
    'INSERT INTO suppliers (name, phone) VALUES ($1,$2) RETURNING *',
    [String(name).trim(), String(phone || '').trim()]
  );
  res.status(201).json({ supplier: rows[0] });
});

const update = asyncHandler(async (req, res) => {
  const { name, phone, lead_time_days } = req.body;
  let lead = null;
  if (lead_time_days !== undefined && lead_time_days !== null && lead_time_days !== '') {
    lead = Number(lead_time_days);
    if (!Number.isInteger(lead) || lead < 0 || lead > 90) {
      throw new ApiError(422, 'Lead time must be between 0 and 90 days');
    }
  }
  const { rows } = await query(
    'UPDATE suppliers SET name = COALESCE($1,name), phone = COALESCE($2,phone), lead_time_days = COALESCE($3,lead_time_days) WHERE id = $4 RETURNING *',
    [name ? String(name).trim() : null, phone !== undefined ? String(phone).trim() : null, lead, req.params.id]
  );
  if (!rows[0]) throw new ApiError(404, 'Supplier not found');
  res.json({ supplier: rows[0] });
});

const history = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT sr.*, p.name AS product_name
     FROM stock_receipts sr JOIN products p ON p.id = sr.product_id
     WHERE sr.supplier_id = $1 ORDER BY sr.created_at DESC LIMIT 100`,
    [req.params.id]
  );
  res.json({ receipts: rows });
});

module.exports = { list, create, update, history };
