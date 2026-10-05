const express = require('express');
const aiController = require('../controllers/aiController');
const { authenticateUser, authorizeRole } = require('../middleware/auth');

const router = express.Router();

// AI Business Assistant: ADMIN only, enforced here on the backend. The
// assistant is read-only by design (it can only explain verified data).
router.post('/ask', authenticateUser, authorizeRole('ADMIN'), aiController.ask);

module.exports = router;
