const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    // --- FIX: Removed deprecated options ---
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

// --- FIX: Added function to check DB connection state ---
const isDbConnected = () => {
  return mongoose.connection.readyState === 1; // 1 = connected
};

// --- FIX: Updated exports ---
module.exports = { connectDB, isDbConnected };
