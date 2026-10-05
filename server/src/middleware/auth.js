const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { ApiError } = require('../utils/ApiError');
const { query } = require('../db/pool');

const authenticateUser = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return next(new ApiError(401, 'Authentication required'));
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const { rows } = await query(
      'SELECT id, full_name, email, phone, role, status FROM users WHERE id = $1',
      [payload.sub]
    );
    if (!rows[0]) {
      return next(new ApiError(401, 'Account no longer exists'));
    }
    if (rows[0].status === 'disabled') {
      return next(new ApiError(403, 'Account has been disabled'));
    }
    req.user = rows[0];
    next();
  } catch (err) {
    return next(new ApiError(401, 'Invalid or expired token'));
  }
};

const authorizeRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, 'You do not have permission to perform this action'));
    }
    next();
  };

const optionalAuth = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const { rows } = await query(
      'SELECT id, full_name, email, phone, role, status FROM users WHERE id = $1',
      [payload.sub]
    );
    if (rows[0] && rows[0].status !== 'disabled') req.user = rows[0];
  } catch {
    /* public route: ignore bad token */
  }
  next();
};

module.exports = { authenticateUser, authorizeRole, optionalAuth };
