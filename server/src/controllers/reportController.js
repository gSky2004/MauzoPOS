const { query } = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { getRangeReport } = require('../utils/rangeReport');
const { buildPdf, money } = require('../utils/pdf');

const tzs = (n) => `TZS ${Number(n || 0).toLocaleString('en-US')}`;

const daily = asyncHandler(async (req, res) => {
  const day = req.query.date || new Date().toISOString().slice(0, 10);
  const { rows: s } = await query(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(total),0) AS rev, COALESCE(SUM(gross_profit),0) AS gross
     FROM sales WHERE created_at::date = $1::date`, [day]);
  const { rows: e } = await query(
    `SELECT COALESCE(SUM(amount),0) AS opex FROM expenses WHERE status='approved' AND type='operating' AND date = $1::date`, [day]);
  const { rows: pay } = await query(
    `SELECT payment_method, COALESCE(SUM(total),0) AS rev FROM sales WHERE created_at::date = $1::date GROUP BY payment_method`, [day]);
  const net = Number(s[0].gross) - Number(e[0].opex);
  const lines = [
    `🏪 M&E Pub — Daily Report (${day})`,
    `Sales: ${s[0].n} · Revenue: ${tzs(s[0].rev)}`,
    `Gross profit: ${tzs(s[0].gross)} · Expenses: ${tzs(e[0].opex)}`,
    `Net profit: ${tzs(net)}`,
    ...pay.map((p) => `· ${p.payment_method}: ${tzs(p.rev)}`),
  ];
  res.json({ date: day, text: lines.join('\n') });
});

const stockAlert = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT name, current_stock, reorder_level FROM products WHERE status='active' AND current_stock <= reorder_level ORDER BY current_stock ASC LIMIT 30`);
  const lines = ['⚠️ STOCK ALERT', ...(rows.length ? rows.map((r) => `· ${r.name}: ${r.current_stock} left (reorder ${r.reorder_level})`) : ['All stocked ✓'])];
  res.json({ text: lines.join('\n') });
});

const expiryAlert = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT name, expiry_date, (expiry_date - CURRENT_DATE)::int AS d FROM products
     WHERE status='active' AND expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE + INTERVAL '30 days' ORDER BY expiry_date ASC LIMIT 30`);
  const lines = ['⏳ EXPIRY ALERT', ...(rows.length ? rows.map((r) => `· ${r.name}: ${r.d < 0 ? 'EXPIRED' : r.d + 'd left'} (${String(r.expiry_date).slice(0, 10)})`) : ['Nothing expiring ✓'])];
  res.json({ text: lines.join('\n') });
});

const summary = asyncHandler(async (req, res) => {
  const { rows: s } = await query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(total),0) AS rev, COALESCE(SUM(gross_profit),0) AS gross FROM sales WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'`);
  const { rows: e } = await query(`SELECT COALESCE(SUM(amount),0) AS opex FROM expenses WHERE status='approved' AND type='operating' AND date >= CURRENT_DATE - 30`);
  const { rows: low } = await query(`SELECT COUNT(*)::int AS c FROM products WHERE status='active' AND current_stock <= reorder_level`);
  const lines = ['🏪 M&E Pub — 30-Day Summary', `Sales: ${s[0].n} · Revenue: ${tzs(s[0].rev)}`, `Gross: ${tzs(s[0].gross)} · Expenses: ${tzs(e[0].opex)}`, `Net: ${tzs(Number(s[0].gross) - Number(e[0].opex))}`, `Low-stock items: ${low[0].c}`];
  res.json({ text: lines.join('\n') });
});

