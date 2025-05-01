// src/app/api/upload/route.js
// Handles file uploads (e.g., message attachments) using Multer and Cloudinary

import { NextResponse } from "next/server";
import upload from "@/lib/multer"; // Multer configuration
import { uploadToCloudinary } from "@/lib/cloudinary"; // Cloudinary helper
import { promisify } from "util";
import dbConnect from "@/lib/dbConnect"; // Needed if associating upload with user/chat immediately
import Chat from "@/models/Chat"; // Needed for access control
import mongoose from "mongoose";

// Promisify Multer middleware (single file named 'attachment')
const runMiddleware = promisify(upload.single("attachment"));

// Disable Next.js body parsing for this route
export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(req) {
  try {
    await dbConnect();

    // --- Authentication & Authorization ---
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json(
        { message: "Authentication required." },
        { status: 401 }
      );
    }

    // --- Run Multer Middleware ---
    const mockRes = {
      status: () => mockRes,
      end: () => {},
      setHeader: () => {},
    };
    await runMiddleware(req, mockRes);

    // --- Extract File and Optional Metadata ---
    const file = req.file;
    // Get optional chatId from form data if sent (e.g., to verify permissions)
    const chatId = req.body?.chatId;

    if (!file) {
      return NextResponse.json(
        { message: 'No file provided in the "attachment" field.' },
        { status: 400 }
      );
    }

    // --- Optional: Authorize Upload based on Chat Membership ---
    if (chatId) {
      if (!mongoose.Types.ObjectId.isValid(chatId)) {
        return NextResponse.json(
          { message: "Invalid Chat ID provided." },
          { status: 400 }
        );
      }
      const chat = await Chat.exists({ _id: chatId, users: userId });
      if (!chat) {
        console.warn(
          `[Upload] User ${userId} unauthorized attempt to upload for chat ${chatId}`
        );
        return NextResponse.json(
          { message: "You are not authorized to upload files for this chat." },
          { status: 403 }
        );
      }
      console.log(`[Upload] User ${userId} authorized for chat ${chatId}.`);
    } else {
      console.warn(
        `[Upload] No chatId provided with upload from user ${userId}. Proceeding without chat authorization check.`
      );
      // Decide if uploads without associated chat context are allowed
    }

    // --- Upload to Cloudinary ---
    console.log(
      `[Upload] Uploading file "${file.originalname}" (${file.mimetype}, ${file.size} bytes) to Cloudinary...`
    );
    const result = await uploadToCloudinary(file.buffer, {
      // resource_type is 'auto' by default in our helper
      // Optional: Add specific tags or context if needed
      // tags: ['chat_attachment', chatId],
    });

    // --- Determine File Type Category ---
    let fileType = "file"; // Default type
    if (result.resource_type === "image") fileType = "image";
    else if (result.resource_type === "video") fileType = "video";
    else if (file.mimetype.startsWith("audio/")) fileType = "audio";
    else if (file.mimetype === "application/pdf") fileType = "pdf";
    // Add more specific types as needed

    // --- Prepare Response ---
    const attachmentData = {
      url: result.secure_url,
      public_id: result.public_id,
      fileType: fileType, // Simplified file type category
      originalFilename: file.originalname, // Keep original name for display
      size: result.bytes, // Size in bytes
      format: result.format, // File format detected by Cloudinary
    };

    console.log(`[Upload] File uploaded successfully: ${attachmentData.url}`);
    return NextResponse.json({ attachment: attachmentData }, { status: 201 }); // 201 Created
  } catch (error) {
    console.error("[Upload] Error handling file upload:", error);
    // Handle Multer errors
    if (error instanceof multer.MulterError) {
      return NextResponse.json(
        { message: `File upload error: ${error.message} (${error.code})` },
        { status: 400 }
      );
    }
    // Handle custom Multer filter errors
    if (error.message.startsWith("Invalid file type")) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    // Handle Cloudinary errors
    if (error.message.includes("Cloudinary")) {
      return NextResponse.json(
        { message: "Failed to upload file to storage.", error: error.message },
        { status: 500 }
      );
    }
    // Generic error
    return NextResponse.json(
      {
        message: "An unexpected error occurred during file upload.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
