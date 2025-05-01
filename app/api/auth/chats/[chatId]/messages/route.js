import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Message from "@/models/Message";
import Chat from "@/models/Chat"; // To verify user access

// --- GET Messages for a specific chat ---
export async function GET(req, { params }) {
  const { chatId } = params; // Get chatId from dynamic route segment

  try {
    await dbConnect();

    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json(
        { message: "Authentication required." },
        { status: 401 }
      );
    }

    // --- Validate Input ---
    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
      return NextResponse.json(
        { message: "Invalid Chat ID." },
        { status: 400 }
      );
    }

    // --- Verify User Access to Chat ---
    const chat = await Chat.findOne({ _id: chatId, users: userId }).lean(); // Check if user is in the chat
    if (!chat) {
      return NextResponse.json(
        { message: "Chat not found or access denied." },
        { status: 403 }
      ); // 403 Forbidden
    }

    // --- Fetch Messages ---
    // Implement pagination later if needed (using query params like ?page=1&limit=50)
    const messages = await Message.find({ chat: chatId })
      .populate("sender", "username avatar.url") // Populate sender info
      .populate({
        // Populate replied message snippet
        path: "replyToMessage",
        select: "content sender attachment.fileType deleted",
        populate: { path: "sender", select: "username" },
      })
      .sort({ createdAt: 1 }) // Sort by creation time (oldest first)
      .lean(); // Use lean for performance

    return NextResponse.json({ messages }, { status: 200 });
  } catch (error) {
    console.error(`Error fetching messages for chat ${chatId}:`, error);
    return NextResponse.json(
      { message: "Failed to fetch messages.", error: error.message },
      { status: 500 }
    );
  }
}

// Note: POST, PUT, DELETE for messages are primarily handled via Socket.IO for real-time updates.
// You could add API routes for these as a fallback or for specific admin actions if needed.
