const mongoose = require('mongoose');

const userSchema = mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  email: { 
    type: String, 
    unique: true, 
    sparse: true,
    lowercase: true,
    trim: true
  },
  phone: { 
    type: String, 
    unique: true, 
    sparse: true,
    trim: true
  },
  status: {
    type: String,
    default: "Hi! I am using this chat app.",
    maxlength: 200
  },
  image: {
    type: String,
    default: 'https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg',
  },
  // ⭐⭐ Block Users Feature
  blockedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // ⭐ Online Status Feature
  isOnline: {
    type: Boolean,
    default: false
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  // OTP (kept for compatibility)
  otp: {
    code: { type: String },
    createdAt: { type: Date, expires: '5m' }
  },
  // Account settings
  isActive: {
    type: Boolean,
    default: true
  }
}, { 
  timestamps: true 
});

// Index for faster searches
userSchema.index({ name: 'text', email: 'text', phone: 'text' });
userSchema.index({ isOnline: 1, lastSeen: -1 });

// Method to check if user has blocked another user
userSchema.methods.hasBlocked = function(userId) {
  // Check if blockedUsers exists AND is an array before trying to use .some()
  return this.blockedUsers && this.blockedUsers.some(blockedUser => blockedUser.equals(userId));
};

// Method to update online status
userSchema.methods.setOnlineStatus = async function(isOnline) {
  this.isOnline = isOnline;
  if (!isOnline) {
    this.lastSeen = new Date();
  }
  return await this.save();
};

const User = mongoose.model('User', userSchema);
module.exports = User;