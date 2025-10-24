const express = require('express');
const dotenv = require('dotenv');
const { connectDB } = require('./config/db');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const chatRoutes = require('./routes/chatRoutes');
const messageRoutes = require('./routes/messageRoutes');

// Import middleware
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { checkDbConnection } = require('./middleware/dbCheck');
const { generalLimiter } = require('./middleware/rateLimiter');

dotenv.config();

// Initialize database
connectDB();

const app = express();

app.set('trust proxy', 1); // Trust the first proxy
// ---------------------

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
app.use(cors({
  origin:  true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Apply general rate limiter to all routes
app.use(generalLimiter);

// Database connection check middleware
app.use(checkDbConnection);

// Welcome route
app.get('/', (req, res) => {
  res.json({
    message: '🎉 Chat App API is running successfully!',
    version: '1.0.0', // Simplified version
    features: [
      '✅ Message Read Receipts',
      '✅ Unread Count',
      '✅ Message Attachments',
      '✅ Rate Limiting',
      '✅ Block Users',
      '✅ react message',
      '✅ Group Chats',
      '✅ Message Search',
      '✅ Message Reactions',
      '✅ Message Forwarding'
    ],
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      chats: '/api/chat',
      messages: '/api/message'
    }
  });
});

// Health check route
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/message', messageRoutes);

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

module.exports = app;