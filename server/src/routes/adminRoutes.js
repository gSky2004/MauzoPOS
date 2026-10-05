const express = require('express');
const adminController = require('../controllers/adminController');
const shopkeeperController = require('../controllers/shopkeeperController');
const validate = require('../middleware/validate');
const { shopkeeperValidator } = require('../validators/authValidator');
const { authenticateUser, authorizeRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateUser, authorizeRole('ADMIN'));

router.get('/customers', adminController.listCustomers);
router.get('/shopkeepers', shopkeeperController.list);
router.post('/shopkeepers', shopkeeperValidator, validate, shopkeeperController.create);
router.put('/shopkeepers/:id/status', shopkeeperController.updateStatus);

module.exports = router;