// GET /api/pos/reports/range.pdf — official downloadable report for an
// admin-selected period. Sections: sales,credit,replenishment (comma list).
const rangePdf = asyncHandler(async (req, res) => {
  const report = await getRangeReport({ query }, {
    start: req.query.start,
    end: req.query.end,
    sections: req.query.sections,
    generatedBy: req.user.full_name || req.user.email || 'Admin',
  });

  const buffer = await buildPdf({
    title: 'M&E Pub — Business Report',
    subtitle: `Period: ${report.start} to ${report.end} (${report.spanDays} day${report.spanDays === 1 ? '' : 's'})`,
    meta: [
      `Generated: ${report.generatedAt.toLocaleString()} · By: ${report.generatedBy}`,
      'Outstanding balances are current balances; sales and collections cover the selected period.',
    ],
    draw: ({ doc, table, section, kpis }) => {
      if (report.sales) {
        const s = report.sales;
        section(doc, '1 · Sales and profit');
        kpis(doc, [
          ['Sales', String(s.count)],
          ['Revenue', money(s.revenue)],
          ['COGS', money(s.cogs)],
          ['Gross profit', money(s.gross)],
          ['Operating expenses', money(s.opex)],
          ['Net profit', money(s.net)],
        ]);
        section(doc, 'Revenue by payment method');
        table(doc, [
          { key: 'method', label: 'Method', width: 260 },
          { key: 'count', label: 'Sales', width: 120, align: 'right' },
          { key: 'revenue', label: 'Revenue', width: 200, align: 'right' },
        ], s.byPayment.map((p) => ({ ...p, revenue: money(p.revenue) })));
        section(doc, 'Sale transactions');
        table(doc, [
          { key: 'date', label: 'Date', width: 130 },
          { key: 'shopkeeper', label: 'Shopkeeper', width: 150 },
          { key: 'customer', label: 'Customer', width: 130 },
          { key: 'method', label: 'Method', width: 110 },
          { key: 'units', label: 'Qty', width: 60, align: 'right' },
          { key: 'total', label: 'Total', width: 130, align: 'right' },
          { key: 'profit', label: 'Profit', width: 130, align: 'right' },
        ], s.detail.map((d) => ({
          date: new Date(d.created_at).toLocaleDateString(),
          shopkeeper: d.shopkeeper_name || '—',
          customer: d.customer_name || '—',
          method: d.payment_method,
          units: d.units,
          total: money(d.total),
          profit: money(d.gross_profit),
        })));
        if (s.truncated) {
          doc.font('Helvetica-Oblique').fontSize(9).fillColor('#b45309')
            .text('Detail limited to the 2,000 most recent sales; summary totals cover the full period.');
          doc.moveDown(0.6);
        }
      }

      if (report.credit) {
        const c = report.credit;
        section(doc, '2 · Debt and collections');
        kpis(doc, [
          ['Credit issued', `${c.issuedCount} sales · ${money(c.issuedAmount)}`],
          ['Collected in period', money(c.collected)],
          ['Customers owing', `${c.owingCount} · ${money(c.outstanding)}`],
          ['Overdue', `${c.overdueCount} · ${money(c.overdueAmount)}`],
        ]);
        table(doc, [
          { key: 'name', label: 'Customer', width: 180 },
          { key: 'phone', label: 'Phone', width: 130 },
          { key: 'owed', label: 'Outstanding', width: 130, align: 'right' },
          { key: 'due', label: 'Due date', width: 100 },
          { key: 'aging', label: '0–7 / 8–30 / 30+d', width: 200, align: 'right' },
          { key: 'status', label: 'Status', width: 100 },
        ], c.customers.filter((x) => x.total_remaining > 0).map((x) => ({
          name: x.customer.name,
          phone: x.customer.phone || '—',
          owed: money(x.total_remaining),
          due: x.due_date ? x.due_date : '—',
          aging: `${money(x.buckets.d0_7)} / ${money(x.buckets.d8_30)} / ${money(x.buckets.over30)}`,
          status: (x.status === 'overdue' ? 'OVERDUE' : x.status === 'due_soon' ? 'DUE SOON' : 'OWING'),
        })));
      }

      if (report.replenishment) {
        const r = report.replenishment;
        section(doc, '3 · Replenishment snapshot (current stock, trailing 30-day sales)');
        kpis(doc, [
          ['Products needing attention', String(r.needs)],
          ['Basis', `Trailing ${r.days}d sales · ${r.safety}d safety cover`],
        ]);
        const rows = r.items.filter((i) => i.suggested_units > 0 || ['OUT', 'LOW', 'EXPIRY_RISK'].includes(i.status));
        table(doc, [
          { key: 'name', label: 'Product', width: 220 },
          { key: 'stock', label: 'Stock', width: 80, align: 'right' },
          { key: 'velocity', label: 'Sales/day', width: 100, align: 'right' },
          { key: 'cover', label: 'Cover', width: 80, align: 'right' },
          { key: 'suggest', label: 'Suggest', width: 150 },
          { key: 'status', label: 'Status', width: 110 },
          { key: 'reason', label: 'Why', width: 220 },
        ], rows.map((i) => ({
          name: i.name,
          stock: i.current_stock,
          velocity: i.avg_daily,
          cover: i.days_cover === null ? '—' : `${i.days_cover}d`,
          suggest: i.suggested_units > 0 ? `${i.suggested_units} units (${i.suggested_packs} packs)` : '—',
          status: i.status,
          reason: (i.reason || '').slice(0, 120),
        })));
      }
    },
  });

  const filename = `mauzopos-report-${report.start}_to_${report.end}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
});

module.exports = { daily, stockAlert, expiryAlert, summary, rangePdf };
