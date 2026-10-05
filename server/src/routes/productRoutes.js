const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const env = require('../config/env');
const productController = require('../controllers/productController');
const { authenticateUser, authorizeRole, optionalAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { productValidator } = require('../validators/validators');

const router = express.Router();

const uploadDir = path.resolve(__dirname, '../../', env.uploadDir);
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (/image\/(jpeg|png|webp|avif|gif)/.test(file.mimetype)) cb(null, true);
  else cb(new Error('Only image files are allowed'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/', optionalAuth, productController.list);

router.get(
  '/id/:id',
  authenticateUser,
  authorizeRole('ADMIN', 'SHOPKEEPER'),
  productController.getById
);
router.get('/:slug', optionalAuth, productController.getBySlug);

router.use(authenticateUser, authorizeRole('ADMIN'));
router.post('/', upload.array('images', 6), productValidator, validate, productController.create);
router.put('/:id', upload.array('images', 6), productValidator, validate, productController.update);
router.delete('/:id', productController.remove);

module.exports = router;
