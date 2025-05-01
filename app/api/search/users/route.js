import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import User from "@/models/User";
import mongoose from "mongoose"; // Import mongoose

// --- GET Search Users ---
export async function GET(req) {
  try {
    await dbConnect();

    const userId = req.headers.get("x-user-id"); // ID of the user performing the search
    if (!userId) {
      return NextResponse.json(
        { message: "Authentication required." },
        { status: 401 }
      );
    }

    // Get search query from URL parameters (e.g., /api/search/users?q=john)
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");

    if (!query || query.trim().length < 2) {
      // Require at least 2 characters for search
      return NextResponse.json(
        { message: "Search query must be at least 2 characters long." },
        { status: 400 }
      );
    }

    // --- Perform Search ---
    // Create a case-insensitive regex for searching username or email
    const searchRegex = new RegExp(query.trim(), "i");

    // Find users matching the query, excluding the user performing the search
    // Limit results for performance
    const users = await User.find({
      _id: { $ne: userId }, // Exclude self
      $or: [{ username: searchRegex }, { email: searchRegex }],
    })
      .select("username email avatar.url") // Select only necessary fields
      .limit(10) // Limit the number of results
      .lean();

    return NextResponse.json({ users }, { status: 200 });
  } catch (error) {
    console.error("Error searching users:", error);
    return NextResponse.json(
      { message: "Failed to search users.", error: error.message },
      { status: 500 }
    );
  }
}
