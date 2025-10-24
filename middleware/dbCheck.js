const asyncHandler = require('express-async-handler');
const { isDbConnected } = require('../config/db');

const checkDbConnection = asyncHandler(async (req, res, next) => {
  if (isDbConnected()) {
    // If connected, proceed to the next route
    next();
  } else {
    // If not connected, send a 503 "Service Unavailable" error
    res.status(503);
    throw new Error('Service Unavailable: Database not connected.');
  }
});

module.exports = { checkDbConnection };