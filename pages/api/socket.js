// pages/api/socket.js
// This specific path is used to initialize the Socket.IO server.
// It leverages the Pages Router API capability even within an App Router project.

import { Server } from "socket.io";
import { verifyToken } from "@/lib/jwt"; // Your JWT verification function
import dbConnect from "@/lib/dbConnect";
import User from "@/models/User";
import Message from "@/models/Message";
import Chat from "@/models/Chat";
import { deleteFromCloudinary } from "@/lib/cloudinary"; // For deleting attachments

// In-memory store for online users: Map<userId: string, socketId: string>
// For scaling, replace this with a Redis-based store (e.g., using socket.io-redis-adapter)
const onlineUsers = new Map();

const SocketHandler = (req, res) => {
  // Check if Socket.IO server is already initialized
  if (res.socket.server.io) {
    console.log("Socket.IO server already running.");
  } else {
    console.log("Initializing Socket.IO server...");
    const io = new Server(res.socket.server, {
      path: "/api/socket_io", // Custom path for the socket connection endpoint
      addTrailingSlash: false,
      cors: {
        origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000", // Allow connections from frontend URL
        methods: ["GET", "POST"],
        credentials: true, // Allow cookies if needed (though JWT in auth header is preferred)
      },
      // Optional: Increase ping timeout/interval if needed
      // pingTimeout: 60000,
      // pingInterval: 25000,
    });

    // --- Socket.IO Middleware for Authentication ---
    io.use(async (socket, next) => {
      try {
        // Extract token from handshake (sent by client)
        const token = socket.handshake.auth?.token;

        if (!token) {
          console.error("[Socket Auth] Failed: No token provided.");
          return next(new Error("Authentication error: Token not provided"));
        }

        // Verify the token
        const decoded = verifyToken(token);
        if (!decoded || !decoded.userId) {
          console.error("[Socket Auth] Failed: Invalid or expired token.");
          return next(new Error("Authentication error: Invalid token"));
        }

        // Optional but recommended: Verify user exists in DB
        await dbConnect();
        const user = await User.findById(decoded.userId).lean(); // Use lean for performance
        if (!user) {
          console.error(
            `[Socket Auth] Failed: User ${decoded.userId} not found.`
          );
          return next(new Error("Authentication error: User not found"));
        }

        // Attach user information to the socket object for easy access in event handlers
        socket.user = {
          _id: user._id.toString(), // Ensure ID is a string
          username: user.username,
          // Add other non-sensitive info if needed
        };

        console.log(
          `[Socket Auth] User ${socket.user.username} (ID: ${socket.user._id}) authenticated successfully.`
        );
        next(); // Proceed with connection
      } catch (error) {
        console.error("[Socket Auth] Error during authentication:", error);
        next(new Error("Authentication error: Internal server error"));
      }
    });

    // --- Main Connection Handler ---
    io.on("connection", async (socket) => {
      console.log(
        `✅ User connected: ${socket.user.username} (Socket ID: ${socket.id})`
      );
      await dbConnect(); // Ensure DB connection

      // --- Handle Online Status ---
      const userId = socket.user._id;
      onlineUsers.set(userId, socket.id);
      try {
        await User.findByIdAndUpdate(userId, {
          online: true,
          lastSeen: new Date(),
        });
        console.log(`User ${userId} marked as online.`);
        // Broadcast to relevant users that this user is now online
        // Optimization: Only broadcast to users who have chats with this user
        const userChats = await Chat.find({ users: userId })
          .select("users")
          .lean();
        const relevantUserIds = new Set();
        userChats.forEach((chat) => {
          chat.users.forEach((uid) => {
            if (uid.toString() !== userId) relevantUserIds.add(uid.toString());
          });
        });
        relevantUserIds.forEach((relevantUserId) => {
          const recipientSocketId = onlineUsers.get(relevantUserId);
          if (recipientSocketId) {
            io.to(recipientSocketId).emit("userOnline", { userId });
          }
        });
      } catch (error) {
        console.error(
          `Error updating user online status for ${userId}:`,
          error
        );
      }

      // --- Join User to Their Chat Rooms ---
      try {
        const userChats = await Chat.find({ users: userId })
          .select("_id")
          .lean();
        userChats.forEach((chat) => {
          const roomId = chat._id.toString();
          socket.join(roomId);
          console.log(`${socket.user.username} joined chat room: ${roomId}`);
        });
      } catch (error) {
        console.error(
          `Error fetching/joining chat rooms for user ${userId}:`,
          error
        );
      }

      // --- Socket Event Handlers ---

      // 1. Send Message
      socket.on("sendMessage", async (data, callback) => {
        const { chatId, content, attachment, replyToMessageId } = data;
        console.log(
          `[Socket Event] sendMessage received for chat ${chatId} from ${socket.user.username}`
        );

        if (!chatId || (!content?.trim() && !attachment)) {
          console.warn(
            `[sendMessage] Invalid data from ${socket.user.username}: Missing chatId or content/attachment.`
          );
          return callback?.({
            status: "error",
            message: "Chat ID and message content or attachment are required.",
          });
        }

        try {
          // Verify user is part of the chat
          const chat = await Chat.findOne({
            _id: chatId,
            users: socket.user._id,
          });
          if (!chat) {
            console.warn(
              `[sendMessage] User ${socket.user.username} (ID: ${socket.user._id}) attempted to send to unauthorized/invalid chat ${chatId}`
            );
            return callback?.({
              status: "error",
              message: "Chat not found or you are not a member.",
            });
          }

          // Create new message document
          const messageData = {
            sender: socket.user._id,
            chat: chatId,
            content: content?.trim(), // Trim whitespace
            ...(replyToMessageId && { replyToMessage: replyToMessageId }),
            ...(attachment && {
              attachment: {
                url: attachment.url,
                public_id: attachment.public_id,
                fileType: attachment.fileType,
              },
            }),
            readBy: [{ userId: socket.user._id, readAt: new Date() }], // Sender automatically reads
          };

          const message = new Message(messageData);
          await message.save();
          console.log(`Message ${message._id} saved to DB for chat ${chatId}`);

          // Update latest message in the chat document
          chat.latestMessage = message._id;
          await chat.save();

          // Populate necessary fields for broadcasting
          const populatedMessage = await Message.findById(message._id)
            .populate("sender", "username avatar.url") // Populate sender info
            .populate({
              // Populate replied message snippet if it exists
              path: "replyToMessage",
              select: "content sender attachment.fileType deleted", // Select needed fields
              populate: { path: "sender", select: "username" }, // Populate sender of replied message
            })
            .lean(); // Use lean for sending plain objects

          // Broadcast the new message to everyone in the chat room (including sender)
          const roomId = chatId.toString();
          io.to(roomId).emit("newMessage", populatedMessage);
          console.log(`Message ${message._id} broadcasted to room ${roomId}`);

          // Acknowledge success to the sender
          callback?.({ status: "ok", message: populatedMessage });
        } catch (error) {
          console.error(
            `[sendMessage] Error sending message in chat ${chatId} by user ${socket.user.username}:`,
            error
          );
          callback?.({
            status: "error",
            message: `Failed to send message: ${error.message}`,
          });
        }
      });

      // 2. Typing Indicator
      socket.on("typing", ({ chatId, isTyping }) => {
        const roomId = chatId.toString();
        // Broadcast to everyone *except* the sender
        socket.to(roomId).emit("typing", {
          chatId,
          userId: socket.user._id,
          username: socket.user.username,
          isTyping,
        });
        // console.log(`${socket.user.username} is ${isTyping ? 'typing' : 'stopped typing'} in chat ${chatId}`);
      });

      // 3. Read Receipts
      socket.on("messageRead", async ({ chatId, messageIds }, callback) => {
        if (!chatId || !Array.isArray(messageIds) || messageIds.length === 0) {
          console.warn(
            `[messageRead] Invalid data received from ${socket.user.username}:`,
            { chatId, messageIds }
          );
          return callback?.({
            status: "error",
            message: "Invalid input for marking messages as read.",
          });
        }
        const readerId = socket.user._id;
        const readAt = new Date();
        console.log(
          `[messageRead] User ${readerId} read messages in chat ${chatId}:`,
          messageIds
        );

        try {
          // Update messages in DB, adding the reader only if they haven't read it yet
          const updateResult = await Message.updateMany(
            {
              _id: { $in: messageIds },
              chat: chatId,
              "readBy.userId": { $ne: readerId }, // Only update if reader is NOT already in readBy
            },
            {
              $addToSet: { readBy: { userId: readerId, readAt: readAt } },
            }
          );

          console.log(
            `[messageRead] DB update result for chat ${chatId}: Matched ${updateResult.matchedCount}, Modified ${updateResult.modifiedCount}`
          );

          if (updateResult.modifiedCount > 0) {
            // Notify other users in the chat that messages were read by this user
            const roomId = chatId.toString();
            // Emit to everyone except the current reader
            socket.to(roomId).emit("messagesRead", {
              chatId,
              readerId: readerId,
              messageIds,
              readAt,
            });
          }
          callback?.({
            status: "ok",
            modifiedCount: updateResult.modifiedCount,
          });
        } catch (error) {
          console.error(
            `[messageRead] Error updating read receipts for chat ${chatId} by user ${readerId}:`,
            error
          );
          callback?.({
            status: "error",
            message: "Failed to update read receipts.",
          });
        }
      });

      // 4. Toggle Message Reaction
      socket.on("toggleReaction", async ({ messageId, emoji }, callback) => {
        if (!messageId || !emoji) {
          return callback?.({
            status: "error",
            message: "Message ID and emoji are required.",
          });
        }
        const userId = socket.user._id;
        console.log(
          `[toggleReaction] User ${userId} toggling reaction '${emoji}' on message ${messageId}`
        );

        try {
          const message = await Message.findById(messageId);
          if (!message) {
            return callback?.({
              status: "error",
              message: "Message not found.",
            });
          }
          if (message.deleted) {
            return callback?.({
              status: "error",
              message: "Cannot react to a deleted message.",
            });
          }

          // Verify user is part of the chat associated with the message
          const chat = await Chat.exists({ _id: message.chat, users: userId });
          if (!chat) {
            console.warn(
              `[toggleReaction] Unauthorized attempt by user ${userId} on message ${messageId}`
            );
            return callback?.({
              status: "error",
              message: "Not authorized to react in this chat.",
            });
          }

          const existingReactionIndex = message.reactions.findIndex(
            (r) => r.userId.toString() === userId && r.emoji === emoji
          );

          if (existingReactionIndex > -1) {
            // User is removing this specific reaction
            message.reactions.splice(existingReactionIndex, 1);
            console.log(
              `[toggleReaction] User ${userId} removed reaction '${emoji}' from message ${messageId}`
            );
          } else {
            // Add reaction (or update if user already reacted with a different emoji - optional)
            // Simple approach: Allow multiple reactions per user? Or replace previous? Let's replace.
            message.reactions = message.reactions.filter(
              (r) => r.userId.toString() !== userId
            ); // Remove previous reactions by this user
            message.reactions.push({ userId: userId, emoji: emoji });
            console.log(
              `[toggleReaction] User ${userId} added reaction '${emoji}' to message ${messageId}`
            );
          }

          await message.save();

          // Broadcast the entire updated reactions array for this message
          const roomId = message.chat.toString();
          io.to(roomId).emit("messageUpdated", {
            _id: message._id, // Send message ID
            chatId: roomId,
            reactions: message.reactions, // Send the full reaction array
          });
          console.log(
            `[toggleReaction] Broadcasted reaction update for message ${messageId} to room ${roomId}`
          );

          callback?.({ status: "ok", reactions: message.reactions });
        } catch (error) {
          console.error(
            `[toggleReaction] Error toggling reaction for message ${messageId} by user ${userId}:`,
            error
          );
          callback?.({
            status: "error",
            message: "Failed to update reaction.",
          });
        }
      });

      // 5. Edit Message
      socket.on("editMessage", async ({ messageId, newContent }, callback) => {
        if (
          !messageId ||
          typeof newContent !== "string" ||
          !newContent.trim()
        ) {
          return callback?.({
            status: "error",
            message: "Message ID and valid new content are required.",
          });
        }
        const userId = socket.user._id;
        const trimmedContent = newContent.trim();
        console.log(
          `[editMessage] User ${userId} editing message ${messageId}`
        );

        try {
          // Find the message, ensuring it was sent by the current user and not deleted
          const message = await Message.findOne({
            _id: messageId,
            sender: userId,
            deleted: { $ne: true },
          });

          if (!message) {
            return callback?.({
              status: "error",
              message:
                "Message not found, already deleted, or you are not the sender.",
            });
          }

          // Prevent editing if content is the same
          if (message.content === trimmedContent) {
            return callback?.({
              status: "ok",
              message: "No changes detected.",
            });
          }

          // Update message content and mark as edited
          message.content = trimmedContent;
          message.isEdited = true;
          message.updatedAt = new Date(); // Manually update timestamp if needed
          await message.save();

          // Populate necessary fields for broadcasting the update
          const populatedMessage = await Message.findById(message._id)
            .populate("sender", "username avatar.url")
            .populate({
              path: "replyToMessage",
              select: "content sender attachment.fileType deleted",
              populate: { path: "sender", select: "username" },
            })
            .lean();

          // Broadcast the entire updated message object to the chat room
          const roomId = message.chat.toString();
          io.to(roomId).emit("messageEdited", populatedMessage);
          console.log(
            `[editMessage] Broadcasted edit update for message ${messageId} to room ${roomId}`
          );

          callback?.({ status: "ok", message: populatedMessage });
        } catch (error) {
          console.error(
            `[editMessage] Error editing message ${messageId} by user ${userId}:`,
            error
          );
          callback?.({ status: "error", message: "Failed to edit message." });
        }
      });

      // 6. Delete Message
      socket.on("deleteMessage", async ({ messageId }, callback) => {
        if (!messageId) {
          return callback?.({
            status: "error",
            message: "Message ID is required.",
          });
        }
        const userId = socket.user._id;
        console.log(
          `[deleteMessage] User ${userId} deleting message ${messageId}`
        );

        try {
          // Find the message, ensuring it was sent by the current user and not already deleted
          // TODO: Add logic for group admins to delete messages if required
          const message = await Message.findOne({
            _id: messageId,
            sender: userId,
            deleted: { $ne: true },
          });

          if (!message) {
            return callback?.({
              status: "error",
              message:
                "Message not found, already deleted, or you are not authorized.",
            });
          }

          const attachmentToDelete = message.attachment?.public_id; // Store public_id before clearing

          // --- Soft Delete Implementation ---
          message.content = ""; // Clear content (or set to "[deleted]")
          message.deleted = true;
          message.isEdited = false; // Clear edited status
          message.attachment = undefined; // Remove attachment info from message doc
          message.reactions = []; // Clear reactions
          message.replyToMessage = undefined; // Clear reply reference if needed
          message.updatedAt = new Date(); // Update timestamp

          await message.save();
          console.log(
            `[deleteMessage] Message ${messageId} marked as deleted in DB.`
          );

          // --- Broadcast Deletion Event ---
          // Send only the necessary info for clients to update their UI
          const roomId = message.chat.toString();
          io.to(roomId).emit("messageDeleted", {
            chatId: roomId,
            messageId: message._id,
            senderId: userId, // Identify who deleted it (optional)
          });
          console.log(
            `[deleteMessage] Broadcasted deletion update for message ${messageId} to room ${roomId}`
          );

          // --- Asynchronously Delete Attachment from Cloudinary (if exists) ---
          if (attachmentToDelete) {
            deleteFromCloudinary(attachmentToDelete)
              .then((deleteResult) =>
                console.log(
                  `[deleteMessage] Cloudinary attachment ${attachmentToDelete} deletion result:`,
                  deleteResult.result
                )
              )
              .catch((deleteError) =>
                console.error(
                  `[deleteMessage] Failed to delete Cloudinary attachment ${attachmentToDelete}:`,
                  deleteError
                )
              );
          }

          callback?.({ status: "ok" });
        } catch (error) {
          console.error(
            `[deleteMessage] Error deleting message ${messageId} by user ${userId}:`,
            error
          );
          callback?.({ status: "error", message: "Failed to delete message." });
        }
      });

      // --- Handle Disconnect ---
      socket.on("disconnect", async (reason) => {
        const disconnectedUserId = socket.user?._id;
        console.log(
          `🔻 User disconnected: ${socket.user?.username} (ID: ${disconnectedUserId}), Reason: ${reason}`
        );

        if (disconnectedUserId) {
          // Only remove from onlineUsers map if this specific socket instance was the one stored
          if (onlineUsers.get(disconnectedUserId) === socket.id) {
            onlineUsers.delete(disconnectedUserId);
            console.log(`User ${disconnectedUserId} removed from online map.`);
            try {
              // Update user status in DB
              await User.findByIdAndUpdate(disconnectedUserId, {
                online: false,
                lastSeen: new Date(),
              });
              console.log(`User ${disconnectedUserId} marked as offline.`);

              // Broadcast offline status to relevant users
              const userChats = await Chat.find({ users: disconnectedUserId })
                .select("users")
                .lean();
              const relevantUserIds = new Set();
              userChats.forEach((chat) => {
                chat.users.forEach((uid) => {
                  if (uid.toString() !== disconnectedUserId)
                    relevantUserIds.add(uid.toString());
                });
              });
              relevantUserIds.forEach((relevantUserId) => {
                const recipientSocketId = onlineUsers.get(relevantUserId);
                if (recipientSocketId) {
                  io.to(recipientSocketId).emit("userOffline", {
                    userId: disconnectedUserId,
                  });
                }
              });
            } catch (dbError) {
              console.error(
                `Error updating user status on disconnect for ${disconnectedUserId}:`,
                dbError
              );
            }
          } else {
            // This can happen if user has multiple tabs/devices connected
            console.log(
              `User ${disconnectedUserId} disconnected, but another socket (${onlineUsers.get(
                disconnectedUserId
              )}) might still be active.`
            );
          }
        }
      });

      // --- Error Handling ---
      socket.on("error", (error) => {
        console.error(
          `Socket Error for user ${socket.user?.username} (ID: ${socket.user?._id}):`,
          error
        );
        // Implement appropriate error handling/logging
      });
    });

    // Attach the io instance to the response socket server object
    res.socket.server.io = io;
  }
  // End the response for the initial HTTP request that sets up the socket server
  res.end();
};

export default SocketHandler;
