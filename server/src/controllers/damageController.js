const { query, transaction } = require('../db/pool');
const { ApiError } = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const REASONS = ['expired', 'damaged', 'spoiled', 'broken', 'lost', 'other'];

const report = asyncHandler(async (req, res) => {
  const { product_id, quantity, reason } = req.body;
  const qty = Number(quantity);
  if (!product_id) throw new ApiError(422, 'Product is required');
  if (!Number.isInteger(qty) || qty <= 0) throw new ApiError(422, 'Quantity must be a positive integer');
  if (!REASONS.includes(reason)) throw new ApiError(422, 'Invalid reason');
  const photo = (req.file && `/uploads/${req.file.filename}`) || null;
  if (!photo) throw new ApiError(422, 'Photo is required');

  const result = await transaction(async (client) => {
    const { rows: prod } = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [product_id]);
    if (!prod[0]) throw new ApiError(404, 'Product not found');
    const stock = Number(prod[0].current_stock || 0);
    if (stock < qty) throw new ApiError(422, `Only ${stock} in stock`);
    const newStock = stock - qty;

    const { rows: dmg } = await client.query(
      `INSERT INTO damaged_stock (product_id, quantity, reason, photo, reported_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [product_id, qty, reason, photo, req.user.id]
    );
    await client.query('UPDATE products SET current_stock = $1, updated_at = now() WHERE id = $2', [newStock, product_id]);
    await client.query(
      `INSERT INTO stock_movements (product_id, type, qty_delta, resulting_stock, actor_id, ref_type, ref_id)
       VALUES ($1,'damaged',$2,$3,$4,'damage',$5)`,
      [product_id, -qty, newStock, req.user.id, dmg[0].id]
    );
    await client.query(
      `INSERT INTO activity_log (actor_id, action, entity, entity_id, details)
       VALUES ($1,'damage.reported','damage',$2,$3)`,
      [req.user.id, dmg[0].id, JSON.stringify({ product_id, qty, reason })]
    ).catch(() => {});
    return dmg[0];
  });

  res.status(201).json({ damage: result });
});

const list = asyncHandler(async (req, res) => {
  const params = [];
  let where = '1=1';
  if (req.user.role !== 'ADMIN') { params.push(req.user.id); where += ` AND d.reported_by = $${params.length}`; }
  const { rows } = await query(
    `SELECT d.*, p.name AS product_name, u.full_name AS reporter_name
     FROM damaged_stock d
     JOIN products p ON p.id = d.product_id
     LEFT JOIN users u ON u.id = d.reported_by
     WHERE ${where} ORDER BY d.created_at DESC LIMIT 200`,
    params
  );
  res.json({ damages: rows });
});

const review = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'UPDATE damaged_stock SET reviewed = TRUE WHERE id = $1 RETURNING *',
    [req.params.id]
  );
  if (!rows[0]) throw new ApiError(404, 'Record not found');
  res.json({ damage: rows[0] });
});

module.exports = { report, list, review, REASONS };
