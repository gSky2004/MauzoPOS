const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const env = require('../config/env');
const inventoryController = require('../controllers/inventoryController');
const supplierController = require('../controllers/supplierController');
const { authenticateUser, authorizeRole } = require('../middleware/auth');
const resizeUpload = require('../middleware/resizeUpload');
const validate = require('../middleware/validate');
const { body } = require('express-validator');

const router = express.Router();

const uploadDir = path.resolve(__dirname, '../../', env.uploadDir);
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `invoice-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const fileFilter = (req, file, cb) => {
  if (/image\/(jpeg|png|webp|avif|gif)/.test(file.mimetype)) cb(null, true);
  else cb(new Error('Only image files are allowed'));
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

const receiveValidator = [
  body('product_id').isUUID().withMessage('Valid product required'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('buying_price').optional().isFloat({ min: 0 }).withMessage('Invalid buying price'),
  body('supplier_id').optional({ nullable: true }).isUUID().withMessage('Invalid supplier'),
  body('expiry_date').optional({ nullable: true }).isISO8601().withMessage('Invalid expiry date'),
];

const supplierValidator = [
  body('name').trim().notEmpty().withMessage('Supplier name is required'),
];

// Stock levels: both roles (shopkeeper sees quantities only via product sanitize;
// movements carry no prices so safe for both).
router.get('/alerts', authenticateUser, authorizeRole('ADMIN', 'SHOPKEEPER'), inventoryController.alerts);
router.get('/movements', authenticateUser, authorizeRole('ADMIN', 'SHOPKEEPER'), inventoryController.movements);

// Receipts carry buying prices: ADMIN only.
router.get('/receipts', authenticateUser, authorizeRole('ADMIN'), inventoryController.receipts);

// Manual stock correction (NOT a sale — no revenue impact): ADMIN only.
router.post('/adjust', authenticateUser, authorizeRole('ADMIN'), [
  body('product_id').isUUID().withMessage('Valid product required'),
  body('quantity').isInt({ min: -1000000, max: 1000000 }).withMessage('Adjustment must be a whole number'),
], validate, inventoryController.adjust);
router.post('/receive', authenticateUser, authorizeRole('ADMIN'), upload.single('invoice'), resizeUpload, receiveValidator, validate, inventoryController.receive);

// Velocity-based replenishment: buying prices/costs visible, ADMIN only.
router.get('/replenishment', authenticateUser, authorizeRole('ADMIN'), inventoryController.replenishment);

// Suppliers: ADMIN only (v1 simple).
router.get('/suppliers', authenticateUser, authorizeRole('ADMIN'), supplierController.list);
router.post('/suppliers', authenticateUser, authorizeRole('ADMIN'), supplierValidator, validate, supplierController.create);
router.put('/suppliers/:id', authenticateUser, authorizeRole('ADMIN'), supplierController.update);
router.get('/suppliers/:id/history', authenticateUser, authorizeRole('ADMIN'), supplierController.history);

module.exports = router;
