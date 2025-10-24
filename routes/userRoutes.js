const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { 
  getUserProfile, 
  updateUserProfile, 
  getAllUsers,
  blockUser,
  unblockUser,
  getBlockedUsers,
  getUserById,
  updateOnlineStatus
} = require('../controllers/userController');
const upload = require('../middleware/uploadMiddleware');
const { uploadLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Search all users
router.route('/').get(protect, getAllUsers);

// Get and update user profile
router.route('/profile')
  .get(protect, getUserProfile)
  .put(protect, uploadLimiter, upload.single('image'), updateUserProfile);

// Block user
router.route('/block').post(protect, blockUser);

// Unblock user
router.route('/unblock').post(protect, unblockUser);

// Get blocked users
router.route('/blocked').get(protect, getBlockedUsers);

// Update online status
router.route('/status/online').put(protect, updateOnlineStatus);

// Get user by ID
router.route('/:userId').get(protect, getUserById);

module.exports = router;