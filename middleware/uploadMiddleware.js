const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
require('dotenv').config();

// Configure Cloudinary
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET 
});

// Configure Cloudinary Storage for Multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'chat_app', // This will create a folder in Cloudinary
    allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'pdf', 'mp4', 'mkv', 'avi'], // Add any formats you want to support
    resource_type: 'auto' // Automatically detect if it's an image, video, or raw file
  }
});

// Configure Multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 * 10 // 10MB file size limit (you can adjust this)
  }
});

module.exports = upload;