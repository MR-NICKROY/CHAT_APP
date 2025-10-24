const asyncHandler = require('express-async-handler');
const Chat = require('../models/Chat');
const User = require('../models/User');
const Message = require('../models/Message');

// @desc    Access a 1-on-1 chat or create it
// @route   POST /api/chat
// @access  Private
const accessChat = asyncHandler(async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    res.status(400);
    throw new Error('UserId param not sent with request');
  }

  // Check if user is blocked
  const currentUser = await User.findById(req.user._id);
  const otherUser = await User.findById(userId);

  if (!otherUser) {
    res.status(404);
    throw new Error('User not found');
  }

  if (currentUser.hasBlocked(userId) || otherUser.hasBlocked(req.user._id)) {
    res.status(403);
    throw new Error('Cannot chat with this user');
  }

  // Find existing chat
  let isChat = await Chat.find({
    isGroupChat: false,
    $and: [
      { users: { $eq: req.user._id } },
      { users: { $eq: userId } },
    ],
  })
    .populate('users', 'name image status isOnline lastSeen') // тнР Added isOnline/lastSeen
    .populate('latestMessage');

  isChat = await User.populate(isChat, {
    path: 'latestMessage.sender',
    select: 'name image status',
  });

  if (isChat.length > 0) {
    // Get unread count
    const unreadCount = await Message.countDocuments({
      chat: isChat[0]._id,
      sender: { $ne: req.user._id },
      'readBy.user': { $ne: req.user._id },
      isDeleted: false
    });

    const chatData = isChat[0].toObject();
    chatData.unreadCount = unreadCount;

    res.send(chatData);
  } else {
    // Create new chat
    const chatData = {
      chatName: 'sender',
      isGroupChat: false,
      users: [req.user._id, userId],
    };

    try {
      const createdChat = await Chat.create(chatData);
      const fullChat = await Chat.findOne({ _id: createdChat._id })
        .populate('users', 'name image status isOnline lastSeen'); // тнР Added isOnline/lastSeen
      
      const chatResponse = fullChat.toObject();
      chatResponse.unreadCount = 0;
      
      res.status(200).json(chatResponse);
    } catch (error) {
      res.status(400);
      throw new Error(error.message);
    }
  }
});

