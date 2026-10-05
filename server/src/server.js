const app = require('./app');
const env = require('./config/env');
const { pool } = require('./db/pool');

const start = async () => {
  try {
    await pool.query('SELECT 1');
    console.log('[server] Database connected');
  } catch (err) {
    console.error('[server] Database connection failed:', err.message);
    process.exit(1);
  }

  app.listen(env.port, () => {
    console.log(`[server] MauzoPOS API running at http://localhost:${env.port}`);
  });
};

start();
