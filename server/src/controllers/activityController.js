const { query } = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT a.*, u.full_name AS actor_name
     FROM activity_log a LEFT JOIN users u ON u.id = a.actor_id
     ORDER BY a.created_at DESC LIMIT 200`
  );
  res.json({ activity: rows });
});

module.exports = { list };
