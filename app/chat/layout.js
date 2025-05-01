// src/app/(chat)/layout.js
"use client"; // Required for hooks and context

import React from "react";
import { AuthProvider, useAuth } from "@/context/AuthContext"; // Assuming AuthProvider is wrapping higher up
import { SocketProvider } from "@/context/SocketContext";
import ChatList from "@/components/chat/ChatList"; // Component to display chats
import Header from "@/components/layout/Header"; // Optional header

// This layout requires authentication, which should be enforced by middleware.js

export default function ChatLayout({ children }) {
  const { user } = useAuth(); // Get authenticated user info

  if (!user) {
    // Although middleware redirects, this prevents rendering errors if state is momentarily inconsistent
    // Or handle loading state
    return <div>Loading...</div>;
  }

  return (
    <SocketProvider>
      {" "}
      {/* Initialize socket connection here */}
      <div className="flex h-screen overflow-hidden bg-gray-100 dark:bg-gray-900">
        {/* Sidebar */}
        <aside className="w-1/4 h-full border-r border-gray-200 dark:border-gray-700 overflow-y-auto bg-white dark:bg-gray-800">
          {/* Add User Search and Chat List here */}
          <ChatList />
        </aside>

        {/* Main Chat Area */}
        <main className="flex-1 flex flex-col h-full">
          {/* Optional Header <Header /> */}
          {children}{" "}
          {/* This will render the specific chat page (e.g., [chatId]/page.js or page.js) */}
        </main>
      </div>
    </SocketProvider>
  );
}
