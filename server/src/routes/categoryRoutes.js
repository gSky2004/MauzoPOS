const express = require('express');
const categoryController = require('../controllers/categoryController');
const { authenticateUser, authorizeRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { categoryValidator } = require('../validators/validators');

const router = express.Router();

router.get('/', categoryController.list);

router.use(authenticateUser, authorizeRole('ADMIN'));
router.post('/', categoryValidator, validate, categoryController.create);
router.put('/:id', categoryValidator, validate, categoryController.update);
router.delete('/:id', categoryController.remove);

module.exports = router;
