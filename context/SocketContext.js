// src/context/SocketContext.js
"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { getSocket, disconnectSocket } from "@/lib/socket"; // Import client socket logic
import { useAuth } from "@/hooks/useAuth"; // Use your auth hook

const SocketContext = createContext(null);

// Custom hook to access the Socket context
export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const { token, isAuthenticated } = useAuth(); // Get token and auth status
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  // Store listeners managed by this context to avoid duplicates/leaks
  const listenersRef = useRef(new Map());

  // --- Effect to manage socket connection based on auth status ---
  useEffect(() => {
    if (isAuthenticated && token) {
      // If authenticated and token available, get/initialize socket
      const socketInstance = getSocket(token);
      setSocket(socketInstance);

      // --- Setup Base Listeners ---
      // Use the ref to ensure listeners are only added once per instance
      if (socketInstance && !listenersRef.current.has("connect")) {
        console.log("[SocketContext] Adding base listeners...");

        const onConnect = () => {
          console.log("[SocketContext] Base listener: Connected.");
          setIsConnected(true);
        };
        const onDisconnect = (reason) => {
          console.log(
            "[SocketContext] Base listener: Disconnected. Reason:",
            reason
          );
          setIsConnected(false);
          // Handle potential need for re-authentication or cleanup
        };
        const onConnectError = (error) => {
          console.error(
            "[SocketContext] Base listener: Connection Error.",
            error
          );
          setIsConnected(false);
          // Specific handling for auth errors during connection attempt
          if (error.message.includes("Authentication error")) {
            console.error(
              "Socket connection failed due to authentication. Check token validity."
            );
            // Consider logging out the user or showing a persistent error message
          }
        };

        socketInstance.on("connect", onConnect);
        socketInstance.on("disconnect", onDisconnect);
        socketInstance.on("connect_error", onConnectError);

        // Store these base listeners in the ref
        listenersRef.current.set("connect", onConnect);
        listenersRef.current.set("disconnect", onDisconnect);
        listenersRef.current.set("connect_error", onConnectError);
      }
    } else {
      // If not authenticated or no token, disconnect and clean up
      if (socket) {
        console.log(
          "[SocketContext] Not authenticated or token missing. Disconnecting socket."
        );
        disconnectSocket(); // Use the disconnect function from lib/socket.js
        setSocket(null);
        setIsConnected(false);
        listenersRef.current.clear(); // Clear stored listeners
      }
    }

    // --- Cleanup Function ---
    // This runs when the component unmounts or dependencies (token, isAuthenticated) change
    return () => {
      // We generally want the socket to persist across navigation *while authenticated*.
      // Disconnection should happen when the user logs out (handled by the `else` block above).
      // If we were to disconnect here on every component unmount, it would be inefficient.
      // However, if the SocketProvider itself unmounts completely (e.g., root layout change),
      // disconnecting might be appropriate.
      // console.log("[SocketContext] Cleanup effect ran.");
      // Optional: If you need to clean up specific listeners added ONLY by this context
      // if (socket && listenersRef.current.size > 0) {
      //    console.log("[SocketContext] Removing base listeners on cleanup.");
      //    listenersRef.current.forEach((handler, eventName) => {
      //        socket.off(eventName, handler);
      //    });
      //    listenersRef.current.clear();
      // }
    };
  }, [isAuthenticated, token, socket]); // Rerun when auth status or token changes

  // --- Function to Emit Events ---
  // Ensures socket is connected before emitting
  const emitEvent = useCallback(
    (eventName, data, ack) => {
      if (socket && socket.connected) {
        // console.log(`[SocketContext] Emitting event: ${eventName}`, data);
        socket.emit(eventName, data, ack); // Pass acknowledgement callback if provided
      } else {
        console.warn(
          `[SocketContext] Socket not connected. Cannot emit event: ${eventName}`
        );
        // Optionally: Queue the event or notify the user
      }
    },
    [socket]
  ); // Dependency: socket instance

  // --- Function for Components to Add Listeners ---
  // Returns a cleanup function to remove the listener
  const addSocketListener = useCallback(
    (eventName, handler) => {
      if (socket) {
        // console.log(`[SocketContext] Adding listener for event: ${eventName}`);
        socket.on(eventName, handler);
        // Return a cleanup function
        return () => {
          // console.log(`[SocketContext] Removing listener for event: ${eventName}`);
          socket.off(eventName, handler);
        };
      } else {
        console.warn(
          `[SocketContext] Socket not available. Cannot add listener for: ${eventName}`
        );
        // Return a no-op cleanup function
        return () => {};
      }
    },
    [socket]
  ); // Dependency: socket instance

  // --- Context Value ---
  const value = {
    socket, // The socket instance itself (use with caution)
    isConnected, // Boolean connection status
    emitEvent, // Safe way to emit events
    addSocketListener, // Safe way to add/remove listeners
  };

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
};
