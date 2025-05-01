// src/lib/socket.js
import { io } from "socket.io-client";

let socketInstance = null;

/**
 * Gets or initializes the Socket.IO client instance.
 * Ensures only one connection is active for a given token.
 * @param {string} token - The JWT authentication token.
 * @returns {import('socket.io-client').Socket} The Socket.IO client instance.
 */
export const getSocket = (token) => {
  if (!token) {
    console.warn("getSocket called without a token. Returning null.");
    // If an old instance exists, disconnect it
    if (socketInstance && socketInstance.connected) {
      console.log("Disconnecting existing socket due to missing token.");
      socketInstance.disconnect();
    }
    socketInstance = null;
    return null;
  }

  const serverUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // If no instance exists, or if the token has changed, create a new connection
  if (!socketInstance || socketInstance.auth.token !== token) {
    // Disconnect previous instance if it exists and token changed
    if (socketInstance) {
      console.log(
        "Token changed or instance invalid. Disconnecting previous socket."
      );
      socketInstance.disconnect();
      // Clean up listeners from old socket instance to prevent memory leaks
      socketInstance.off(); // Removes all listeners
    }

    console.log("Initializing new Socket.IO connection to", serverUrl);
    socketInstance = io(serverUrl, {
      path: "/api/socket_io", // Must match server path
      reconnectionAttempts: 5, // Number of attempts before giving up
      reconnectionDelay: 3000, // Delay between attempts (ms)
      timeout: 10000, // Connection timeout (ms)
      auth: { token }, // Send token for authentication middleware on server
      transports: ["websocket", "polling"], // Prioritize WebSocket
      autoConnect: true, // Connect automatically
    });

    // --- Standard Event Listeners ---
    socketInstance.on("connect", () => {
      console.log("✅ Socket connected:", socketInstance.id);
      // You might want to emit an event here if needed, e.g., fetch initial data
    });

    socketInstance.on("disconnect", (reason) => {
      console.log("🔻 Socket disconnected:", reason);
      // Handle potential manual disconnection or server-side issues
      if (reason === "io server disconnect") {
        // The server intentionally disconnected the socket (e.g., auth failure after connect)
        console.error("Server disconnected the socket. Possible auth issue.");
        // Maybe trigger logout or show error message
      }
      // Socket will automatically try to reconnect based on options unless reason is 'io client disconnect'
    });

    socketInstance.on("connect_error", (err) => {
      console.error("🔌 Socket connection error:", err.message);
      // Log specific error data if available (e.g., from auth middleware)
      if (err.data) {
        console.error("Connection error data:", err.data);
      }
      // Handle specific errors, e.g., authentication failure on initial connection
      if (err.message.includes("Authentication error")) {
        console.error(
          "Socket Authentication Failed during connection. Check token."
        );
        // Prevent further reconnection attempts with the bad token by explicitly disconnecting
        socketInstance.disconnect();
        // Trigger logout or display persistent error
      }
    });

    // --- Custom Application Event Listeners (Example) ---
    // It's generally better to add specific listeners within components/contexts
    // that need them, rather than globally here. But basic logging can be useful.
    socketInstance.onAny((eventName, ...args) => {
      // console.log(`Socket event received: ${eventName}`, args);
    });
  } else if (!socketInstance.connected) {
    // If instance exists but is disconnected, try to connect manually
    console.log(
      "Socket instance exists but is disconnected. Attempting to connect..."
    );
    socketInstance.connect();
  }

  return socketInstance;
};

/**
 * Disconnects the Socket.IO client instance if it exists.
 */
export const disconnectSocket = () => {
  if (socketInstance && socketInstance.connected) {
    console.log("Disconnecting socket instance...");
    socketInstance.disconnect();
  }
  if (socketInstance) {
    socketInstance.off(); // Remove all listeners
    socketInstance = null; // Clear the instance variable
  }
};
