const DAY_MS = 86400000;

// A debt is "due soon" when its promise date is within this many days.
const DUE_SOON_DAYS = 3;

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Dates are compared as 'YYYY-MM-DD' strings on purpose. Pulling them through
// node-postgres as JS Dates drags the process timezone into every comparison,
// which silently shifts a debt across the overdue boundary.
const toDateStr = (v) => {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const addDays = (dateStr, days) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return toDateStr(new Date(Date.UTC(y, m - 1, d + days)));
};

const ageDays = (date, now = Date.now()) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((now - d.getTime()) / DAY_MS));
};

// Allocate customer payments to the oldest outstanding credit sale first. This is
// the only honest way to age debt: a recent partial payment must not be treated
// as if it settled the oldest purchase.
//
// A credit sale raises (total - amount_paid): the part handed over at the till is
// stored on the sale row, never as a payment, so a down payment cannot be counted
// twice.
const allocateCredit = (sales, payments, now = Date.now()) => {
  const unpaid = (sales || [])
    .map((s) => {
      const total = toNumber(s.total);
      const amountPaid = toNumber(s.amount_paid);
      return {
        id: s.id,
        total,
        amount_paid: amountPaid,
        debt: Math.max(0, Number((total - amountPaid).toFixed(2))),
        created_at: s.created_at,
        due_date: toDateStr(s.due_date),
        remaining: Math.max(0, Number((total - amountPaid).toFixed(2))),
      };
    })
    .filter((s) => s.debt > 0)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const orderedPayments = (payments || [])
    .map((p) => ({ amount: toNumber(p.amount), created_at: p.created_at }))
    .filter((p) => p.amount > 0)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  for (const payment of orderedPayments) {
    let left = payment.amount;
    for (const sale of unpaid) {
      if (left <= 0) break;
      if (sale.remaining <= 0) continue;
      const applied = Math.min(sale.remaining, left);
      sale.remaining = Number((sale.remaining - applied).toFixed(2));
      left = Number((left - applied).toFixed(2));
    }
  }

  const allocations = unpaid.map((s) => ({ ...s, age_days: ageDays(s.created_at, now) }));
  const buckets = { d0_7: 0, d8_30: 0, over30: 0 };
  for (const a of allocations) {
    if (a.remaining <= 0) continue;
    if (a.age_days <= 7) buckets.d0_7 = Number((buckets.d0_7 + a.remaining).toFixed(2));
    else if (a.age_days <= 30) buckets.d8_30 = Number((buckets.d8_30 + a.remaining).toFixed(2));
    else buckets.over30 = Number((buckets.over30 + a.remaining).toFixed(2));
  }
  const outstanding = allocations.filter((a) => a.remaining > 0);
  const oldest = outstanding[0] || null;
  // The promise date that matters is the soonest one still unpaid.
  const dated = outstanding.filter((a) => a.due_date).sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
  const dueDate = dated.length ? dated[0].due_date : null;

  return {
    allocations,
    buckets,
    total_remaining: Number(outstanding.reduce((s, a) => s + a.remaining, 0).toFixed(2)),
    oldest_unpaid: oldest,
    due_date: dueDate,
  };
};

// paid / owing / due_soon / overdue. A debt with no due date is never overdue.
const debtStatus = ({ total_remaining: remaining, due_date: dueDate }, today) => {
  if (remaining <= 0) return 'paid';
  if (!dueDate || !today) return 'owing';
  if (dueDate < today) return 'overdue';
  if (dueDate <= addDays(today, DUE_SOON_DAYS)) return 'due_soon';
  return 'owing';
};

const parsePaymentAmount = (details) => {
  try {
    const data = typeof details === 'string' ? JSON.parse(details) : details;
    return toNumber(data && data.amount);
  } catch {
    return 0;
  }
};

const creditSalesQuery = `
  SELECT id, total, amount_paid, created_at, due_date::text AS due_date
  FROM sales
  WHERE customer_id = $1 AND payment_method = 'Credit'
  ORDER BY created_at ASC
`;

const creditPaymentsQuery = `
  SELECT created_at, details
  FROM activity_log
  WHERE action = 'credit.payment' AND entity = 'customer' AND entity_id = $1
  ORDER BY created_at ASC
`;

const getCustomerCreditState = async (db, customerId, now = Date.now()) => {
  const { rows: customerRows } = await db.query('SELECT * FROM shop_customers WHERE id = $1', [customerId]);
  const customer = customerRows[0];
  if (!customer) return null;
  const { rows: sales } = await db.query(creditSalesQuery, [customerId]);
  const { rows: paymentRows } = await db.query(creditPaymentsQuery, [String(customerId)]);
  const payments = paymentRows.map((p) => ({ amount: parsePaymentAmount(p.details), created_at: p.created_at }));
  const allocation = allocateCredit(sales, payments, now);
  // Ask the database for "today" so status never disagrees with CURRENT_DATE
  // used elsewhere in the reports.
  const { rows: todayRows } = await db.query('SELECT CURRENT_DATE::text AS d');
  const today = todayRows[0].d;
  const status = debtStatus(allocation, today);
  return {
    customer: {
      ...customer,
      balance: toNumber(customer.balance),
    },
    ...allocation,
    status,
    overdue: status === 'overdue',
  };
};

module.exports = { allocateCredit, getCustomerCreditState, debtStatus, toDateStr, DUE_SOON_DAYS };