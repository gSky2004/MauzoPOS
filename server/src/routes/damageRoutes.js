const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const env = require('../config/env');
const damageController = require('../controllers/damageController');
const { authenticateUser, authorizeRole } = require('../middleware/auth');
const resizeUpload = require('../middleware/resizeUpload');

const router = express.Router();

const uploadDir = path.resolve(__dirname, '../../', env.uploadDir);
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `damage-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const fileFilter = (req, file, cb) => {
  if (/image\/(jpeg|png|webp|avif|gif)/.test(file.mimetype)) cb(null, true);
  else cb(new Error('Only image files are allowed'));
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/', authenticateUser, authorizeRole('ADMIN', 'SHOPKEEPER'), damageController.list);
router.post('/', authenticateUser, authorizeRole('ADMIN', 'SHOPKEEPER'), upload.single('photo'), resizeUpload, damageController.report);
router.put('/:id/review', authenticateUser, authorizeRole('ADMIN'), damageController.review);

module.exports = router;
