const mongoose = require('mongoose');

const chatSchema = mongoose.Schema({
  chatName: { 
    type: String, 
    trim: true 
  },
  isGroupChat: { 
    type: Boolean, 
    default: false 
  },
  users: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  latestMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
  },
  groupAdmin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  groupImage: {
    type: String,
    default: null
  },
  groupDescription: {
    type: String,
    maxlength: 500,
    default: null
  },
  // Muted users (who muted this chat)
  mutedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Archive status per user
  archivedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, { 
  timestamps: true 
});

// Index for faster queries
chatSchema.index({ users: 1, updatedAt: -1 });
chatSchema.index({ isGroupChat: 1 });

// Virtual to get unread count (will be populated in controller)
chatSchema.virtual('unreadCount', {
  ref: 'Message',
  localField: '_id',
  foreignField: 'chat',
  count: true
});

// Method to check if user is admin
chatSchema.methods.isAdmin = function(userId) {
  return this.groupAdmin && this.groupAdmin.toString() === userId.toString();
};

// Method to check if user is member
chatSchema.methods.isMember = function(userId) {
  return this.users.some(user => user.toString() === userId.toString());
};

const Chat = mongoose.model('Chat', chatSchema);
module.exports = Chat;