const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

const POS_TABLES = [
  'suppliers',
  'stock_movements',
  'stock_receipts',
  'sales',
  'sale_items',
  'expense_categories',
  'expenses',
  'damaged_stock',
  'shop_customers',
  'daily_closings',
  'activity_log',
  'restock_requests',
];

const setup = async () => {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('[db] Applying base schema...');
  await pool.query(schema);
  console.log('[db] Base schema ready.');

  // The POS tables live in the phase-1 migration, not schema.sql. Without this
  // a fresh `db:setup` produces a database the POS app cannot run against at all.
  const migration = fs.readFileSync(path.join(__dirname, 'migrate_pos_phase1.sql'), 'utf8');
  console.log('[db] Applying POS phase-1 migration...');
  await pool.query(migration);
  console.log('[db] POS phase-1 migration ready.');

  const migration2 = fs.readFileSync(path.join(__dirname, 'migrate_pos_phase2.sql'), 'utf8');
  console.log('[db] Applying POS phase-2 migration...');
  await pool.query(migration2);
  console.log('[db] POS phase-2 migration ready.');

  const migration3 = fs.readFileSync(path.join(__dirname, 'migrate_pos_phase3.sql'), 'utf8');
  console.log('[db] Applying POS phase-3 migration (debt due dates)...');
  await pool.query(migration3);
  console.log('[db] POS phase-3 migration ready.');

  // Verify rather than assume -- a silent partial migration is far worse than a
  // loud failure here, because the app would fail later on a user request.
  const missing = [];
  for (const t of POS_TABLES) {
    const { rows } = await pool.query('SELECT to_regclass($1) AS t', [`public.${t}`]);
    if (!rows[0].t) missing.push(t);
  }
  if (missing.length) {
    throw new Error(`POS tables missing after setup: ${missing.join(', ')}`);
  }
  console.log(`[db] Verified ${POS_TABLES.length} POS tables.`);
  const { rows: cols } = await pool.query(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND ((table_name = 'shop_customers' AND column_name IN ('credit_limit', 'credit_terms_days'))
         OR (table_name = 'suppliers' AND column_name = 'lead_time_days')
         OR (table_name = 'sales' AND column_name IN ('due_date', 'amount_paid')))`
  );
  const found = new Set(cols.map((c) => `${c.table_name}.${c.column_name}`));
  const missingCols = [
    'shop_customers.credit_limit',
    'shop_customers.credit_terms_days',
    'suppliers.lead_time_days',
    'sales.due_date',
    'sales.amount_paid',
  ].filter((c) => !found.has(c));
  if (missingCols.length) {
    throw new Error(`POS columns missing after setup: ${missingCols.join(', ')}`);
  }
  console.log('[db] Verified phase-2 credit/lead-time and phase-3 debt columns.');
  await pool.end();
};

setup().catch((err) => {
  console.error('[db] Schema setup failed:', err.message);
  process.exit(1);
});
