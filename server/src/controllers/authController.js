const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { query } = require('../db/pool');
const { ApiError } = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });

const publicUser = (row) => ({
  id: row.id,
  full_name: row.full_name,
  email: row.email,
  phone: row.phone,
  role: row.role,
  status: row.status || 'active',
  created_at: row.created_at,
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new ApiError(401, 'Invalid email or password');
  }
  if (user.status === 'disabled') {
    throw new ApiError(403, 'Account has been disabled');
  }

  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

const me = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT id, full_name, email, phone, role, status, created_at FROM users WHERE id = $1',
    [req.user.id]
  );
  res.json({ user: publicUser(rows[0]) });
});

const logout = asyncHandler(async (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

const updateProfile = asyncHandler(async (req, res) => {
  const { full_name, phone } = req.body;
  const { rows } = await query(
    `UPDATE users SET full_name = $1, phone = $2, updated_at = now()
     WHERE id = $3 RETURNING id, full_name, email, phone, role, status, created_at`,
    [full_name, phone, req.user.id]
  );

  res.json({ user: publicUser(rows[0]) });
});

module.exports = { login, me, logout, updateProfile };
