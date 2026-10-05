const { query } = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');

const listCustomers = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.created_at,
            COUNT(DISTINCT o.id)::int AS order_count,
            COALESCE(SUM(CASE WHEN o.payment_status = 'PAID' THEN o.total_amount END),0)::numeric(12,2)
              AS total_spent
     FROM users u
     LEFT JOIN orders o ON o.user_id = u.id
     GROUP BY u.id
     ORDER BY u.created_at DESC`
  );
  res.json({ customers: rows });
});

module.exports = { listCustomers };
