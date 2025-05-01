// src/models/Message.js
import mongoose from "mongoose";

// Subdocument schema for reactions
const reactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    emoji: {
      type: String,
      required: true,
    },
  },
  { _id: false }
); // Don't generate separate _id for each reaction

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // Index for finding messages by sender
    },
    content: {
      // Text content of the message
      type: String,
      trim: true,
      // Required is false because a message might just be an attachment
    },
    chat: {
      // Reference to the chat this message belongs to
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
      index: true, // Index for efficiently fetching messages for a chat
    },
    readBy: [
      {
        // Array tracking who has read the message and when
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        readAt: { type: Date, default: Date.now },
      },
    ],
    replyToMessage: {
      // Reference to the message being replied to (optional)
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    reactions: [reactionSchema], // Array of reactions
    attachment: {
      // Details of any attached file
      url: { type: String }, // URL from Cloudinary
      public_id: { type: String }, // Cloudinary public ID for management
      fileType: { type: String }, // e.g., 'image', 'video', 'pdf', 'audio'
    },
    isEdited: {
      // Flag indicating if the message has been edited
      type: Boolean,
      default: false,
    },
    deleted: {
      // Flag for soft deletion
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// Ensure that a message has either content or an attachment
messageSchema.pre("validate", function (next) {
  if (!this.content && !this.attachment?.url) {
    next(new Error("Message must have either content or an attachment."));
  } else {
    next();
  }
});

export default mongoose.models.Message ||
  mongoose.model("Message", messageSchema);
