const { query } = require('../db/pool');
const { ApiError } = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT c.*, COUNT(p.id)::int AS product_count
     FROM categories c
     LEFT JOIN products p ON p.category_id = c.id
     GROUP BY c.id ORDER BY c.name`
  );
  res.json({ categories: rows });
});

const create = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  const { rows } = await query(
    'INSERT INTO categories (name, description) VALUES ($1,$2) RETURNING *',
    [name, description || null]
  ).catch((err) => {
    if (err.code === '23505') throw new ApiError(409, 'Category already exists');
    throw err;
  });
  res.status(201).json({ category: rows[0] });
});

const update = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'UPDATE categories SET name = $1, description = $2 WHERE id = $3 RETURNING *',
    [req.body.name, req.body.description || null, req.params.id]
  );
  if (!rows[0]) throw new ApiError(404, 'Category not found');
  res.json({ category: rows[0] });
});

const remove = asyncHandler(async (req, res) => {
  const { rows } = await query('DELETE FROM categories WHERE id = $1 RETURNING id', [
    req.params.id,
  ]);
  if (!rows[0]) throw new ApiError(404, 'Category not found');
  res.json({ message: 'Category deleted' });
});

module.exports = { list, create, update, remove };
