const express = require('express');
const { login, me, logout, updateProfile } = require('../controllers/authController');
const { authenticateUser } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { loginValidator, profileValidator } = require('../validators/authValidator');

const router = express.Router();

router.post('/login', loginValidator, validate, login);
router.get('/me', authenticateUser, me);
router.post('/logout', authenticateUser, logout);
router.put('/profile', authenticateUser, profileValidator, validate, updateProfile);

module.exports = router;
