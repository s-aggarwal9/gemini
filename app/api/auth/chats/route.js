// src/app/api/chats/route.js
import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Chat from "@/models/Chat";
import User from "@/models/User";
import { verifyToken } from "@/lib/jwt"; // Assuming middleware adds user info to headers

// --- GET User's Chats ---
export async function GET(req) {
  try {
    await dbConnect();

    // Get user ID from middleware-added header or verify token manually
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json(
        { message: "Authentication required." },
        { status: 401 }
      );
    }

    // Find chats where the user is a participant
    // Populate necessary fields for display in the chat list
    const chats = await Chat.find({ users: userId })
      .populate("users", "username email avatar.url online lastSeen") // Populate participants' info
      .populate({
        // Populate the latest message snippet
        path: "latestMessage",
        select: "content sender createdAt attachment.fileType deleted",
        populate: { path: "sender", select: "username" }, // Populate sender of latest message
      })
      .sort({ updatedAt: -1 }) // Sort by most recently updated
      .lean(); // Use lean for performance

    // Optionally: Determine chat name for one-on-one chats based on the other user
    const processedChats = chats.map((chat) => {
      if (!chat.isGroupChat && chat.users.length === 2) {
        const otherUser = chat.users.find((u) => u._id.toString() !== userId);
        chat.name = otherUser?.username || "Unknown User"; // Set dynamic name
        chat.avatar = otherUser?.avatar?.url; // Use other user's avatar
      }
      // Ensure users array doesn't include the current user if needed for frontend logic
      // chat.participants = chat.users.filter(u => u._id.toString() !== userId);
      return chat;
    });

    return NextResponse.json({ chats: processedChats }, { status: 200 });
  } catch (error) {
    console.error("Error fetching user chats:", error);
    return NextResponse.json(
      { message: "Failed to fetch chats.", error: error.message },
      { status: 500 }
    );
  }
}

// --- POST Create New Chat (1:1 or Group) ---
export async function POST(req) {
  try {
    await dbConnect();

    const userId = req.headers.get("x-user-id"); // ID of the user initiating the chat
    if (!userId) {
      return NextResponse.json(
        { message: "Authentication required." },
        { status: 401 }
      );
    }

    const { targetUserId, userIds, groupName } = await req.json();

    // --- Input Validation ---
    if (
      (!targetUserId && (!userIds || userIds.length === 0)) ||
      (targetUserId && userIds)
    ) {
      return NextResponse.json(
        {
          message:
            "Provide either targetUserId (for 1:1) or userIds (for group).",
        },
        { status: 400 }
      );
    }

    let chatData;
    let isGroup = false;

    if (targetUserId) {
      // --- Create 1-on-1 Chat ---
      if (targetUserId === userId) {
        return NextResponse.json(
          { message: "Cannot create a chat with yourself." },
          { status: 400 }
        );
      }
      // Check if a 1:1 chat already exists between these two users
      chatData = await Chat.findOne({
        isGroupChat: false,
        users: { $all: [userId, targetUserId], $size: 2 }, // Exactly these two users
      }).populate("users", "username email avatar.url"); // Populate for response

      if (chatData) {
        console.log(
          `1:1 chat already exists between ${userId} and ${targetUserId}. Returning existing chat.`
        );
        return NextResponse.json(
          { chat: chatData, message: "Chat already exists." },
          { status: 200 }
        );
      }

      // Create new 1:1 chat
      chatData = new Chat({
        users: [userId, targetUserId],
        isGroupChat: false,
      });
    } else {
      // --- Create Group Chat ---
      isGroup = true;
      if (userIds.length < 1) {
        // Need at least one other participant besides creator
        return NextResponse.json(
          { message: "Group chat requires at least one other participant." },
          { status: 400 }
        );
      }
      if (!groupName || groupName.trim().length === 0) {
        return NextResponse.json(
          { message: "Group name is required for group chats." },
          { status: 400 }
        );
      }

      const allParticipants = [...new Set([userId, ...userIds])]; // Ensure creator is included and unique IDs
      if (allParticipants.length < 2) {
        // Should be at least 2 for a group
        return NextResponse.json(
          { message: "Invalid participants for group chat." },
          { status: 400 }
        );
      }

      // TODO: Verify all userIds exist in the database before creating

      chatData = new Chat({
        name: groupName.trim(),
        users: allParticipants,
        isGroupChat: true,
        groupAdmin: userId, // Initiator is the admin
      });
    }

    // --- Save the new chat ---
    const newChat = await chatData.save();

    // --- Populate users for the response ---
    const populatedChat = await Chat.findById(newChat._id)
      .populate("users", "username email avatar.url online lastSeen")
      .populate("groupAdmin", "username") // Populate admin if group chat
      .lean();

    // --- Optional: Add chat reference to each user document ---
    // Can be slow for large groups, consider if necessary or handle differently
    await User.updateMany(
      { _id: { $in: populatedChat.users.map((u) => u._id) } },
      { $addToSet: { chats: populatedChat._id } }
    );

    // --- Optional: Emit event via Socket.IO to notify participants ---
    // Requires access to the Socket.IO instance, tricky from API routes.
    // Better handled by client joining rooms on login/refresh.
    // Or use a message queue/pub-sub system.

    return NextResponse.json(
      {
        chat: populatedChat,
        message: `Chat ${isGroup ? "group " : ""}created successfully.`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating chat:", error);
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((el) => el.message);
      return NextResponse.json(
        { message: "Validation failed", errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { message: "Failed to create chat.", error: error.message },
      { status: 500 }
    );
  }
}
