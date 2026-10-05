// Read-only business facts for the AI assistant. Every function here only
// SELECTs. Gemini never sees SQL and never touches the database directly --
// the controller calls these, then hands the verified results to Gemini for
// explanation. Date boundaries reuse the same CURRENT_DATE conventions as the
// existing reports so AI answers can never disagree with them.
const { query } = require('../db/pool');
const { getCustomerCreditState } = require('../utils/credit');

const num = (v) => Number(v || 0);

// Presets resolved against the database clock: today, yesterday, this_week
// (Mon-Sun), this_month, last_week, last_month. Returns { start, end } as
// YYYY-MM-DD strings.
const resolveRange = async (preset) => {
  const { rows } = await query(`SELECT CURRENT_DATE::text AS today,
    date_trunc('week', CURRENT_DATE)::date::text AS week_start,
    date_trunc('month', CURRENT_DATE)::date::text AS month_start`);
  const t = rows[0].today;
  const addDays = (d, n) => {
    const [y, m, day] = d.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, day + n));
    return dt.toISOString().slice(0, 10);
  };
  switch (preset) {
    case 'yesterday': return { start: addDays(t, -1), end: addDays(t, -1), label: 'yesterday' };
    case 'this_week': return { start: rows[0].week_start, end: t, label: 'this week' };
    case 'this_month': return { start: rows[0].month_start, end: t, label: 'this month' };
    case 'last_week': return { start: addDays(rows[0].week_start, -7), end: addDays(rows[0].week_start, -1), label: 'last week' };
    case 'last_month': {
      const [y, m] = rows[0].month_start.split('-').map(Number);
      const prev = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
      return { start: prev, end: addDays(rows[0].month_start, -1), label: 'last month' };
    }
    default: return { start: t, end: t, label: 'today' };
  }
};

const PM = ['Cash', 'M-Pesa', 'Airtel Money', 'Mixx by Yas', 'HaloPesa', 'Bank', 'Credit'];

