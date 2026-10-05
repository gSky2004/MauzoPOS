const { ApiError } = require('./ApiError');
const { getCustomerCreditState } = require('./credit');
const { getReplenishment } = require('./replenishment');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;
const DETAIL_LIMIT = 2000;

const parseDate = (s, label) => {
  if (!s || !DATE_RE.test(s)) throw new ApiError(422, `${label} date must be YYYY-MM-DD`);
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new ApiError(422, `${label} date is not a real calendar date`);
  }
  return s;
};

const parseSections = (raw) => {
  const all = ['sales', 'credit', 'replenishment'];
  if (!raw) return all;
  const picked = String(raw).split(',').map((s) => s.trim().toLowerCase()).filter((s) => all.includes(s));
  if (!picked.length) throw new ApiError(422, 'No valid report sections requested');
  return [...new Set(picked)];
};

// Shared by the PDF download so the report math has a single home.
const getRangeReport = async (db, { start, end, sections: rawSections, generatedBy }) => {
  const s = parseDate(start, 'Start');
  const e = parseDate(end, 'End');
  if (e < s) throw new ApiError(422, 'End date cannot be before start date');
  const spanDays = Math.round((new Date(`${e}T00:00:00Z`) - new Date(`${s}T00:00:00Z`)) / 86400000) + 1;
  if (spanDays > MAX_RANGE_DAYS) throw new ApiError(422, `Date range is limited to ${MAX_RANGE_DAYS} days`);
  const sections = parseSections(rawSections);

  const data = { start: s, end: e, spanDays, sections, generatedBy: generatedBy || '—', generatedAt: new Date() };

  if (sections.includes('sales')) {
    const { rows: sum } = await db.query(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(total),0)::numeric(12,2) AS rev,
        COALESCE(SUM(cogs),0)::numeric(12,2) AS cogs,
        COALESCE(SUM(gross_profit),0)::numeric(12,2) AS gross
       FROM sales WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')`,
      [s, e]
    );
    const { rows: pay } = await db.query(
      `SELECT payment_method, COUNT(*)::int AS n, COALESCE(SUM(total),0)::numeric(12,2) AS rev
       FROM sales WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')
       GROUP BY payment_method ORDER BY rev DESC`,
      [s, e]
    );
    const { rows: exp } = await db.query(
      `SELECT COALESCE(SUM(amount),0)::numeric(12,2) AS opex
       FROM expenses WHERE status = 'approved' AND type = 'operating' AND date >= $1::date AND date <= $2::date`,
      [s, e]
    );
    const { rows: detail } = await db.query(
      `SELECT sa.id, sa.created_at, sa.payment_method, sa.reference, sa.total, sa.gross_profit,
        u.full_name AS shopkeeper_name, c.name AS customer_name,
        (SELECT COALESCE(SUM(si.quantity),0)::int FROM sale_items si WHERE si.sale_id = sa.id) AS units
       FROM sales sa
       LEFT JOIN users u ON u.id = sa.shopkeeper_id
       LEFT JOIN shop_customers c ON c.id = sa.customer_id
       WHERE sa.created_at >= $1::date AND sa.created_at < ($2::date + INTERVAL '1 day')
       ORDER BY sa.created_at DESC LIMIT $3`,
      [s, e, DETAIL_LIMIT]
    );
    const gross = Number(sum[0].gross);
    const opex = Number(exp[0].opex);
    data.sales = {
      count: sum[0].n,
      revenue: Number(sum[0].rev),
      cogs: Number(sum[0].cogs),
      gross,
      opex,
      net: gross - opex,
      byPayment: pay.map((p) => ({ method: p.payment_method, count: p.n, revenue: Number(p.rev) })),
      detail: detail.map((d) => ({
        ...d,
        total: Number(d.total),
        gross_profit: Number(d.gross_profit),
      })),
      truncated: detail.length >= DETAIL_LIMIT,
    };
  }

  if (sections.includes('credit')) {
    const { rows: issued } = await db.query(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(total),0)::numeric(12,2) AS amt
       FROM sales WHERE payment_method = 'Credit'
         AND created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')`,
      [s, e]
    );
    const { rows: payRows } = await db.query(
      `SELECT created_at, details FROM activity_log
       WHERE action = 'credit.payment'
         AND created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')
       ORDER BY created_at ASC`,
      [s, e]
    );
    let collected = 0;
    const collections = [];
    for (const p of payRows) {
      let amount = 0;
      try {
        const details = typeof p.details === 'string' ? JSON.parse(p.details) : p.details;
        amount = Number(details && details.amount) || 0;
      } catch { amount = 0; }
      collected += amount;
      collections.push({ created_at: p.created_at, amount });
    }
    const { rows: customers } = await db.query('SELECT id FROM shop_customers ORDER BY created_at DESC');
    const states = [];
    for (const c of customers) {
      const state = await getCustomerCreditState(db, c.id);
      if (state) states.push(state);
    }
    const owing = states.filter((x) => x.total_remaining > 0);
    const overdue = states.filter((x) => x.overdue);
    data.credit = {
      issuedCount: issued[0].n,
      issuedAmount: Number(issued[0].amt),
      collected: Number(collected.toFixed(2)),
      collections,
      customers: states,
      owingCount: owing.length,
      overdueCount: overdue.length,
      outstanding: Number(owing.reduce((t, x) => t + x.total_remaining, 0).toFixed(2)),
      overdueAmount: Number(overdue.reduce((t, x) => t + x.total_remaining, 0).toFixed(2)),
    };
  }

  if (sections.includes('replenishment')) {
    data.replenishment = await getReplenishment(db, { days: 30, safety: 7, leadDefault: 3 });
  }

  return data;
};

module.exports = { getRangeReport };
