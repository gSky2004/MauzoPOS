const express = require('express');
const closingController = require('../controllers/closingController');
const { authenticateUser, authorizeRole } = require('../middleware/auth');

const router = express.Router();
router.get('/expected', authenticateUser, authorizeRole('ADMIN', 'SHOPKEEPER'), closingController.expected);
router.post('/', authenticateUser, authorizeRole('ADMIN', 'SHOPKEEPER'), closingController.submit);
router.get('/mine', authenticateUser, authorizeRole('ADMIN', 'SHOPKEEPER'), closingController.mine);
router.get('/', authenticateUser, authorizeRole('ADMIN'), closingController.all);
router.put('/:id/review', authenticateUser, authorizeRole('ADMIN'), closingController.review);

module.exports = router;
