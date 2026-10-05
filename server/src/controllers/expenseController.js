const { query, transaction } = require('../db/pool');
const { ApiError } = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const params = [];
  let where = '1=1';
  if (req.user.role !== 'ADMIN') { params.push(req.user.id); where += ` AND e.created_by = $${params.length}`; }
  const { rows } = await query(
    `SELECT e.*, c.name AS category_name, u.full_name AS creator_name
     FROM expenses e
     LEFT JOIN expense_categories c ON c.id = e.category_id
     LEFT JOIN users u ON u.id = e.created_by
     WHERE ${where} ORDER BY e.date DESC, e.created_at DESC LIMIT 200`,
    params
  );
  res.json({ expenses: rows });
});

// Guard against dates like 2026-02-31 that would otherwise reach Postgres and
// surface as an opaque 500.
const isCalendarDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

const checkCategory = async (category_id) => {
  const { rows } = await query('SELECT id FROM expense_categories WHERE id = $1', [category_id]);
  if (!rows[0]) throw new ApiError(422, 'Unknown category');
};

// There is no approval workflow: every expense is an operating cost the moment
// it is recorded. type/status are still written for the old rows and the
// reports, which count status='approved' AND type='operating'.
const create = asyncHandler(async (req, res) => {
  const { category_id, amount, date, note } = req.body;
  const amt = Number(amount);
  if (!category_id) throw new ApiError(422, 'Category is required');
  if (!amt || amt <= 0) throw new ApiError(422, 'Amount must be positive');
  await checkCategory(category_id);
  // An explicit date is the owner's local calendar day and is stored as-is.
  // When omitted, CURRENT_DATE comes from the database so "today" can never
  // disagree with the summaries and reports that also use CURRENT_DATE.
  let day = null;
  if (date) {
    day = String(date).slice(0, 10);
    if (!isCalendarDate(day)) throw new ApiError(422, 'Invalid date');
  }

  const receiptPhoto = (req.file && `/uploads/${req.file.filename}`) || null;

  const { rows } = await query(
    `INSERT INTO expenses (type, category_id, amount, date, note, receipt_photo, created_by, status)
     VALUES ('operating',$1,$2,COALESCE($3::date, CURRENT_DATE),$4,$5,$6,'approved') RETURNING *`,
    [category_id, amt.toFixed(2), day, String(note || '').trim().slice(0, 500), receiptPhoto, req.user.id]
  );

  await query(
    `INSERT INTO activity_log (actor_id, action, entity, entity_id, details)
     VALUES ($1,'expense.recorded','expense',$2,$3)`,
    [req.user.id, rows[0].id, JSON.stringify({ amount: amt })]
  ).catch(() => {});

  res.status(201).json({ expense: rows[0] });
});

// Admins may fix any expense; everyone else only their own. Old pending rows
// from the approval era stay visible but can still be corrected or removed.
const loadOwned = async (id, user) => {
  const { rows } = await query('SELECT * FROM expenses WHERE id = $1', [id]);
  if (!rows[0]) throw new ApiError(404, 'Expense not found');
  if (user.role !== 'ADMIN' && String(rows[0].created_by) !== String(user.id)) {
    throw new ApiError(403, 'You can only change expenses you recorded');
  }
  return rows[0];
};

const update = asyncHandler(async (req, res) => {
  await loadOwned(req.params.id, req.user);
  const { category_id, amount, date, note } = req.body;
  const amt = Number(amount);
  if (!category_id) throw new ApiError(422, 'Category is required');
  if (!amt || amt <= 0) throw new ApiError(422, 'Amount must be positive');
  await checkCategory(category_id);
  let day = null;
  if (date) {
    day = String(date).slice(0, 10);
    if (!isCalendarDate(day)) throw new ApiError(422, 'Invalid date');
  }
  const { rows } = await query(
    `UPDATE expenses SET category_id = $1, amount = $2, date = COALESCE($3::date, date), note = $4 WHERE id = $5 RETURNING *`,
    [category_id, amt.toFixed(2), day, String(note || '').trim().slice(0, 500), req.params.id]
  );
  await query(
    `INSERT INTO activity_log (actor_id, action, entity, entity_id, details)
     VALUES ($1,'expense.updated','expense',$2,$3)`,
    [req.user.id, rows[0].id, JSON.stringify({ amount: amt })]
  ).catch(() => {});
  res.json({ expense: rows[0] });
});

// Deleting an expense changes net profit, so it is audit-logged.
const destroy = asyncHandler(async (req, res) => {
  const existing = await loadOwned(req.params.id, req.user);
  await query('DELETE FROM expenses WHERE id = $1', [req.params.id]);
  await query(
    `INSERT INTO activity_log (actor_id, action, entity, entity_id, details)
     VALUES ($1,'expense.deleted','expense',$2,$3)`,
    [req.user.id, req.params.id, JSON.stringify({ amount: Number(existing.amount), date: existing.date })]
  ).catch(() => {});
  res.status(204).end();
});

// Today / this week (Mon-Sun) / this month, same approved+operating rule the
// PDF reports use so the cards and the reports can never disagree.
const summary = asyncHandler(async (req, res) => {
  const params = [];
  let scope = `status = 'approved' AND type = 'operating'`;
  if (req.user.role !== 'ADMIN') { params.push(req.user.id); scope += ` AND created_by = $${params.length}`; }
  const { rows } = await query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE date = CURRENT_DATE),0)::numeric(12,2) AS today,
       COALESCE(SUM(amount) FILTER (WHERE date >= date_trunc('week', CURRENT_DATE)::date),0)::numeric(12,2) AS week,
       COALESCE(SUM(amount) FILTER (WHERE date >= date_trunc('month', CURRENT_DATE)::date),0)::numeric(12,2) AS month
     FROM expenses WHERE ${scope}`,
    params
  );
  res.json({ summary: rows[0] });
});

const categories = asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM expense_categories ORDER BY name ASC');
  res.json({ categories: rows });
});

const createCategory = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) throw new ApiError(422, 'Category name is required');
  const { rows } = await query(
    'INSERT INTO expense_categories (name, created_by) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING RETURNING *',
    [String(name).trim(), req.user.id]
  );
  if (!rows[0]) throw new ApiError(409, 'Category already exists');
  res.status(201).json({ category: rows[0] });
});

module.exports = { list, create, update, destroy, summary, categories, createCategory };
