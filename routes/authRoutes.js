const express = require('express');
const { registerUser, loginUser } = require('../controllers/authController');
const upload = require('../middleware/uploadMiddleware');
const { authLimiter } = require('../middleware/rateLimiter'); // Added authLimiter

const router = express.Router();

// @route   POST /api/auth/register
// Pass 'upload.single('image')' middleware for registration
router.route('/register').post(authLimiter, upload.single('image'), registerUser);

// @route   POST /api/auth/login
router.route('/login').post(authLimiter, loginUser);

module.exports = router;
