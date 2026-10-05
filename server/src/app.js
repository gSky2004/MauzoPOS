const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const env = require('./config/env');
const { notFound, errorHandler } = require('./utils/ApiError');

const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const restockRoutes = require('./routes/restockRoutes');
const adminRoutes = require('./routes/adminRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const saleRoutes = require('./routes/saleRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const damageRoutes = require('./routes/damageRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const closingRoutes = require('./routes/closingRoutes');
const miscRoutes = require('./routes/miscRoutes');
const aiRoutes = require('./routes/aiRoutes');

const app = express();

app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
const allowedOrigins = new Set(env.clientUrls);
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.has(origin)) return cb(null, true);
      cb(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
// Gzip JSON, PDFs and static assets — the single biggest speedup for phones
// on slow mobile data. Must run before routes and static serving.
app.use(compression());

if (env.nodeEnv !== 'test') app.use(morgan('dev'));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts, please try again later' },
});

app.use('/uploads', express.static(path.resolve(__dirname, '../', env.uploadDir)));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/products', apiLimiter, productRoutes);
app.use('/api/categories', apiLimiter, categoryRoutes);
app.use('/api/restock', apiLimiter, restockRoutes);
app.use('/api/admin', apiLimiter, adminRoutes);
app.use('/api/inventory', apiLimiter, inventoryRoutes);
app.use('/api/sales', apiLimiter, saleRoutes);
app.use('/api/expenses', apiLimiter, expenseRoutes);
app.use('/api/damage', apiLimiter, damageRoutes);
app.use('/api/analytics', apiLimiter, analyticsRoutes);
app.use('/api/closings', apiLimiter, closingRoutes);
app.use('/api/pos', apiLimiter, miscRoutes);
app.use('/api/ai', apiLimiter, aiRoutes);

const clientDist = path.resolve(__dirname, '../../client/dist');
if (env.nodeEnv === 'production' && require('fs').existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
