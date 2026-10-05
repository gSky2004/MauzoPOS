const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  databaseUrl:
    process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/gsky',
  jwtSecret: process.env.JWT_SECRET || 'gsky-insecure-dev-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  clientUrls: String(process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  paymentProvider: process.env.PAYMENT_PROVIDER || 'sandbox',
  paymentSandboxAutoConfirm:
    String(process.env.PAYMENT_SANDBOX_AUTO_CONFIRM).toLowerCase() === 'true',
  paymentApiKey: process.env.PAYMENT_API_KEY || '',
  paymentSecret: process.env.PAYMENT_SECRET || '',
  paymentCallbackUrl: process.env.PAYMENT_CALLBACK_URL || '',
  emailProvider: process.env.EMAIL_PROVIDER || 'log',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  emailFrom: process.env.EMAIL_FROM || process.env.SMTP_FROM || 'M&E Pub <no-reply@gskyshoes.co.tz>',
  contactToEmail: process.env.CONTACT_TO_EMAIL || 'mwansisyagasper2004@gmail.com',
  contactFromName: process.env.CONTACT_FROM_NAME || 'M&E Pub',
  whatsappNumber: process.env.WHATSAPP_NUMBER || '0675029833',
  adminName: process.env.ADMIN_NAME || 'Admin',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@gskyshoes.co.tz',
  adminPhone: process.env.ADMIN_PHONE || '0675029833',
  adminPassword: process.env.ADMIN_PASSWORD || 'Admin@1234',
  // AI Business Assistant (Gemini free tier). The key lives ONLY in server/.env
  // (gitignored) and is never sent to the browser.
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
};

module.exports = env;
