const express = require('express');
const activityController = require('../controllers/activityController');
const shopCustomerController = require('../controllers/shopCustomerController');
const reportController = require('../controllers/reportController');
const { authenticateUser, authorizeRole } = require('../middleware/auth');

const router = express.Router();

// Activity (ADMIN)
router.get('/activity', authenticateUser, authorizeRole('ADMIN'), activityController.list);

// Shop customers / debt. Shopkeepers take part in the debt workflow (they make
// the credit sales and collect the payments), but correcting history stays
// ADMIN-only so the audit trail cannot be rewritten from the till.
router.get('/customers', authenticateUser, authorizeRole('ADMIN', 'SHOPKEEPER'), shopCustomerController.list);
router.get('/customers/aging', authenticateUser, authorizeRole('ADMIN', 'SHOPKEEPER'), shopCustomerController.aging);
router.post('/customers', authenticateUser, authorizeRole('ADMIN', 'SHOPKEEPER'), shopCustomerController.create);
router.post('/customers/:id/pay', authenticateUser, authorizeRole('ADMIN', 'SHOPKEEPER'), shopCustomerController.pay);
router.get('/customers/:id/history', authenticateUser, authorizeRole('ADMIN', 'SHOPKEEPER'), shopCustomerController.history);
router.post('/customers/:id/payments/:paymentId/reverse', authenticateUser, authorizeRole('ADMIN'), shopCustomerController.reversePayment);

// WhatsApp-ready text reports (ADMIN)
router.get('/reports/daily', authenticateUser, authorizeRole('ADMIN'), reportController.daily);
router.get('/reports/stock-alert', authenticateUser, authorizeRole('ADMIN'), reportController.stockAlert);
router.get('/reports/expiry-alert', authenticateUser, authorizeRole('ADMIN'), reportController.expiryAlert);
router.get('/reports/summary', authenticateUser, authorizeRole('ADMIN'), reportController.summary);
// Official downloadable PDF for an admin-selected date range (ADMIN)
router.get('/reports/range.pdf', authenticateUser, authorizeRole('ADMIN'), reportController.rangePdf);

module.exports = router;