// @desc    Fetch all chats for the logged-in user with unread counts
// @route   GET /api/chat
// @access  Private
const fetchChats = asyncHandler(async (req, res) => {
  try {
    let chats = await Chat.find({ 
      users: { $eq: req.user._id },
      archivedBy: { $ne: req.user._id }
    })
      .populate('users', 'name image status isOnline lastSeen') // тнР Added isOnline/lastSeen
      .populate('groupAdmin', 'name image')
      .populate('latestMessage')
      .sort({ updatedAt: -1 });

    chats = await User.populate(chats, {
      path: 'latestMessage.sender',
      select: 'name image',
    });

    // --- FIX: Replaced N+1 query with aggregation ---
    // Efficiently get all unread counts in one query
    const chatIds = chats.map(chat => chat._id);

    const unreadCounts = await Message.aggregate([
      // Match messages that are unread by the current user
      {
        $match: {
          chat: { $in: chatIds },
          sender: { $ne: req.user._id },
          'readBy.user': { $ne: req.user._id },
          isDeleted: false,
          deletedFor: { $ne: req.user._id }
        }
      },
      // Group by chat ID and count them
      {
        $group: {
          _id: '$chat', // Group by the chat ID
          unreadCount: { $sum: 1 } // Count messages in each group
        }
      }
    ]);

    // Create a Map for quick lookup
    const unreadMap = new Map(
      unreadCounts.map(item => [item._id.toString(), item.unreadCount])
    );

    // Add unread count and mute status to each chat
    const chatsWithUnread = chats.map(chat => {
      const chatObj = chat.toObject();
      chatObj.unreadCount = unreadMap.get(chat._id.toString()) || 0; // Get count from Map
      chatObj.isMuted = chat.mutedBy.includes(req.user._id);
      return chatObj;
    });
    // --- END OF FIX ---

    res.status(200).send(chatsWithUnread);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// @desc    Create New Group Chat
// @route   POST /api/chat/group
// @access  Private
const createGroupChat = asyncHandler(async (req, res) => {
  if (!req.body.users || !req.body.name) {
    return res.status(400).send({ message: 'Please provide a group name and users' });
  }

  let users = req.body.users;

  if (users.length < 1) {
    return res.status(400).send('At least 2 users are required for a group chat');
  }

  // Check for blocked users
  const currentUser = await User.findById(req.user._id);
  const validUsers = [];

  for (const userId of users) {
    const user = await User.findById(userId);
    if (user && !currentUser.hasBlocked(userId) && !user.hasBlocked(req.user._id)) {
      validUsers.push(userId);
    }
  }

  validUsers.push(req.user._id); // Add creator

  try {
    const groupChat = await Chat.create({
      chatName: req.body.name,
      users: validUsers,
      isGroupChat: true,
      groupAdmin: req.user._id,
      groupDescription: req.body.description || null,
      groupImage: req.file ? req.file.path : null
    });

    const fullGroupChat = await Chat.findOne({ _id: groupChat._id })
      .populate('users', 'name image status isOnline lastSeen') // тнР Added isOnline/lastSeen
      .populate('groupAdmin', 'name image');

    res.status(200).json(fullGroupChat);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// @desc    Rename Group
// @route   PUT /api/chat/rename
// @access  Private
const renameGroup = asyncHandler(async (req, res) => {
  const { chatId, chatName } = req.body;

  const chat = await Chat.findById(chatId);

  if (!chat) {
    res.status(404);
    throw new Error('Chat Not Found');
  }

  if (!chat.isGroupChat) {
    res.status(400);
    throw new Error('This is not a group chat');
  }

  // Check permissions
  if (!chat.isAdmin(req.user._id)) {
    res.status(403);
    throw new Error('Only the group admin can rename the group');
  }

  chat.chatName = chatName;
  await chat.save();

  const updatedChat = await Chat.findById(chatId)
    .populate('users', 'name image status isOnline lastSeen') // тнР Added isOnline/lastSeen
    .populate('groupAdmin', 'name image');

  res.json(updatedChat);
});

// @desc    Add user to Group
// @route   PUT /api/chat/groupadd
// @access  Private
const addToGroup = asyncHandler(async (req, res) => {
  const { chatId, userId } = req.body;

  const chat = await Chat.findById(chatId);

  if (!chat) {
    res.status(404);
    throw new Error('Chat Not Found');
  }

  if (!chat.isAdmin(req.user._id)) {
    res.status(403);
    throw new Error('Only the group admin can add members');
  }

  // Check if user is already in group
  if (chat.isMember(userId)) {
    res.status(400);
    throw new Error('User is already in the group');
  }

  // Check blocks
  const currentUser = await User.findById(req.user._id);
  const userToAdd = await User.findById(userId);

  if (!userToAdd) {
    res.status(404);
    throw new Error('User not found');
  }

  if (currentUser.hasBlocked(userId) || userToAdd.hasBlocked(req.user._id)) {
    res.status(403);
    throw new Error('Cannot add this user');
  }

  chat.users.push(userId);
  await chat.save();

  const added = await Chat.findById(chatId)
    .populate('users', 'name image status isOnline lastSeen') // тнР Added isOnline/lastSeen
    .populate('groupAdmin', 'name image');

  res.json(added);
});

// @desc    Remove user from Group
// @route   PUT /api/chat/groupremove
// @access  Private
const removeFromGroup = asyncHandler(async (req, res) => {
  const { chatId, userId } = req.body;

  const chat = await Chat.findById(chatId);

  if (!chat) {
    res.status(404);
    throw new Error('Chat Not Found');
  }

  if (!chat.isAdmin(req.user._id)) {
    res.status(403);
    throw new Error('Only the group admin can remove members');
  }

  if (userId === chat.groupAdmin.toString()) {
    res.status(400);
    throw new Error('Cannot remove the group admin');
  }

  chat.users = chat.users.filter(user => user.toString() !== userId);
  await chat.save();

  const removed = await Chat.findById(chatId)
    .populate('users', 'name image status isOnline lastSeen') // тнР Added isOnline/lastSeen
    .populate('groupAdmin', 'name image');

  res.json(removed);
});

// @desc    Leave Group
// @route   PUT /api/chat/leave
// @access  Private
const leaveGroup = asyncHandler(async (req, res) => {
  const { chatId } = req.body;
  // --- FIX: Get io instance from app ---
  const io = req.app.get("io");

  const chat = await Chat.findById(chatId);

  if (!chat) {
    res.status(404);
    throw new Error('Chat Not Found');
  }

  if (!chat.isGroupChat) {
    res.status(400);
    throw new Error('This is not a group chat');
  }

  // If admin is leaving, transfer admin or delete group
  if (chat.isAdmin(req.user._id)) {
    if (chat.users.length > 1) {
      // Transfer admin to next user
      const nextAdminId = chat.users.find(user => user.toString() !== req.user._id.toString());
      chat.groupAdmin = nextAdminId;

      // --- FIX: Create system message for admin transfer ---
      try {
        const nextAdminUser = await User.findById(nextAdminId).select('name');
        if (nextAdminUser) {
          let systemMessage = await Message.create({
            sender: req.user._id, // Use leaving admin's ID as sender
            chat: chatId,
            content: `${nextAdminUser.name} is now the group admin.`,
            messageType: 'system'
          });

          // Populate for socket broadcast
          systemMessage = await systemMessage.populate('sender', 'name image');
          systemMessage = await systemMessage.populate('chat');
           systemMessage = await User.populate(systemMessage, {
            path: 'chat.users',
            select: 'name image status isOnline lastSeen',
          });
          
          // Emit this system message to the chat
          io.to(chatId.toString()).emit('message received', systemMessage);
          
          // Update latestMessage
          chat.latestMessage = systemMessage._id;
        }
      } catch (err) {
        console.error("Error creating system message for admin transfer:", err);
      }
      // --- END OF FIX ---

    } else {
      // Delete group if admin is the last member
      await Chat.findByIdAndDelete(chatId);
      // Also delete all messages associated with the chat
      await Message.deleteMany({ chat: chatId });
      return res.json({ success: true, message: 'Group deleted' });
    }
  }

  chat.users = chat.users.filter(user => user.toString() !== req.user._id.toString());
  await chat.save();

  res.json({ success: true, message: 'Left the group' });
});

// @desc    Mute/Unmute Chat
// @route   PUT /api/chat/mute
// @access  Private
const muteChat = asyncHandler(async (req, res) => {
  const { chatId, mute } = req.body;

  const chat = await Chat.findById(chatId);

  if (!chat) {
    res.status(404);
    throw new Error('Chat Not Found');
  }

  if (mute) {
    if (!chat.mutedBy.includes(req.user._id)) {
      chat.mutedBy.push(req.user._id);
    }
  } else {
    chat.mutedBy = chat.mutedBy.filter(id => id.toString() !== req.user._id.toString());
  }

  await chat.save();

  res.json({ success: true, muted: mute });
});

// @desc    Archive/Unarchive Chat
// @route   PUT /api/chat/archive
// @access  Private
const archiveChat = asyncHandler(async (req, res) => {
  const { chatId, archive } = req.body;

  const chat = await Chat.findById(chatId);

  if (!chat) {
    res.status(404);
    throw new Error('Chat Not Found');
  }

  if (archive) {
    if (!chat.archivedBy.includes(req.user._id)) {
      chat.archivedBy.push(req.user._id);
    }
  } else {
    chat.archivedBy = chat.archivedBy.filter(id => id.toString() !== req.user._id.toString());
  }

  await chat.save();

  res.json({ success: true, archived: archive });
});

module.exports = {
  accessChat,
  fetchChats,
  createGroupChat,
  renameGroup,
  addToGroup,
  removeFromGroup,
  leaveGroup,
  muteChat,
  archiveChat
};