const salesSummary = async (start, end) => {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(total),0)::numeric(12,2) AS revenue,
            COALESCE(SUM(cogs),0)::numeric(12,2) AS cogs, COALESCE(SUM(gross_profit),0)::numeric(12,2) AS gross
     FROM sales WHERE created_at::date >= $1::date AND created_at::date <= $2::date`,
    [start, end]
  );
  const r = rows[0];
  return { count: r.count, revenue: num(r.revenue), cogs: num(r.cogs), gross: num(r.gross) };
};

const salesByPayment = async (start, end) => {
  const { rows } = await query(
    `SELECT payment_method, COUNT(*)::int AS count, COALESCE(SUM(total),0)::numeric(12,2) AS revenue
     FROM sales WHERE created_at::date >= $1::date AND created_at::date <= $2::date
     GROUP BY payment_method ORDER BY revenue DESC`,
    [start, end]
  );
  return rows.map((x) => ({ method: x.payment_method, count: x.count, revenue: num(x.revenue) }));
};

const topProducts = async (start, end, limit = 8) => {
  const { rows } = await query(
    `SELECT p.name, COALESCE(SUM(si.quantity),0)::int AS units,
            COALESCE(SUM(si.line_total),0)::numeric(12,2) AS revenue,
            COALESCE(SUM(si.quantity * (si.unit_price - si.unit_cost)),0)::numeric(12,2) AS profit
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     LEFT JOIN products p ON p.id = si.product_id
     WHERE s.created_at::date >= $1::date AND s.created_at::date <= $2::date
     GROUP BY p.name ORDER BY revenue DESC LIMIT $3`,
    [start, end, limit]
  );
  return rows.map((x) => ({ name: x.name || 'Item', units: x.units, revenue: num(x.revenue), profit: num(x.profit) }));
};

const productPerformance = async (limit = 8) => {
  const { rows } = await query(
    `SELECT p.name, p.current_stock, p.selling_price,
            COALESCE(SUM(si.quantity),0)::int AS units_30d,
            COALESCE(SUM(si.line_total),0)::numeric(12,2) AS revenue_30d
     FROM products p LEFT JOIN sale_items si ON si.product_id = p.id
     LEFT JOIN sales s ON s.id = si.sale_id AND s.created_at >= CURRENT_DATE - INTERVAL '30 days'
     WHERE p.status = 'active' GROUP BY p.id ORDER BY revenue_30d DESC LIMIT $1`,
    [limit]
  );
  return rows.map((x) => ({
    name: x.name, stock: Number(x.current_stock), price: num(x.selling_price),
    units_30d: x.units_30d, revenue_30d: num(x.revenue_30d),
  }));
};

const slowProducts = async (limit = 8) => {
  const { rows } = await query(
    `SELECT p.name, p.current_stock, COALESCE(SUM(si.quantity),0)::int AS units_30d
     FROM products p LEFT JOIN sale_items si ON si.product_id = p.id
     LEFT JOIN sales s ON s.id = si.sale_id AND s.created_at >= CURRENT_DATE - INTERVAL '30 days'
     WHERE p.status = 'active' AND p.current_stock > 0
     GROUP BY p.id ORDER BY units_30d ASC, p.current_stock DESC LIMIT $1`,
    [limit]
  );
  return rows.map((x) => ({ name: x.name, stock: Number(x.current_stock), units_30d: x.units_30d }));
};

const lowStock = async (limit = 15) => {
  const { rows } = await query(
    `SELECT name, current_stock, reorder_level, unit FROM products
     WHERE status = 'active' AND current_stock > 0 AND current_stock <= reorder_level
     ORDER BY current_stock ASC LIMIT $1`,
    [limit]
  );
  return rows;
};

const outOfStock = async (limit = 15) => {
  const { rows } = await query(
    `SELECT name, unit FROM products WHERE status = 'active' AND current_stock <= 0 ORDER BY name LIMIT $1`,
    [limit]
  );
  return rows;
};

const expiring = async (limit = 15) => {
  const { rows } = await query(
    `SELECT name, current_stock, expiry_date::text AS expiry_date,
            (expiry_date - CURRENT_DATE)::int AS days_left
     FROM products WHERE status = 'active' AND expiry_date IS NOT NULL
       AND expiry_date <= CURRENT_DATE + INTERVAL '30 days'
     ORDER BY expiry_date ASC LIMIT $1`,
    [limit]
  );
  return rows;
};

const productStock = async (nameQuery, limit = 5) => {
  const { rows } = await query(
    `SELECT name, current_stock, reorder_level, unit, bundle_qty, selling_price,
            expiry_date::text AS expiry_date
     FROM products WHERE status = 'active' AND name ILIKE '%' || $1 || '%'
     ORDER BY current_stock ASC LIMIT $2`,
    [String(nameQuery || '').slice(0, 60), limit]
  );
  return rows.map((x) => ({
    name: x.name, stock: Number(x.current_stock), min_stock: Number(x.reorder_level),
    unit: x.unit, pack_size: Number(x.bundle_qty), price: num(x.selling_price), expiry: x.expiry_date,
  }));
};

const expensesSummary = async (start, end) => {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount),0)::numeric(12,2) AS total
     FROM expenses WHERE status = 'approved' AND type = 'operating'
       AND date >= $1::date AND date <= $2::date`,
    [start, end]
  );
  return { count: rows[0].count, total: num(rows[0].total) };
};

const expensesByCategory = async (start, end, limit = 8) => {
  const { rows } = await query(
    `SELECT c.name AS category, COALESCE(SUM(e.amount),0)::numeric(12,2) AS total
     FROM expenses e LEFT JOIN expense_categories c ON c.id = e.category_id
     WHERE e.status = 'approved' AND e.type = 'operating'
       AND e.date >= $1::date AND e.date <= $2::date
     GROUP BY c.name ORDER BY total DESC LIMIT $1`,
    [limit, start, end]
  );
  return rows.map((x) => ({ category: x.category || 'Uncategorised', total: num(x.total) }));
};

const profitSummary = async (start, end) => {
  const s = await salesSummary(start, end);
  const e = await expensesSummary(start, end);
  return { ...s, opex: e.total, net: Number((s.gross - e.total).toFixed(2)) };
};

