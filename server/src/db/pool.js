const { Pool } = require('pg');
const env = require('../config/env');

// Hosted Postgres (Supabase and friends) requires TLS. Local Postgres does
// not speak it, so SSL turns on only when asked: PGSSL=true, sslmode=require
// in the URL, or a known hosted hostname.
const wantsSsl =
  String(process.env.PGSSL || '').toLowerCase() === 'true' ||
  /sslmode=require/i.test(env.databaseUrl || '') ||
  /(supabase\.co|neon\.tech|render\.com)/i.test(env.databaseUrl || '');

const pool = new Pool({
  connectionString: env.databaseUrl,
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: 30000,
  ...(wantsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

const query = (text, params) => pool.query(text, params);

const transaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { pool, query, transaction };
