// src/lib/cloudinary.js
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier"; // Helper to stream buffers

// Configure Cloudinary SDK with credentials from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true, // Use HTTPS URLs
});

/**
 * Uploads a file buffer to Cloudinary.
 * @param {Buffer} fileBuffer - The buffer containing the file data.
 * @param {object} options - Optional Cloudinary upload options (e.g., folder, public_id).
 * @returns {Promise<object>} - Promise resolving with the Cloudinary upload result.
 */
export const uploadToCloudinary = (fileBuffer, options = {}) => {
  return new Promise((resolve, reject) => {
    // Default options
    const defaultOptions = {
      resource_type: "auto", // Automatically detect resource type (image, video, raw)
      folder: process.env.CLOUDINARY_UPLOAD_FOLDER || "chat_app_uploads", // Use folder from env or default
    };

    // Create an upload stream
    const uploadStream = cloudinary.uploader.upload_stream(
      { ...defaultOptions, ...options }, // Merge default and provided options
      (error, result) => {
        if (error) {
          console.error("Cloudinary Upload Error:", error);
          // Provide a more specific error message if possible
          return reject(
            new Error(
              `Failed to upload file to Cloudinary: ${
                error.message || "Unknown error"
              }`
            )
          );
        }
        if (!result) {
          console.error("Cloudinary Upload Error: No result returned.");
          return reject(
            new Error("Cloudinary upload failed: No result returned.")
          );
        }
        // console.log("Cloudinary Upload Success:", result);
        resolve(result); // Resolve with the upload result object
      }
    );

    // Pipe the file buffer into the upload stream
    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
};

/**
 * Deletes a file from Cloudinary using its public ID.
 * @param {string} publicId - The public ID of the file to delete.
 * @param {object} options - Optional Cloudinary deletion options (e.g., resource_type).
 * @returns {Promise<object>} - Promise resolving with the Cloudinary deletion result.
 */
export const deleteFromCloudinary = (publicId, options = {}) => {
  return new Promise((resolve, reject) => {
    if (!publicId) {
      return reject(new Error("Public ID is required for deletion."));
    }
    // Determine resource type if not provided (important for video/raw deletion)
    const defaultOptions = {
      resource_type: options.resource_type || "image", // Default to image, override if needed
      // invalidate: true // Optional: invalidate CDN cache
    };

    cloudinary.uploader.destroy(
      publicId,
      { ...defaultOptions, ...options },
      (error, result) => {
        if (error) {
          console.error("Cloudinary Deletion Error:", error);
          return reject(
            new Error(
              `Failed to delete file from Cloudinary: ${
                error.message || "Unknown error"
              }`
            )
          );
        }
        // Result typically looks like { result: 'ok' } or { result: 'not found' }
        // console.log("Cloudinary Deletion Result:", result);
        resolve(result);
      }
    );
  });
};

export default cloudinary; // Export the configured Cloudinary instance
