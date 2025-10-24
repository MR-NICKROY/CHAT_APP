const app = require('./app');
const http = require('http');
const { Server } = require('socket.io');
const User = require('./models/User');
const Message = require('./models/Message');
require('dotenv').config();

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

const io = new Server(server, {
  pingTimeout: 60000,
  cors: {
    origin: true,
    credentials: true,
  },
});

// Store active users: { userId: socketId }
const activeUsers = new Map();

io.on('connection', (socket) => {
  console.log('🔌 A user connected to socket.io');

  // Setup - User joins their personal room
  socket.on('setup', async (userData) => {
    if (!userData || !userData._id) {
      return;
    }

    const userId = userData._id;
    socket.join(userId);
    activeUsers.set(userId, socket.id);
    
    console.log(`✅ User ${userData.name} (ID: ${userId}) joined their room`);
    
    // Update user online status in database
    try {
      await User.findByIdAndUpdate(userId, { isOnline: true });
      
      // Broadcast to all users that this user is online
      socket.broadcast.emit('user online', userId);
    } catch (error) {
      console.error('Error updating online status:', error);
    }
    
    socket.emit('connected');
  });

  // Join a specific chat room
  socket.on('join chat', (chatId) => {
    socket.join(chatId);
    console.log(`👥 User joined chat room: ${chatId}`);
  });

  // Leave a chat room
  socket.on('leave chat', (chatId) => {
    socket.leave(chatId);
    console.log(`👋 User left chat room: ${chatId}`);
  });

  // Typing indicator
  socket.on('typing', (chatId) => {
    // --- FIX: Emit to chat room, not personal room ---
    socket.to(chatId).emit('typing', chatId);
  });

  socket.on('stop typing', (chatId) => {
    // --- FIX: Emit to chat room, not personal room ---
    socket.to(chatId).emit('stop typing', chatId);
  });

  // --- FIX: Removed 'new message' handler ---
  // This logic is now handled in messageController.js to ensure
  // messages are only broadcast *after* they are saved to the database.
  // This prevents duplicate messages and race conditions.

  // Message read receipt
  socket.on('message read', async (data) => {
    const { chatId, messageId, userId } = data;
    
    try {
      const message = await Message.findById(messageId);
      
      if (message) {
        // Check if already read
        const alreadyRead = message.readBy.some(
          r => r.user.toString() === userId.toString()
        );
        
        if (!alreadyRead) {
          message.readBy.push({
            user: userId,
            readAt: new Date()
          });
          await message.save();
          
          // Notify sender (in their personal room) about read receipt
          socket.to(message.sender.toString()).emit('message read receipt', {
            messageId,
            chatId,
            readBy: userId
          });
        }
      }
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  });

  // Message reaction
  socket.on('message reaction', (data) => {
    const { messageId, chatId, reaction, userId } = data;
    
    // Broadcast reaction to all users in chat
    socket.to(chatId).emit('reaction added', {
      messageId,
      reaction,
      userId
    });
  });

  // User starts recording voice message
  socket.on('recording started', (chatId) => {
    socket.to(chatId).emit('user recording', chatId);
  });

  socket.on('recording stopped', (chatId) => {
    socket.to(chatId).emit('user stopped recording', chatId);
  });

  // Disconnect
  socket.on('disconnect', async () => {
    console.log('🔌 User disconnected');
    
    // Find and remove user from active users
    let disconnectedUserId = null;
    
    for (const [userId, socketId] of activeUsers.entries()) {
      if (socketId === socket.id) {
        disconnectedUserId = userId;
        activeUsers.delete(userId);
        break;
      }
    }
    
    if (disconnectedUserId) {
      try {
        // Update user offline status
        const user = await User.findById(disconnectedUserId);
        if (user) {
          user.isOnline = false;
          user.lastSeen = new Date();
          await user.save();
          
          // Broadcast to all users that this user went offline
          socket.broadcast.emit('user offline', {
            userId: disconnectedUserId,
            lastSeen: user.lastSeen
          });
          
          console.log(`❌ User ${disconnectedUserId} went offline`);
        }
      } catch (error) {
        console.error('Error updating offline status:', error);
      }
    }
  });

  // Get online users
  socket.on('get online users', () => {
    const onlineUserIds = Array.from(activeUsers.keys());
    socket.emit('online users', onlineUserIds);
  });
});

// Store io instance in app for use in routes
app.set('io', io);

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
