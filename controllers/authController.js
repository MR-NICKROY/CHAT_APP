const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const generateOTP = require('../utils/otpGenerator'); // We still need this
const User = require('../models/User');
require('dotenv').config();

// Helper: Generates Token and Sets Cookie
const generateTokenAndSetCookie = (res, userId) => {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });

  res.cookie('token', token, {
    httpOnly: true, 
    secure: process.env.NODE_ENV === 'production', 
    sameSite: 'strict', 
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  return token;
};

// @desc    Register a new user (Signup) - UPDATED
// @route   POST /api/auth/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, phone, status } = req.body; // Add status

  if (!name) {
    res.status(400);
    throw new Error('Please enter your name');
  }
  if (!email && !phone) {
    res.status(400);
    throw new Error('Please provide either an email or a phone number');
  }

  // Check if user exists
  const query = [];
  if (email) query.push({ email });
  if (phone) query.push({ phone });
  const userExists = await User.findOne({ $or: query });

  if (userExists) {
    res.status(400);
    throw new Error('User already exists with this email or phone number');
  }

  // Get image URL from Cloudinary (if uploaded)
  let imageUrl = 'https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg';
  
  if (req.file) {
    imageUrl = req.file.path; // Cloudinary URL is automatically set by multer
    console.log('Image uploaded to Cloudinary:', imageUrl);
  }

  // Create user
  const user = await User.create({
    name,
    email: email || undefined,
    phone: phone || undefined,
    status: status || 'Hi! I am using this chat app.', // Add status with default
    image: imageUrl, // Add image URL
  });

  if (user) {
    // 1. Generate "ShowOff" OTP
    const otpCode = generateOTP();
    console.log(`[ShowOff OTP] For ${user.email || user.phone} is: ${otpCode}`);
    // Note: We don't need to save it, as it's just for show

    // 2. Generate Token and Set Cookie
    const token = generateTokenAndSetCookie(res, user._id);

    // 3. Send Response
    res.status(201).json({
      message: 'User registered successfully!',
      _id: user._id,
      name: user.name,
      status: user.status,
      image: user.image,
      token: token,
      otp_for_testing: otpCode
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});

// @desc    Login user (Passwordless) - NO CHANGE
// @route   POST /api/auth/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
  const { identifier } = req.body; // 'identifier' can be email or phone

  if (!identifier) {
    res.status(400);
    throw new Error('Please enter your email or phone number');
  }

  const user = await User.findOne({ 
    $or: [{ email: identifier }, { phone: identifier }] 
  }).select('-otp');

  if (!user) {
     res.status(404);
     throw new Error('User not found. Please register first.');
  }

  // User exists, generate token and set cookie
  const token = generateTokenAndSetCookie(res, user._id);

  res.json({
    _id: user._id,
    name: user.name,
    // email: user.email,
    // phone: user.phone,
    image: user.image,
    status: user.status,
    token: token,
  });
});

// We no longer need generateOtp or verifyOtp

module.exports = { registerUser, loginUser };