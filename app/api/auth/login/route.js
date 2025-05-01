// src/app/api/auth/login/route.js
import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import User from "@/models/User";
import { signToken } from "@/lib/jwt";

export async function POST(req) {
  try {
    await dbConnect(); // Ensure database connection

    const { email, password } = await req.json(); // Parse JSON body

    // --- Input Validation ---
    if (!email || !password) {
      return NextResponse.json(
        { message: "Email and password are required." },
        { status: 400 }
      );
    }

    // --- Find User ---
    // Find user by email (case-insensitive search recommended)
    // Crucially, use .select('+password') to explicitly include the password field,
    // as it's excluded by default in the schema (select: false).
    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+password"
    );

    // --- Verify User and Password ---
    if (!user) {
      // Use a generic message to avoid revealing whether the email exists
      return NextResponse.json(
        { message: "Invalid email or password." },
        { status: 401 }
      ); // 401 Unauthorized
    }

    // Use the comparePassword method defined in the User model
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return NextResponse.json(
        { message: "Invalid email or password." },
        { status: 401 }
      );
    }

    // --- Login Successful - Generate Token ---
    const tokenPayload = { userId: user._id, username: user.username };
    const token = signToken(tokenPayload);

    // --- Prepare User Data for Response ---
    // Exclude password and potentially other sensitive fields
    const userResponse = {
      _id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar.url,
      createdAt: user.createdAt,
      // Add any other fields needed by the frontend
    };

    // --- Create Response and Set HttpOnly Cookie ---
    const response = NextResponse.json(
      {
        user: userResponse,
        message: "Login successful!",
      },
      { status: 200 }
    ); // 200 OK

    response.cookies.set("authToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days (should match JWT expiry)
    });

    // --- Optional: Update lastSeen or online status ---
    // Consider doing this via Socket.IO connection event for real-time accuracy
    // user.lastSeen = new Date();
    // user.online = true; // Set online status if login implies immediate connection
    // await user.save({ validateBeforeSave: false }); // Save without re-validating password etc.

    return response;
  } catch (error) {
    console.error("Login Error:", error);
    // Generic error handler
    return NextResponse.json(
      {
        message: "An unexpected error occurred during login.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
