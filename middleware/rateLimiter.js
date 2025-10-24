const rateLimit = require('express-rate-limit');

// ⭐⭐ Rate Limiting Middleware

/**
 * Rate limiter for authentication endpoints
 * 5 requests per 15 minutes
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: {
    message: 'Too many authentication attempts, please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false
});

/**
 * Rate limiter for message endpoints
 * 100 messages per minute
 */
const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per window
  message: {
    message: 'Too many messages sent, please slow down'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate limiter for file uploads
 * 10 uploads per hour
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 uploads per window
  message: {
    message: 'Too many file uploads, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate limiter for search endpoints
 * 30 searches per minute
 */
const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per window
  message: {
    message: 'Too many search requests, please slow down'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * General API rate limiter
 * 200 requests per 15 minutes
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per window
  message: {
    message: 'Too many requests from this IP, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate limiter for group operations
 * 20 operations per hour
 */
const groupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 requests per window
  message: {
    message: 'Too many group operations, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  authLimiter,
  messageLimiter,
  uploadLimiter,
  searchLimiter,
  generalLimiter,
  groupLimiter
};