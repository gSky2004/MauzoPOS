const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const env = require('../config/env');
const expenseController = require('../controllers/expenseController');
const { authenticateUser, authorizeRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { body } = require('express-validator');

const router = express.Router();

const uploadDir = path.resolve(__dirname, '../../', env.uploadDir);
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `expense-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const fileFilter = (req, file, cb) => {
  if (/image\/(jpeg|png|webp|avif|gif)/.test(file.mimetype)) cb(null, true);
  else cb(new Error('Only image files are allowed'));
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/categories', authenticateUser, authorizeRole('ADMIN', 'SHOPKEEPER'), expenseController.categories);
router.post('/categories', authenticateUser, authorizeRole('ADMIN'), [body('name').trim().notEmpty().withMessage('Name required')], validate, expenseController.createCategory);

router.get('/summary', authenticateUser, authorizeRole('ADMIN', 'SHOPKEEPER'), expenseController.summary);
router.get('/', authenticateUser, authorizeRole('ADMIN', 'SHOPKEEPER'), expenseController.list);
router.post('/', authenticateUser, authorizeRole('ADMIN', 'SHOPKEEPER'), upload.single('receipt'), expenseController.create);
router.put('/:id', authenticateUser, authorizeRole('ADMIN', 'SHOPKEEPER'), expenseController.update);
router.delete('/:id', authenticateUser, authorizeRole('ADMIN', 'SHOPKEEPER'), expenseController.destroy);

module.exports = router;
