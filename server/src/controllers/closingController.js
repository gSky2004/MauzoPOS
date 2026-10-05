const { query } = require('../db/pool');
const { ApiError } = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const expectedCash = async (shopkeeperId, date) => {
  const { rows } = await query(
    `SELECT COALESCE(SUM(total),0)::numeric(12,2) AS expected
     FROM sales WHERE shopkeeper_id = $1 AND payment_method = 'Cash' AND created_at::date = $2::date`,
    [shopkeeperId, date]
  );
  return Number(rows[0].expected);
};

const submit = asyncHandler(async (req, res) => {
  const { actual_cash, note, date } = req.body;
  const actual = Number(actual_cash);
  if (isNaN(actual) || actual < 0) throw new ApiError(422, 'Invalid cash amount');
  const day = date || new Date().toISOString().slice(0, 10);
  const expected = await expectedCash(req.user.id, day);
  const diff = actual - expected;
  const { rows } = await query(
    `INSERT INTO daily_closings (date, expected_cash, actual_cash, difference, note, shopkeeper_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (date, shopkeeper_id) DO UPDATE SET actual_cash = EXCLUDED.actual_cash,
       expected_cash = EXCLUDED.expected_cash, difference = EXCLUDED.difference, note = EXCLUDED.note
     RETURNING *`,
    [day, expected.toFixed(2), actual.toFixed(2), diff.toFixed(2), note || '', req.user.id]
  );
  res.status(201).json({ closing: rows[0] });
});

const mine = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM daily_closings WHERE shopkeeper_id = $1 ORDER BY date DESC LIMIT 60',
    [req.user.id]
  );
  res.json({ closings: rows });
});

const all = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT d.*, u.full_name AS shopkeeper_name, r.full_name AS reviewer_name
     FROM daily_closings d
     LEFT JOIN users u ON u.id = d.shopkeeper_id
     LEFT JOIN users r ON r.id = d.reviewed_by
     ORDER BY d.date DESC LIMIT 200`
  );
  res.json({ closings: rows });
});

const review = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'UPDATE daily_closings SET reviewed_by = $1 WHERE id = $2 RETURNING *',
    [req.user.id, req.params.id]
  );
  if (!rows[0]) throw new ApiError(404, 'Closing not found');
  res.json({ closing: rows[0] });
});

const expected = asyncHandler(async (req, res) => {
  const day = req.query.date || new Date().toISOString().slice(0, 10);
  const who = req.user.role === 'ADMIN' && req.query.shopkeeper_id ? req.query.shopkeeper_id : req.user.id;
  res.json({ date: day, expected_cash: await expectedCash(who, day) });
});

module.exports = { submit, mine, all, review, expected };
