// src/models/User.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required."],
      unique: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters long."],
      maxlength: [30, "Username cannot exceed 30 characters."],
      index: true, // Index for faster searching
    },
    email: {
      type: String,
      required: [true, "Email is required."],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/\S+@\S+\.\S+/, "Please use a valid email address."],
      index: true, // Index for faster searching and login
    },
    password: {
      type: String,
      required: [true, "Password is required."],
      minlength: [6, "Password must be at least 6 characters long."],
      select: false, // Exclude password from query results by default
    },
    avatar: {
      url: {
        type: String,
        default: "/placeholder-avatar.png", // Path to default avatar in /public
      },
      public_id: {
        // Store Cloudinary public_id for deletion/updates
        type: String,
      },
    },
    online: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
    },
    // Reference to chats the user is part of
    chats: [{ type: mongoose.Schema.Types.ObjectId, ref: "Chat" }],
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields automatically
  }
);

// --- Middleware Hooks ---

// Hash password before saving the user document
userSchema.pre("save", async function (next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10); // Generate salt
    this.password = await bcrypt.hash(this.password, salt); // Hash password
    next();
  } catch (error) {
    console.error("Error hashing password:", error);
    next(error); // Pass error to the next middleware/handler
  }
});

// --- Methods ---

// Method to compare entered password with the hashed password in the database
userSchema.methods.comparePassword = async function (candidatePassword) {
  // 'this.password' refers to the password of the specific user document instance
  // Note: Need to explicitly select the password field when querying if it's set to `select: false`
  return await bcrypt.compare(candidatePassword, this.password);
};

// Export the model, creating it if it doesn't already exist
export default mongoose.models.User || mongoose.model("User", userSchema);
