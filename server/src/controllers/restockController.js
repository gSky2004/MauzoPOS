const { query } = require('../db/pool');
const { ApiError } = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const request = asyncHandler(async (req, res) => {
  const { product_id, note } = req.body;
  if (!product_id) throw new ApiError(422, 'Product is required');
  const { rows: prod } = await query('SELECT id FROM products WHERE id = $1', [product_id]);
  if (!prod[0]) throw new ApiError(404, 'Product not found');
  const { rows: dup } = await query(
    "SELECT id FROM restock_requests WHERE product_id = $1 AND status = 'pending' LIMIT 1",
    [product_id]
  );
  if (dup[0]) throw new ApiError(409, 'Already requested — admin has been notified');
  const { rows } = await query(
    'INSERT INTO restock_requests (product_id, requested_by, note) VALUES ($1,$2,$3) RETURNING *',
    [product_id, req.user.id, note || '']
  );
  await query(
    `INSERT INTO activity_log (actor_id, action, entity, entity_id, details)
     VALUES ($1,'restock.requested','restock',$2,$3)`,
    [req.user.id, rows[0].id, JSON.stringify({ product_id })]
  ).catch(() => {});
  res.status(201).json({ request: rows[0] });
});

const list = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT r.*, p.name AS product_name, p.current_stock, u.full_name AS requester_name
     FROM restock_requests r
     JOIN products p ON p.id = r.product_id
     LEFT JOIN users u ON u.id = r.requested_by
     WHERE r.status = 'pending'
     ORDER BY r.created_at DESC`
  );
  res.json({ requests: rows });
});

const resolve = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `UPDATE restock_requests SET status = 'done', resolved_by = $1, resolved_at = now()
     WHERE id = $2 AND status = 'pending' RETURNING *`,
    [req.user.id, req.params.id]
  );
  if (!rows[0]) throw new ApiError(404, 'Request not found');
  res.json({ request: rows[0] });
});

module.exports = { request, list, resolve };
