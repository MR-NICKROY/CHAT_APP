const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  accessChat,
  fetchChats,
  createGroupChat,
  renameGroup,
  addToGroup,
  removeFromGroup,
  leaveGroup,
  muteChat,
  archiveChat
} = require('../controllers/chatController');
const upload = require('../middleware/uploadMiddleware');
const { groupLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Get all chats and access/create one-on-one chat
router.route('/')
  .get(protect, fetchChats)
  .post(protect, accessChat);

// Create group chat (with optional image)
router.route('/group').post(protect, groupLimiter, upload.single('groupImage'), createGroupChat);

// --- FIX: Added groupLimiter to all group modification routes ---
// Rename group
router.route('/rename').put(protect, groupLimiter, renameGroup);

// Add user to group
router.route('/groupadd').put(protect, groupLimiter, addToGroup);

// Remove user from group
router.route('/groupremove').put(protect, groupLimiter, removeFromGroup);

// Leave group
router.route('/leave').put(protect, groupLimiter, leaveGroup);
// --- END OF FIX ---

// Mute/unmute chat
router.route('/mute').put(protect, muteChat);

// Archive/unarchive chat
router.route('/archive').put(protect, archiveChat);

module.exports = router;
