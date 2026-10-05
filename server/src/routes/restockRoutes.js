const express = require('express');
const restockController = require('../controllers/restockController');
const { authenticateUser, authorizeRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateUser, authorizeRole('ADMIN', 'SHOPKEEPER'), restockController.list);
router.post('/', authenticateUser, authorizeRole('ADMIN', 'SHOPKEEPER'), restockController.request);
router.put('/:id/resolve', authenticateUser, authorizeRole('ADMIN'), restockController.resolve);

module.exports = router;