const customerStates = async () => {
  const { rows } = await query('SELECT id FROM shop_customers ORDER BY created_at DESC');
  // Independent per-customer states — resolve concurrently (sequential loops
  // crawl on hosted databases where each round trip costs real latency).
  const settled = await Promise.all(rows.map((c) => getCustomerCreditState({ query }, c.id)));
  return settled.filter(Boolean);
};

const debtOverview = async (limit = 8) => {
  const states = await customerStates();
  const owing = states.filter((s) => s.total_remaining > 0);
  const sum = (l) => Number(l.reduce((a, x) => a + x.total_remaining, 0).toFixed(2));
  return {
    outstanding: sum(owing),
    customers_owing: owing.length,
    overdue: owing.filter((s) => s.status === 'overdue').length,
    overdue_amount: sum(owing.filter((s) => s.status === 'overdue')),
    due_soon_amount: sum(owing.filter((s) => s.status === 'due_soon')),
    top_debtors: owing
      .sort((a, b) => b.total_remaining - a.total_remaining)
      .slice(0, limit)
      .map((s) => ({
        name: s.customer.name, phone: s.customer.phone || '',
        outstanding: s.total_remaining, due_date: s.due_date, status: s.status,
      })),
  };
};

const customerDebt = async (nameQuery) => {
  const { rows } = await query(
    `SELECT id, name, phone FROM shop_customers WHERE name ILIKE '%' || $1 || '%' ORDER BY name LIMIT 3`,
    [String(nameQuery || '').slice(0, 60)]
  );
  if (!rows.length) return { found: false };
  const st = await getCustomerCreditState({ query }, rows[0].id);
  if (!st) return { found: false };
  return {
    found: true,
    name: st.customer.name,
    phone: st.customer.phone || '',
    outstanding: st.total_remaining,
    due_date: st.due_date,
    status: st.status,
  };
};

const restockPriority = async (limit = 8) => {
  const { rows } = await query(
    `SELECT p.name, p.current_stock, p.reorder_level, p.unit,
            COALESCE(SUM(si.quantity),0)::int AS units_30d
     FROM products p LEFT JOIN sale_items si ON si.product_id = p.id
     LEFT JOIN sales s ON s.id = si.sale_id AND s.created_at >= CURRENT_DATE - INTERVAL '30 days'
     WHERE p.status = 'active' AND (p.current_stock <= 0 OR p.current_stock <= p.reorder_level)
     GROUP BY p.id ORDER BY p.current_stock ASC LIMIT $1`,
    [limit]
  );
  return rows.map((x) => ({
    name: x.name, stock: Number(x.current_stock), min_stock: Number(x.reorder_level),
    unit: x.unit, units_30d: x.units_30d,
  }));
};

const businessSummary = async () => {
  const t = await resolveRange('today');
  const [sales, opex, low, out, debt, top, slow] = await Promise.all([
    salesSummary(t.start, t.end),
    expensesSummary(t.start, t.end),
    lowStock(8),
    outOfStock(8),
    debtOverview(5),
    topProducts(t.start, t.end, 5),
    slowProducts(5),
  ]);
  return {
    date: t.start,
    revenue: sales.revenue, sales_count: sales.count, cogs: sales.cogs, gross: sales.gross,
    expenses: opex.total, net: Number((sales.gross - opex.total).toFixed(2)),
    low_stock: low.map((x) => ({ name: x.name, stock: Number(x.current_stock) })),
    out_of_stock: out.map((x) => x.name),
    debt_outstanding: debt.outstanding, customers_owing: debt.customers_owing,
    overdue_amount: debt.overdue_amount,
    top_products: top.map((x) => ({ name: x.name, units: x.units, revenue: x.revenue })),
    slow_products: slow.map((x) => ({ name: x.name, units_30d: x.units_30d })),
  };
};

module.exports = {
  PM,
  resolveRange,
  salesSummary,
  salesByPayment,
  topProducts,
  productPerformance,
  slowProducts,
  lowStock,
  outOfStock,
  expiring,
  productStock,
  expensesSummary,
  expensesByCategory,
  profitSummary,
  debtOverview,
  customerDebt,
  restockPriority,
  businessSummary,
};
