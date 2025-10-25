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
  pingInterval: 25000,
  cors: {
    origin: true,
    credentials: true,
  },
  transports: ['websocket', 'polling'], // Enable both transports
});

// Store active users: { userId: socketId }
const activeUsers = new Map();

io.on('connection', (socket) => {
  console.log('🔌 New socket connection established:', socket.id);

  // Setup - User joins their personal room
  socket.on('setup', async (userData) => {
    console.log('📝 Setup event received:', userData);
    
    if (!userData || !userData._id) {
      console.error('❌ Invalid userData in setup:', userData);
      socket.emit('setup error', { message: 'Invalid user data' });
      return;
    }

    const userId = userData._id.toString(); // Ensure string format
    
    try {
      // Join personal room
      socket.join(userId);
      
      // Store active user
      activeUsers.set(userId, socket.id);
      
      console.log(`✅ User ${userData.name} (ID: ${userId}) joined their room`);
      console.log(`👥 Total active users: ${activeUsers.size}`);
      
      // Update user online status in database
      const updatedUser = await User.findByIdAndUpdate(
        userId, 
        { 
          isOnline: true,
          lastSeen: new Date()
        },
        { new: true }
      );
      
      if (!updatedUser) {
        console.error('❌ User not found in database:', userId);
        socket.emit('setup error', { message: 'User not found' });
        return;
      }
      
      console.log(`🟢 User ${userData.name} is now ONLINE`);
      
      // Emit connected event to the user
      socket.emit('connected', { userId, isOnline: true });
      
      // Broadcast to ALL other users that this user is online
      socket.broadcast.emit('user online', { 
        userId,
        userName: userData.name,
        timestamp: new Date()
      });
      
      // Send list of currently online users to the newly connected user
      const onlineUserIds = Array.from(activeUsers.keys());
      socket.emit('online users list', onlineUserIds);
      
    } catch (error) {
      console.error('❌ Error in setup:', error);
      socket.emit('setup error', { message: error.message });
    }
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
    socket.to(chatId).emit('typing', chatId);
  });

  socket.on('stop typing', (chatId) => {
    socket.to(chatId).emit('stop typing', chatId);
  });

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
          
          // Notify sender about read receipt
          socket.to(message.sender.toString()).emit('message read receipt', {
            messageId,
            chatId,
            readBy: userId
          });
        }
      }
    } catch (error) {
      console.error('❌ Error marking message as read:', error);
    }
  });

  // Message reaction
  socket.on('message reaction', (data) => {
    const { messageId, chatId, reaction, userId } = data;
    
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

  // Get online users (on demand)
  socket.on('get online users', () => {
    const onlineUserIds = Array.from(activeUsers.keys());
    console.log('📋 Sending online users list:', onlineUserIds);
    socket.emit('online users list', onlineUserIds);
  });

  // Disconnect handler
  socket.on('disconnect', async () => {
    console.log('🔌 Socket disconnected:', socket.id);
    
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
      console.log(`🔴 User ${disconnectedUserId} disconnected`);
      console.log(`👥 Total active users: ${activeUsers.size}`);
      
      try {
        // Update user offline status
        const user = await User.findByIdAndUpdate(
          disconnectedUserId,
          {
            isOnline: false,
            lastSeen: new Date()
          },
          { new: true }
        );
        
        if (user) {
          console.log(`🔴 User ${user.name} is now OFFLINE`);
          
          // Broadcast to ALL users that this user went offline
          socket.broadcast.emit('user offline', {
            userId: disconnectedUserId,
            userName: user.name,
            lastSeen: user.lastSeen,
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('❌ Error updating offline status:', error);
      }
    } else {
      console.log('⚠️ Disconnected socket was not in activeUsers map');
    }
  });

  // Handle connection errors
  socket.on('error', (error) => {
    console.error('❌ Socket error:', error);
  });
});

// Store io instance in app for use in routes
app.set('io', io);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('⚠️ SIGTERM received, closing server gracefully...');
  
  // Set all active users to offline
  for (const userId of activeUsers.keys()) {
    try {
      await User.findByIdAndUpdate(userId, {
        isOnline: false,
        lastSeen: new Date()
      });
    } catch (error) {
      console.error(`Error setting user ${userId} offline:`, error);
    }
  }
  
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔌 Socket.IO ready for connections`);
});
