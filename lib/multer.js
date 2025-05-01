// src/lib/multer.js
import multer from "multer";

// Configure Multer to store files in memory as Buffers
// This is efficient for processing and uploading to services like Cloudinary
const storage = multer.memoryStorage();

// Optional: Define file filter function to control allowed file types/sizes
const fileFilter = (req, file, cb) => {
  // Example: Allow only common image types and PDFs
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "video/mp4",
    "video/quicktime",
    "audio/mpeg",
    "audio/ogg",
  ];
  if (allowedTypes.includes(file.mimetype)) {
    // Accept the file
    cb(null, true);
  } else {
    // Reject the file
    console.warn(`Multer rejected file type: ${file.mimetype}`);
    // Pass an error message to be caught later
    cb(
      new Error(
        "Invalid file type. Allowed types: JPG, PNG, GIF, WEBP, PDF, MP4, MOV, MP3, OGG"
      ),
      false
    );
  }
};

// Configure Multer middleware instance
const upload = multer({
  storage: storage, // Use memory storage
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB file size limit (adjust as needed)
  },
  fileFilter: fileFilter, // Apply the file filter
});

export default upload; // Export the configured Multer instance
