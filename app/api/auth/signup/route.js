// src/app/api/auth/signup/route.js
import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import User from "@/models/User";
import upload from "@/lib/multer"; // Multer configuration
import { uploadToCloudinary, deleteFromCloudinary } from "@/lib/cloudinary"; // Cloudinary helpers
import { signToken } from "@/lib/jwt"; // JWT helper
import { promisify } from "util"; // To use middleware with async/await

// Promisify the Multer middleware for use in Next.js API routes
// We'll handle only a single file upload named 'avatar'
const runMiddleware = promisify(upload.single("avatar"));

// IMPORTANT: Disable Next.js default body parsing
// Multer needs to consume the raw stream to handle multipart/form-data
export const config = {
  api: {
    bodyParser: false,
  },
};

// --- POST Handler for Signup ---
export async function POST(req) {
  try {
    await dbConnect(); // Ensure database connection

    // --- Run Multer Middleware ---
    // Need to pass req and a mock res object for Multer compatibility
    const mockRes = {
      status: () => mockRes,
      end: () => {},
      setHeader: () => {},
    };
    await runMiddleware(req, mockRes);

    // --- Extract Data ---
    // Form fields are now available in req.body (populated by Multer)
    const { username, email, password } = req.body;
    // Uploaded file (if any) is in req.file
    const file = req.file;

    // --- Input Validation ---
    if (!username || !email || !password) {
      return NextResponse.json(
        { message: "Username, email, and password are required." },
        { status: 400 }
      );
    }
    // Add more robust validation as needed (e.g., password complexity, username format)
    if (password.length < 6) {
      return NextResponse.json(
        { message: "Password must be at least 6 characters long." },
        { status: 400 }
      );
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      return NextResponse.json(
        { message: "Invalid email format." },
        { status: 400 }
      );
    }
    if (username.length < 3) {
      return NextResponse.json(
        { message: "Username must be at least 3 characters long." },
        { status: 400 }
      );
    }

    // --- Check for Existing User ---
    // Use lean() for performance if only checking existence
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }],
    }).lean();
    if (existingUser) {
      const field =
        existingUser.email === email.toLowerCase() ? "Email" : "Username";
      return NextResponse.json(
        { message: `${field} is already taken.` },
        { status: 409 }
      ); // 409 Conflict
    }

    // --- Handle Avatar Upload (if provided) ---
    let avatarData = {}; // Default empty object
    let uploadedAvatarResult = null;
    if (file) {
      console.log(`Attempting to upload avatar for ${email}...`);
      try {
        // Upload the buffer from Multer (req.file.buffer) to Cloudinary
        uploadedAvatarResult = await uploadToCloudinary(file.buffer, {
          // Optional: specify a public_id based on username/userId for easier management
          // public_id: `avatars/${username}_${Date.now()}`
        });
        avatarData = {
          url: uploadedAvatarResult.secure_url,
          public_id: uploadedAvatarResult.public_id,
        };
        console.log(
          `Avatar uploaded successfully for ${email}: ${avatarData.url}`
        );
      } catch (uploadError) {
        console.error("Avatar upload failed:", uploadError);
        // Decide how to handle upload failure:
        // Option 1: Fail the signup
        // return NextResponse.json({ message: 'Avatar upload failed. Please try again.', error: uploadError.message }, { status: 500 });
        // Option 2: Proceed with signup using default avatar (implemented below)
        console.warn(
          `Proceeding with signup for ${email} using default avatar due to upload error.`
        );
        // No need to set avatarData here, it will use the schema default
      }
    }

    // --- Create New User ---
    let newUser = null;
    try {
      newUser = new User({
        username,
        email: email.toLowerCase(), // Store email consistently
        password, // Password hashing happens via the pre-save hook in the User model
        avatar: avatarData.url ? avatarData : undefined, // Only set if upload was successful
      });
      await newUser.save();
      console.log(
        `User created successfully: ${newUser.email} (ID: ${newUser._id})`
      );
    } catch (saveError) {
      console.error("Error saving user to database:", saveError);
      // If user save fails AFTER avatar upload, attempt to delete the uploaded avatar
      if (uploadedAvatarResult?.public_id) {
        console.warn(
          `Attempting to delete orphaned avatar: ${uploadedAvatarResult.public_id}`
        );
        try {
          await deleteFromCloudinary(uploadedAvatarResult.public_id);
          console.log(
            `Orphaned avatar ${uploadedAvatarResult.public_id} deleted.`
          );
        } catch (deleteError) {
          console.error(
            `Failed to delete orphaned avatar ${uploadedAvatarResult.public_id}:`,
            deleteError
          );
          // Log this error, but don't block the user error response
        }
      }
      // Handle Mongoose validation errors specifically
      if (saveError.name === "ValidationError") {
        // Extract meaningful error messages
        const errors = Object.values(saveError.errors).map((el) => el.message);
        return NextResponse.json(
          { message: "Validation failed", errors },
          { status: 400 }
        );
      }
      // Handle duplicate key errors (though checked earlier, this is a safeguard)
      if (saveError.code === 11000) {
        const field = Object.keys(saveError.keyValue)[0];
        return NextResponse.json(
          {
            message: `${
              field.charAt(0).toUpperCase() + field.slice(1)
            } is already taken.`,
          },
          { status: 409 }
        );
      }
      // Generic server error for other save issues
      return NextResponse.json(
        { message: "Failed to create user account.", error: saveError.message },
        { status: 500 }
      );
    }

    // --- Generate JWT Token ---
    const tokenPayload = { userId: newUser._id, username: newUser.username };
    const token = signToken(tokenPayload);

    // --- Prepare User Data for Response (exclude sensitive fields) ---
    const userResponse = {
      _id: newUser._id,
      username: newUser.username,
      email: newUser.email,
      avatar: newUser.avatar.url, // Send the final avatar URL
      createdAt: newUser.createdAt,
    };

    // --- Create Response and Set HttpOnly Cookie ---
    const response = NextResponse.json(
      {
        user: userResponse,
        message: "Signup successful!",
      },
      { status: 201 }
    ); // 201 Created

    response.cookies.set("authToken", token, {
      httpOnly: true, // Prevent client-side JS access
      secure: process.env.NODE_ENV === "production", // Use secure cookies in production (HTTPS)
      sameSite: "strict", // Mitigate CSRF attacks
      path: "/", // Cookie available across the site
      maxAge: 60 * 60 * 24 * 7, // 7 days (matches default JWT expiry)
      // Consider setting 'expires' as well for older browser compatibility
      // expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return response;
  } catch (error) {
    console.error("Unhandled Signup Error:", error);
    // Handle potential Multer errors (e.g., file size limit, invalid type)
    if (error instanceof multer.MulterError) {
      return NextResponse.json(
        {
          message: `File upload error: ${error.message} (Code: ${error.code})`,
        },
        { status: 400 }
      );
    }
    // Handle custom errors from file filter
    if (error.message.startsWith("Invalid file type")) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    // Generic error handler for unexpected issues
    return NextResponse.json(
      {
        message: "An unexpected error occurred during signup.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
