const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { 
  allMessages, 
  sendMessage,
  forwardMessage,
  markMessagesAsRead,
  reactToMessage,
  removeReaction,
  deleteMessage,
  deleteMessageForMe,
  searchMessages,
  downloadFile,
  getUnreadCount
} = require('../controllers/messageController');
const upload = require('../middleware/uploadMiddleware');
const { messageLimiter, uploadLimiter, searchLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Get unread count
router.route('/unread').get(protect, getUnreadCount);

// Get all messages for a chat
router.route('/:chatId').get(protect, allMessages);

// Send a new message (with optional file)
router.route('/').post(protect, uploadLimiter, upload.single('file'), sendMessage);

// Forward message to multiple chats
router.route('/forward').post(protect, messageLimiter, forwardMessage);

// Mark messages as read
router.route('/read').put(protect, markMessagesAsRead);

// React to message
router.route('/react').post(protect, reactToMessage);

// Remove reaction
router.route('/react').delete(protect, removeReaction);

// Delete message
router.route('/:messageId').delete(protect, deleteMessage);

// Delete message for me only
router.route('/:messageId/deleteforme').put(protect, deleteMessageForMe);

// Search messages
router.route('/search').get(protect, searchLimiter, searchMessages);

// Download file
router.route('/download/:messageId').get(protect, downloadFile);



module.exports = router;