const asyncHandler = require("express-async-handler");
const Message = require("../models/Message");
const User = require("../models/User");
const Chat = require("../models/Chat");

// @desc    Get all messages for a chat
// @route   GET /api/message/:chatId
// @access  Private
const allMessages = asyncHandler(async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId);

    if (!chat) {
      res.status(404);
      throw new Error("Chat not found");
    }

    // Check if user is a member
    if (!chat.isMember(req.user._id)) {
      res.status(403);
      throw new Error("Not authorized to view this chat");
    }

    const messages = await Message.find({
      chat: req.params.chatId,
      isDeleted: false,
      deletedFor: { $ne: req.user._id },
    })
      .populate("sender", "name image status isOnline lastSeen")
      .populate("replyTo", "content sender")
      .populate({
        path: "reactions.user",
        select: "name image",
      })
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// @desc    Send a new message (text or file)
// @route   POST /api/message
// @access  Private
const sendMessage = asyncHandler(async (req, res) => {
  const { content, chatId, replyTo } = req.body;
  // --- FIX: Get io instance from app ---
  const io = req.app.get("io");

  if (!chatId) {
    res.status(400);
    throw new Error("ChatId not found in request");
  }

  // === FIX START ===
  // STEP 1: Find the chat first, WITHOUT populating users
  let chat = await Chat.findById(chatId);

  if (!chat) {
    res.status(404);
    throw new Error("Chat not found");
  }

  // STEP 2: Run the isMember check.
  if (!chat.isMember(req.user._id)) {
    res.status(403);
    throw new Error("Not authorized to send messages in this chat");
  }

  // STEP 3: NOW populate the users for the block check
  chat = await chat.populate(
    "users",
    "name image blockedUsers"
  );
  // === FIX END ===

  // Check if any user has blocked the sender
  const blockedBy = chat.users.filter(
    (user) => user.blockedUsers && user.hasBlocked(req.user._id)
  );

  if (blockedBy.length > 0) {
    res.status(403);
    throw new Error(
      "Cannot send message - you are blocked by one or more users"
    );
  }

  // Validate content or file
  if (!content && !req.file) {
    res.status(400);
    throw new Error("Cannot send an empty message");
  }

  let newMessageData = {
    sender: req.user._id,
    chat: chatId,
  };

  // Handle file attachment
  if (req.file) {
    newMessageData.file = {
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      filepath: req.file.path, // Cloudinary URL
      size: req.file.size,
      publicId: req.file.filename,
    };

    // Determine message type
    if (req.file.mimetype.startsWith("image/")) {
      newMessageData.messageType = "image";
    } else if (req.file.mimetype.startsWith("video/")) {
      newMessageData.messageType = "video";
    } else if (req.file.mimetype.startsWith("audio/")) {
      newMessageData.messageType = "audio";
    } else {
      newMessageData.messageType = "document";
    }
  }

  // Handle text content
  if (content) {
    newMessageData.content = content;
    newMessageData.messageType = 'text'; // Explicitly set type for text
  }

  // Handle reply
  if (replyTo) {
    newMessageData.replyTo = replyTo;
  }

  try {
    let message = await Message.create(newMessageData);

    message = await message.populate("sender", "name image status isOnline");
    message = await message.populate("chat");
    message = await message.populate("replyTo", "content sender");
    message = await User.populate(message, {
      path: "chat.users",
      select: "name image status isOnline lastSeen",
    });

    // Update chat's latest message
    await Chat.findByIdAndUpdate(chatId, { latestMessage: message._id });

    // --- FIX: Emit socket event from server to the chat room ---
    io.to(chatId.toString()).emit("message received", message);

    // Send the message back to the sender
    res.json(message);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// @desc    Forward message to multiple chats
// @route   POST /api/message/forward
// @access  Private
const forwardMessage = asyncHandler(async (req, res) => {
  const { messageId, chatIds } = req.body;
  const io = req.app.get("io"); // Get socket.io instance

  if (
    !messageId ||
    !chatIds ||
    !Array.isArray(chatIds) ||
    chatIds.length === 0
  ) {
    res.status(400);
    throw new Error("Message ID and chat IDs are required");
  }

  // Get original message
  const originalMessage = await Message.findById(messageId).populate(
    "sender",
    "name image"
  );

  if (!originalMessage) {
    res.status(404);
    throw new Error("Original message not found");
  }

  // Verify user has access to original message
  const originalChat = await Chat.findById(originalMessage.chat);
  if (!originalChat || !originalChat.isMember(req.user._id)) {
    res.status(403);
    throw new Error("Not authorized to forward this message");
  }

  const forwardedMessages = [];

  for (const chatId of chatIds) {
    try {
      // === FIX START ===
      // STEP 1: Find target chat WITHOUT populating
      let targetChat = await Chat.findById(chatId);

      // STEP 2: Run isMember check
      if (!targetChat || !targetChat.isMember(req.user._id)) {
        continue; // Skip if not a member
      }

      // STEP 3: NOW populate for block check
      targetChat = await targetChat.populate(
        "users",
        "blockedUsers"
      );
      // === FIX END ===

      // Check blocks
      const isBlocked = targetChat.users.some(
        (user) => user.blockedUsers && user.hasBlocked(req.user._id)
      );

      if (isBlocked) {
        continue; // Skip if blocked
      }

      // Create forwarded message
      const forwardedData = {
        sender: req.user._id,
        chat: chatId,
        content: originalMessage.content,
        file: originalMessage.file,
        messageType: originalMessage.messageType,
        forwardedFrom: messageId,
      };

      let newMessage = await Message.create(forwardedData);
      newMessage = await newMessage.populate("sender", "name image status");
      newMessage = await newMessage.populate("chat"); // Populate chat for socket emit
      newMessage = await User.populate(newMessage, { // Populate users for socket emit
        path: "chat.users",
        select: "name image status isOnline lastSeen",
      });


      await Chat.findByIdAndUpdate(chatId, { latestMessage: newMessage._id });

      forwardedMessages.push(newMessage);

      // --- FIX: Emit to the room ID (chatId) ---
      io.to(chatId.toString()).emit("message received", newMessage);
      
    } catch (error) {
      console.error(`Failed to forward to chat ${chatId}:`, error);
    }
  }

  // Update forward count on original message
  await Message.findByIdAndUpdate(messageId, {
    $inc: { forwardCount: forwardedMessages.length },
  });

  res.json({
    success: true,
    forwardedTo: forwardedMessages.length,
    messages: forwardedMessages,
  });
});

// @desc    Mark messages as read
// @route   PUT /api/message/read
// @access  Private
const markMessagesAsRead = asyncHandler(async (req, res) => {
  const { chatId } = req.body;

  if (!chatId) {
    res.status(400);
    throw new Error("Chat ID is required");
  }

  // --- FIX: Use updateMany for efficiency ---

  // Define the filter for unread messages
  const filter = {
    chat: chatId,
    sender: { $ne: req.user._id },
    "readBy.user": { $ne: req.user._id },
  };

  // Define the update operation
  const update = {
    $push: {
      readBy: {
        user: req.user._id,
        readAt: new Date(),
      },
    },
  };

  // Perform a single updateMany operation
  const result = await Message.updateMany(filter, update);

  res.json({
    success: true,
    markedAsRead: result.modifiedCount, // Use the count from the update result
  });
});

// @desc    React to a message
// @route   POST /api/message/react
// @access  Private
const reactToMessage = asyncHandler(async (req, res) => {
  const { messageId, emoji } = req.body;

  const validEmojis = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "👏"];

  if (!validEmojis.includes(emoji)) {
    res.status(400);
    throw new Error("Invalid emoji");
  }

  const message = await Message.findById(messageId).populate(
    "sender",
    "name"
  );

  if (!message) {
    res.status(404);
    throw new Error("Message not found");
  }

  // Check access
  const chat = await Chat.findById(message.chat);
  if (!chat || !chat.isMember(req.user._id)) {
    res.status(403);
    throw new Error("Not authorized");
  }

  await message.addReaction(req.user._id, emoji);

  const io = req.app.get("io");
  // Emit the event from the server
  io.to(message.chat.toString()).emit("reaction added", {
    messageId: message._id,
    reaction: { user: req.user, emoji: emoji }, // Send the full reaction
    userId: req.user._id,
  });

  const updatedMessage = await Message.findById(messageId).populate(
    "reactions.user",
    "name image"
  );

  res.json(updatedMessage);
});

// @desc    Remove reaction from message
// @route   DELETE /api/message/react
// @access  Private
const removeReaction = asyncHandler(async (req, res) => {
  const { messageId } = req.body;

  const message = await Message.findById(messageId);

  if (!message) {
    res.status(404);
    throw new Error("Message not found");
  }

  await message.removeReaction(req.user._id);

  const updatedMessage = await Message.findById(messageId).populate(
    "reactions.user",
    "name image"
  );

  res.json(updatedMessage);
});

// @desc    Delete message
// @route   DELETE /api/message/:messageId
// @access  Private
const deleteMessage = asyncHandler(async (req, res) => {
  const message = await Message.findById(req.params.messageId);

  if (!message) {
    res.status(404);
    throw new Error("Message not found");
  }

  // Only sender can delete
  if (message.sender.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Not authorized to delete this message");
  }

  // Soft delete - mark as deleted
  message.isDeleted = true;
  await message.save();
  
  // --- FIX: Emit delete event to chat room ---
  const io = req.app.get("io");
  io.to(message.chat.toString()).emit("message deleted", {
    messageId: message._id,
    chatId: message.chat,
  });

  res.json({ success: true, message: "Message deleted" });
});

// @desc    Delete message for me (soft delete)
// @route   PUT /api/message/:messageId/deleteforme
// @access  Private
const deleteMessageForMe = asyncHandler(async (req, res) => {
  const message = await Message.findById(req.params.messageId);

  if (!message) {
    res.status(404);
    throw new Error("Message not found");
  }

  // Add user to deletedFor array
  if (!message.deletedFor.includes(req.user._id)) {
    message.deletedFor.push(req.user._id);
    await message.save();
  }

  res.json({ success: true, message: "Message deleted for you" });
});

// @desc    Search messages in a chat
// @route   GET /api/message/search?query=text&chatId=xxx
// @access  Private
const searchMessages = asyncHandler(async (req, res) => {
  const { query, chatId } = req.query;

  if (!query || query.trim().length === 0) {
    res.status(400);
    throw new Error("Search query is required");
  }

  // Build search filter
  const searchFilter = {
    chat: chatId,
    isDeleted: false,
    deletedFor: { $ne: req.user._id },
    $or: [
      { content: { $regex: query, $options: "i" } },
      { "file.filename": { $regex: query, $options: "i" } },
    ],
  };

  // If chatId provided, verify access
  if (chatId) {
    const chat = await Chat.findById(chatId);
    if (!chat || !chat.isMember(req.user._id)) {
      res.status(403);
      throw new Error("Not authorized to search in this chat");
    }
  } else {
    // Search in all user's chats
    const userChats = await Chat.find({ users: req.user._id }).select("_id");
    const chatIds = userChats.map((chat) => chat._id);
    searchFilter.chat = { $in: chatIds };
  }

  const results = await Message.find(searchFilter)
    .populate("sender", "name image")
    .populate("chat", "chatName isGroupChat")
    .sort({ createdAt: -1 })
    .limit(50);

  res.json({
    results,
    count: results.length,
  });
});

// @desc    Download file from message
// @route   GET /api/message/download/:messageId
// @access  Private
const downloadFile = asyncHandler(async (req, res) => {
  const message = await Message.findById(req.params.messageId);

  if (!message || !message.file || !message.file.filepath) {
    res.status(404);
    throw new Error("File not found");
  }

  // Verify access
  const chat = await Chat.findById(message.chat);
  if (!chat || !chat.isMember(req.user._id)) {
    res.status(403);
    throw new Error("Not authorized to download this file");
  }

  // For Cloudinary URLs, redirect to the file
  res.redirect(message.file.filepath);
});

// @desc    Get unread message count for all chats
// @route   GET /api/message/unread
// @access  Private
const getUnreadCount = asyncHandler(async (req, res) => {
  // Get all user's chats
  const userChats = await Chat.find({ users: req.user._id }).select("_id");
  const chatIds = userChats.map((chat) => chat._id);

  // --- FIX: Use aggregation for efficient unread count ---
  const unreadCounts = await Message.aggregate([
    {
      $match: {
        chat: { $in: chatIds },
        sender: { $ne: req.user._id },
        "readBy.user": { $ne: req.user._id },
        isDeleted: false,
        deletedFor: { $ne: req.user._id },
      }
    },
    {
      $group: {
        _id: "$chat",
        unreadCount: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        chatId: "$_id",
        unreadCount: 1
      }
    }
  ]);

  // Create a map for chats that have unread messages
  const unreadMap = new Map(
    unreadCounts.map(item => [item.chatId.toString(), item.unreadCount])
  );

  let totalUnread = 0;
  const chatUnreadData = [];

  // Ensure all chats are represented, even with 0 unread
  chatIds.forEach(chatId => {
    const count = unreadMap.get(chatId.toString()) || 0;
    if (count > 0) {
      chatUnreadData.push({ chatId: chatId.toString(), unreadCount: count });
    }
    totalUnread += count;
  });

  res.json({
    totalUnread,
    chats: chatUnreadData,
  });
});

// THIS MUST BE AT THE END OF THE FILE
module.exports = {
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
  getUnreadCount,
};
