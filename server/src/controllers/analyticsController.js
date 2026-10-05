const { query } = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');

// Today's overview: revenue, COGS, gross, opex (approved only), net + alerts
const today = asyncHandler(async (req, res) => {
  const [{ rows: s }] = [await query(
    `SELECT COUNT(*)::int AS sales_count,
      COALESCE(SUM(total),0)::numeric(12,2) AS revenue,
      COALESCE(SUM(cogs),0)::numeric(12,2) AS cogs,
      COALESCE(SUM(gross_profit),0)::numeric(12,2) AS gross
     FROM sales WHERE created_at::date = CURRENT_DATE`
  )];
  const [{ rows: e }] = [await query(
    `SELECT COALESCE(SUM(amount),0)::numeric(12,2) AS opex
     FROM expenses WHERE status = 'approved' AND type = 'operating' AND date = CURRENT_DATE`
  )];
  const revenue = Number(s[0].revenue);
  const gross = Number(s[0].gross);
  const opex = Number(e[0].opex);
  const [{ rows: pay }] = [await query(
    `SELECT payment_method AS method, COUNT(*)::int AS sales, COALESCE(SUM(total),0)::numeric(12,2) AS revenue
     FROM sales WHERE created_at::date = CURRENT_DATE GROUP BY payment_method ORDER BY revenue DESC`
  )];
  const [{ rows: low }] = [await query(
    `SELECT id, name, unit, current_stock, reorder_level FROM products
     WHERE status = 'active' AND current_stock <= reorder_level ORDER BY current_stock ASC LIMIT 10`
  )];
  const [{ rows: exp }] = [await query(
    `SELECT id, name, current_stock, expiry_date, (expiry_date - CURRENT_DATE)::int AS days_left
     FROM products WHERE status = 'active' AND expiry_date IS NOT NULL
     AND expiry_date <= CURRENT_DATE + INTERVAL '30 days' ORDER BY expiry_date ASC LIMIT 10`
  )];
  const [{ rows: pend }] = [await query(
    `SELECT COUNT(*)::int AS c FROM expenses WHERE status = 'pending'`
  )];
  const [{ rows: dmg }] = [await query(
    `SELECT COUNT(*)::int AS c FROM damaged_stock WHERE reviewed = FALSE`
  )];
  res.json({
    salesCount: s[0].sales_count, revenue, cogs: Number(s[0].cogs), gross,
    opex, net: gross - opex, byPayment: pay,
    alerts: { lowStock: low, expiring: exp, pendingExpenses: pend[0].c, unreviewedDamage: dmg[0].c },
  });
});

// Series: ?range=7d|30d|6m — revenue, gross, opex, net per bucket
const series = asyncHandler(async (req, res) => {
  const range = req.query.range === '6m' ? '6m' : req.query.range === '7d' ? '7d' : '30d';
  let buckets;
  if (range === '6m') {
    const { rows } = await query(
      `SELECT to_char(d, 'YYYY-MM') AS label,
        (SELECT COALESCE(SUM(total),0) FROM sales WHERE date_trunc('month', created_at) = date_trunc('month', d))::numeric(12,2) AS revenue,
        (SELECT COALESCE(SUM(gross_profit),0) FROM sales WHERE date_trunc('month', created_at) = date_trunc('month', d))::numeric(12,2) AS gross,
        (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE status='approved' AND type='operating' AND date_trunc('month', date::timestamptz) = date_trunc('month', d))::numeric(12,2) AS opex
       FROM (SELECT date_trunc('month', CURRENT_DATE) - (INTERVAL '1 month' * g) AS d FROM generate_series(0,5) g) m
       ORDER BY label ASC`
    );
    buckets = rows.map((r) => ({ ...r, net: Number(r.gross) - Number(r.opex) }));
  } else {
    const days = range === '7d' ? 6 : 29;
    const { rows } = await query(
      `SELECT to_char(d, 'MM-DD') AS label,
        (SELECT COALESCE(SUM(total),0) FROM sales WHERE created_at::date = d)::numeric(12,2) AS revenue,
        (SELECT COALESCE(SUM(gross_profit),0) FROM sales WHERE created_at::date = d)::numeric(12,2) AS gross,
        (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE status='approved' AND type='operating' AND date = d)::numeric(12,2) AS opex
       FROM (SELECT CURRENT_DATE - g AS d FROM generate_series(0,$1) g) m ORDER BY d ASC`,
      [days]
    );
    buckets = rows.map((r) => ({ ...r, net: Number(r.gross) - Number(r.opex) }));
  }
  res.json({ range, series: buckets });
});

// Product profitability + 4 separate rankings
const products = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT p.id, p.name, p.unit, p.current_stock,
      COALESCE(SUM(si.quantity),0)::int AS units,
      COALESCE(SUM(si.line_total),0)::numeric(12,2) AS revenue,
      COALESCE(SUM(si.unit_cost * si.quantity),0)::numeric(12,2) AS cogs,
      (COALESCE(SUM(si.line_total),0) - COALESCE(SUM(si.unit_cost * si.quantity),0))::numeric(12,2) AS profit
     FROM products p LEFT JOIN sale_items si ON si.product_id = p.id
     LEFT JOIN sales s ON s.id = si.sale_id
     GROUP BY p.id ORDER BY profit DESC LIMIT 100`
  );
  const withMargin = rows.map((r) => ({ ...r, margin: Number(r.revenue) ? (Number(r.profit) / Number(r.revenue)) * 100 : 0 }));
  const by = (fn, n = 5) => [...withMargin].sort(fn).slice(0, n);
  res.json({
    table: withMargin,
    bestSelling: by((a, b) => b.units - a.units),
    highestRevenue: by((a, b) => Number(b.revenue) - Number(a.revenue)),
    mostProfitable: by((a, b) => Number(b.profit) - Number(a.profit)),
    slowMoving: withMargin.filter((r) => Number(r.units) <= 2 && Number(r.current_stock) > 0).slice(0, 5),
  });
});

const payments = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const params = [];
  let where = '1=1';
  if (from) { params.push(from); where += ` AND created_at::date >= $${params.length}`; }
  if (to) { params.push(to); where += ` AND created_at::date <= $${params.length}`; }
  const { rows } = await query(
    `SELECT payment_method AS method, COUNT(*)::int AS sales,
      COALESCE(SUM(total),0)::numeric(12,2) AS revenue,
      COALESCE(SUM(gross_profit),0)::numeric(12,2) AS profit
     FROM sales WHERE ${where} GROUP BY payment_method ORDER BY revenue DESC`,
    params
  );
  res.json({ breakdown: rows });
});

module.exports = { today, series, products, payments };
