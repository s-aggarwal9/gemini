// src/lib/jwt.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d"; // Default expiration if not set in env

if (!JWT_SECRET) {
  throw new Error(
    "FATAL ERROR: JWT_SECRET environment variable is not defined."
  );
}

/**
 * Signs a payload to create a JWT token.
 * @param {object} payload - The data to include in the token (e.g., { userId, username }).
 * @param {string} expiresIn - Optional expiration time override (e.g., '1h', '30d').
 * @returns {string} The generated JWT token.
 */
export const signToken = (payload, expiresIn = JWT_EXPIRES_IN) => {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload must be a non-empty object.");
  }
  try {
    // Ensure userId is included for identification
    if (!payload.userId) {
      console.warn("JWT payload created without 'userId'.");
    }
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
  } catch (error) {
    console.error("Error signing JWT:", error);
    throw new Error("Could not sign JWT."); // Re-throw a generic error
  }
};

/**
 * Verifies a JWT token and returns the decoded payload.
 * @param {string} token - The JWT token to verify.
 * @returns {object | null} The decoded payload if the token is valid, otherwise null.
 */
export const verifyToken = (token) => {
  if (!token) {
    return null; // No token provided
  }
  try {
    // Verify the token using the secret
    const decoded = jwt.verify(token, JWT_SECRET);
    // Basic check for essential payload data (e.g., userId)
    if (!decoded || !decoded.userId) {
      console.warn("JWT verified but missing 'userId' in payload.");
      return null; // Or throw an error depending on policy
    }
    return decoded; // Return the decoded payload
  } catch (error) {
    // Handle specific JWT errors
    if (error instanceof jwt.TokenExpiredError) {
      console.log("JWT verification failed: Token expired at", error.expiredAt);
    } else if (error instanceof jwt.JsonWebTokenError) {
      console.warn("JWT verification failed:", error.message);
    } else {
      console.error(
        "An unexpected error occurred during JWT verification:",
        error
      );
    }
    return null; // Return null for any verification error
  }
};
