// src/models/Chat.js
import mongoose from "mongoose";

const chatSchema = new mongoose.Schema(
  {
    name: {
      // Optional: Name for group chats
      type: String,
      trim: true,
    },
    isGroupChat: {
      type: Boolean,
      default: false,
    },
    users: [
      {
        // Participants in the chat
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true, // Index for efficiently finding chats by user
      },
    ],
    latestMessage: {
      // Reference to the most recent message in the chat
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    groupAdmin: {
      // Reference to the admin (if it's a group chat)
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // TODO: Add group avatar if needed
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

export default mongoose.models.Chat || mongoose.model("Chat", chatSchema);
