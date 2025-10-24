const mongoose = require('mongoose');

const messageSchema = mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: { 
    type: String, 
    trim: true 
  },
  // File attachment support
  file: {
    filename: String,
    mimetype: String,
    filepath: String,
    size: Number,
    publicId: String // Cloudinary public ID for deletion
  },
  chat: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true
  },
  // ⭐⭐⭐ Read Receipts Feature
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  // ⭐ Message Reactions Feature
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: {
      type: String,
      enum: ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏']
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  // ⭐ Message Forwarding Feature
  forwardedFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  forwardCount: {
    type: Number,
    default: 0
  },
  // Reply to message feature
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  // Soft delete feature
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedFor: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Message type
  messageType: {
    type: String,
    // --- FIX: Added 'system' for admin change messages ---
    enum: ['text', 'image', 'video', 'audio', 'document', 'location', 'system'],
    default: 'text'
  }
}, { 
  timestamps: true 
});

// Index for faster queries
messageSchema.index({ chat: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ content: 'text' }); // For message search

// Virtual for checking if message is read
messageSchema.virtual('isRead').get(function() {
  return this.readBy && this.readBy.length > 0;
});

// Method to check if user has read the message
messageSchema.methods.hasUserRead = function(userId) {
  return this.readBy.some(r => r.user.toString() === userId.toString());
};

// Method to add reaction
messageSchema.methods.addReaction = async function(userId, emoji) {
  // Remove existing reaction from this user
  this.reactions = this.reactions.filter(
    r => r.user.toString() !== userId.toString()
  );
  
  // Add new reaction
  this.reactions.push({ user: userId, emoji });
  return await this.save();
};

// Method to remove reaction
messageSchema.methods.removeReaction = async function(userId) {
  this.reactions = this.reactions.filter(
    r => r.user.toString() !== userId.toString()
  );
  return await this.save();
};

const Message = mongoose.model('Message', messageSchema);
module.exports = Message;
