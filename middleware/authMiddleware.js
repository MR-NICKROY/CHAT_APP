const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
require('dotenv').config();

const protect = asyncHandler(async (req, res, next) => {
  let token;

  // 1. Check Authorization Header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
    } catch (error) {
      // Malformed header, fall through
    }
  }

  // 2. If no header, check cookies
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  // 3. If still no token, deny access
  if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token');
  }

  // 4. Verify token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find user by ID
    req.user = await User.findById(decoded.id).select('-otp'); 

    // --- THIS IS THE FIX ---
    // If the user is null, the token is invalid (user was deleted)
    if (!req.user) {
        res.status(401);
        throw new Error('Not authorized, user not found');
    }
    // -----------------------

    next(); // Continue to the next function (e.g., updateUserProfile)
  } catch (error) {
    res.status(401);
    throw new Error('Not authorized, token failed');
  }
});

module.exports = { protect };