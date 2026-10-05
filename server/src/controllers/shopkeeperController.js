const bcrypt = require('bcryptjs');
const { query } = require('../db/pool');
const { ApiError } = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const safeUser = (row) => ({
  id: row.id,
  full_name: row.full_name,
  email: row.email,
  phone: row.phone,
  role: row.role,
  status: row.status || 'active',
  created_at: row.created_at,
});

const list = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT id, full_name, email, phone, role, status, created_at
     FROM users WHERE role IN ('ADMIN', 'SHOPKEEPER')
     ORDER BY CASE WHEN role = 'ADMIN' THEN 0 ELSE 1 END, created_at DESC`
  );
  res.json({ shopkeepers: rows.map(safeUser) });
});

const create = asyncHandler(async (req, res) => {
  const { full_name, email, phone, password, role } = req.body;
  const newRole = role === 'ADMIN' ? 'ADMIN' : 'SHOPKEEPER';
  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows[0]) throw new ApiError(409, 'An account with this email already exists');
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await query(
    `INSERT INTO users (full_name, email, phone, password_hash, role, status)
     VALUES ($1,$2,$3,$4,$5,'active')
     RETURNING id, full_name, email, phone, role, status, created_at`,
    [full_name, email, phone, hash, newRole]
  );
  await query(
    `INSERT INTO activity_log (actor_id, action, entity, entity_id, details)
     VALUES ($1,'staff.created','user',$2,$3)`,
    [req.user.id, rows[0].id, JSON.stringify({ email, role: newRole })]
  ).catch(() => {});
  res.status(201).json({ shopkeeper: safeUser(rows[0]) });
});

const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['active', 'disabled'].includes(status)) throw new ApiError(422, 'Invalid status');
  if (String(req.params.id) === String(req.user.id)) {
    throw new ApiError(403, 'You cannot change your own account status');
  }
  const { rows: target } = await query('SELECT role FROM users WHERE id = $1', [req.params.id]);
  if (!target[0] || !['ADMIN', 'SHOPKEEPER'].includes(target[0].role)) {
    throw new ApiError(404, 'Staff account not found');
  }
  if (target[0].role === 'ADMIN' && status === 'disabled') {
    const { rows: rest } = await query(
      `SELECT COUNT(*)::int AS n FROM users WHERE role = 'ADMIN' AND status = 'active' AND id <> $1`,
      [req.params.id]
    );
    if (rest[0].n === 0) throw new ApiError(422, 'You cannot disable the last active admin');
  }
  const { rows } = await query(
    `UPDATE users SET status = $1, updated_at = now()
     WHERE id = $2
     RETURNING id, full_name, email, phone, role, status, created_at`,
    [status, req.params.id]
  );
  res.json({ shopkeeper: safeUser(rows[0]) });
});

module.exports = { list, create, updateStatus };
