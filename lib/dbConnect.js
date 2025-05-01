// src/lib/dbConnect.js
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error(
    "Please define the MONGODB_URI environment variable inside .env.local"
  );
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function dbConnect() {
  // If a connection already exists, return it
  if (cached.conn) {
    console.log("🚀 Using cached MongoDB connection");
    return cached.conn;
  }

  // If a connection promise doesn't exist, create one
  if (!cached.promise) {
    const opts = {
      bufferCommands: false, // Disable buffering (recommended)
      // useNewUrlParser: true, // Deprecated but sometimes needed for older setups
      // useUnifiedTopology: true, // Deprecated
    };

    console.log("⏳ Establishing new MongoDB connection...");
    cached.promise = mongoose
      .connect(MONGODB_URI, opts)
      .then((mongooseInstance) => {
        console.log("✅ New MongoDB connection established");
        return mongooseInstance;
      })
      .catch((error) => {
        console.error("❌ MongoDB connection error:", error);
        cached.promise = null; // Reset promise on error to allow retry
        throw error; // Rethrow error to indicate connection failure
      });
  }

  // Wait for the connection promise to resolve
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    // If connection fails, reset the promise and rethrow the error
    cached.promise = null;
    throw e;
  }

  // Return the established connection
  return cached.conn;
}

export default dbConnect;
