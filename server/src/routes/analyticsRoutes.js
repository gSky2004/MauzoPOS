const express = require('express');
const analyticsController = require('../controllers/analyticsController');
const { authenticateUser, authorizeRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateUser, authorizeRole('ADMIN'));
router.get('/today', analyticsController.today);
router.get('/series', analyticsController.series);
router.get('/products', analyticsController.products);
router.get('/payments', analyticsController.payments);

module.exports = router;
