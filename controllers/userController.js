const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// @desc    Get user profile (current user)
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .select('name email phone image status isOnline lastSeen blockedUsers');

  if (user) {
    res.json(user);
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    user.name = req.body.name || user.name;
    user.status = req.body.status || user.status;
    
    // Update image if uploaded
    if (req.file) {
      user.image = req.file.path; // Cloudinary URL
    }

    const updatedUser = await user.save();
    
    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      image: updatedUser.image,
      status: updatedUser.status,
      isOnline: updatedUser.isOnline,
      lastSeen: updatedUser.lastSeen,
      token: req.cookies.token || req.headers.authorization?.split(' ')[1]
    });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

// @desc    Get all users (for searching to start a chat)
// @route   GET /api/users?search=keyword
// @access  Private
const getAllUsers = asyncHandler(async (req, res) => {
  const keyword = req.query.search
    ? {
        $or: [
          { name: { $regex: req.query.search, $options: 'i' } },
          { email: { $regex: req.query.search, $options: 'i' } },
          { phone: { $regex: req.query.search, $options: 'i' } },
        ],
      }
    : {};

  // Exclude:
  // 1. Current user
  // 2. Users who have blocked current user
  // 3. Users blocked by current user
  const currentUser = await User.findById(req.user._id).select('blockedUsers');
  
  const users = await User.find({
    ...keyword,
    _id: { 
      $ne: req.user._id,
      $nin: currentUser.blockedUsers // Exclude blocked users
    },
    blockedUsers: { $ne: req.user._id }, // Exclude users who blocked me
    isActive: true
  })
    // ⭐⭐ THIS IS THE CHANGE YOU REQUESTED ⭐⭐
    .select('name image status isOnline lastSeen')
    .limit(20);

  res.send(users);
});

// @desc    Block a user
// @route   POST /api/users/block
// @access  Private
const blockUser = asyncHandler(async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    res.status(400);
    throw new Error('User ID is required');
  }

  if (userId === req.user._id.toString()) {
    res.status(400);
    throw new Error('You cannot block yourself');
  }

  const userToBlock = await User.findById(userId);
  
  if (!userToBlock) {
    res.status(404);
    throw new Error('User not found');
  }

  const currentUser = await User.findById(req.user._id);

  // Check if already blocked
  if (currentUser.hasBlocked(userId)) {
    res.status(400);
    throw new Error('User is already blocked');
  }

  // Add to blocked list
  currentUser.blockedUsers.push(userId);
  await currentUser.save();

  res.json({
    success: true,
    message: `${userToBlock.name} has been blocked`
  });
});

// @desc    Unblock a user
// @route   POST /api/users/unblock
// @access  Private
const unblockUser = asyncHandler(async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    res.status(400);
    throw new Error('User ID is required');
  }

  const currentUser = await User.findById(req.user._id);

  // Check if user is blocked
  if (!currentUser.hasBlocked(userId)) {
    res.status(400);
    throw new Error('User is not blocked');
  }

  // Remove from blocked list
  currentUser.blockedUsers = currentUser.blockedUsers.filter(
    id => id.toString() !== userId
  );
  await currentUser.save();

  const unblockedUser = await User.findById(userId).select('name');

  res.json({
    success: true,
    message: `${unblockedUser.name} has been unblocked`
  });
});

// @desc    Get blocked users list
// @route   GET /api/users/blocked
// @access  Private
const getBlockedUsers = asyncHandler(async (req, res) => {
  const currentUser = await User.findById(req.user._id)
    .populate('blockedUsers', 'name image status');

  res.json({
    blockedUsers: currentUser.blockedUsers || []
  });
});

// @desc    Get user by ID (public profile)
// @route   GET /api/users/:userId
// @access  Private
const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId)
    .select('name image status isOnline lastSeen'); // ⭐ Added isOnline and lastSeen

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Check if blocked
  const currentUser = await User.findById(req.user._id);
  if (currentUser.hasBlocked(req.params.userId) || user.hasBlocked(req.user._id)) {
    res.status(403);
    throw new Error('Cannot view this profile');
  }

  res.json(user);
});

// @desc    Update online status
// @route   PUT /api/users/status/online
// @access  Private
const updateOnlineStatus = asyncHandler(async (req, res) => {
  const { isOnline } = req.body;

  const user = await User.findById(req.user._id);
  
  if (user) {
    await user.setOnlineStatus(isOnline);
    res.json({ success: true, isOnline: user.isOnline, lastSeen: user.lastSeen });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

module.exports = {
  getUserProfile,
  updateUserProfile,
  getAllUsers,
  blockUser,
  unblockUser,
  getBlockedUsers,
  getUserById,
  updateOnlineStatus // ⭐ Re-added this export
};