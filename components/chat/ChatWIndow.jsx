// src/components/chat/ChatWindow.jsx
"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import MessageItem from "./MessageItem";
import ChatInput from "./ChatInput";
import { useSocketContext } from "@/context/SocketContext";
import { useAuth } from "@/hooks/useAuth"; // To identify current user
import { useParams } from "next/navigation"; // To get chatId from URL
import Spinner from "@/components/ui/Spinner";

// Debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export default function ChatWindow() {
  const { chatId } = useParams();
  const { user } = useAuth();
  const { socket, emitEvent, addSocketListener } = useSocketContext();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [typingUsers, setTypingUsers] = useState({}); // { userId: username }
  const [replyTo, setReplyTo] = useState(null); // { _id, content, sender: { username } }
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // --- Fetch Messages ---
  useEffect(() => {
    if (!chatId) {
      setMessages([]); // Clear messages if no chat selected
      return;
    }

    const fetchMessages = async () => {
      setLoading(true);
      setError(null);
      setMessages([]); // Clear previous messages
      try {
        const res = await fetch(`/api/chats/${chatId}/messages`);
        if (!res.ok) {
          throw new Error(`Failed to fetch messages (${res.status})`);
        }
        const data = await res.json();
        setMessages(data.messages || []);
      } catch (err) {
        console.error("Fetch messages error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchMessages();
  }, [chatId]);

  // --- Scroll on new messages or load ---
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // --- Socket Event Listeners ---
  useEffect(() => {
    if (!socket || !chatId) return;

    // Listener for new messages
    const handleNewMessage = (newMessage) => {
      console.log("Received new message:", newMessage);
      // Ensure the message belongs to the currently viewed chat
      if (newMessage.chat === chatId) {
        setMessages((prev) => [...prev, newMessage]);
        // Mark message as read if window is active/visible (add visibility check)
        emitEvent("messageRead", { chatId, messageIds: [newMessage._id] });
      }
    };

    // Listener for message edits
    const handleMessageEdited = (editedMessage) => {
      if (editedMessage.chat === chatId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg._id === editedMessage._id ? editedMessage : msg
          )
        );
      }
    };

    // Listener for message deletions
    const handleMessageDeleted = ({ chatId: deletedInChatId, messageId }) => {
      if (deletedInChatId === chatId) {
        // Option 1: Remove from list
        // setMessages(prev => prev.filter(msg => msg._id !== messageId));
        // Option 2: Update the message content to show "[deleted]" (requires fetching updated msg or modifying existing)
        setMessages((prev) =>
          prev.map((msg) =>
            msg._id === messageId
              ? {
                  ...msg,
                  content: "[This message was deleted]",
                  deleted: true,
                  attachment: undefined,
                  reactions: [],
                }
              : msg
          )
        );
      }
    };

    // Listener for typing indicators
    const handleTyping = ({
      chatId: typingChatId,
      userId,
      username,
      isTyping,
    }) => {
      if (typingChatId === chatId && userId !== user?._id) {
        // Don't show self typing
        setTypingUsers((prev) => {
          const updated = { ...prev };
          if (isTyping) {
            updated[userId] = username;
          } else {
            delete updated[userId];
          }
          return updated;
        });
      }
    };

    // Listener for read receipts update (from others reading messages)
    const handleMessagesRead = ({
      chatId: readChatId,
      readerId,
      messageIds,
    }) => {
      if (readChatId === chatId && readerId !== user?._id) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (messageIds.includes(msg._id)) {
              // Add readerId to readBy array if not already present
              const readByUpdate = msg.readBy ? [...msg.readBy] : [];
              if (!readByUpdate.some((reader) => reader.userId === readerId)) {
                readByUpdate.push({ userId: readerId, readAt: new Date() }); // Assuming readAt is useful
              }
              return { ...msg, readBy: readByUpdate };
            }
            return msg;
          })
        );
      }
    };

    // Listener for reaction updates
    const handleMessageUpdated = ({ messageId, reactions }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === messageId ? { ...msg, reactions: reactions } : msg
        )
      );
    };

    // Subscribe to events
    const cleanupNewMessage = addSocketListener("newMessage", handleNewMessage);
    const cleanupMessageEdited = addSocketListener(
      "messageEdited",
      handleMessageEdited
    );
    const cleanupMessageDeleted = addSocketListener(
      "messageDeleted",
      handleMessageDeleted
    );
    const cleanupTyping = addSocketListener("typing", handleTyping);
    const cleanupMessagesRead = addSocketListener(
      "messagesRead",
      handleMessagesRead
    );
    const cleanupMessageUpdated = addSocketListener(
      "messageUpdated",
      handleMessageUpdated
    );

    // Cleanup listeners when component unmounts or chatId changes
    return () => {
      cleanupNewMessage();
      cleanupMessageEdited();
      cleanupMessageDeleted();
      cleanupTyping();
      cleanupMessagesRead();
      cleanupMessageUpdated();
      // Clear typing indicators for this chat when switching away
      setTypingUsers({});
    };
  }, [socket, chatId, user?._id, addSocketListener, emitEvent]); // Add user._id dependency for typing check

  // --- Typing Indicator Logic ---
  const typingTimeoutRef = useRef(null);
  const handleTypingChange = useCallback(
    (isTyping) => {
      if (!socket || !chatId) return;

      emitEvent("typing", { chatId, isTyping });

      // Clear previous timeout if user continues typing
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // If user stopped typing, set a timeout to emit stopTyping later
      if (!isTyping) {
        typingTimeoutRef.current = setTimeout(() => {
          // This part seems redundant if isTyping is already false?
          // The primary goal is to emit isTyping: true immediately on key press
          // and isTyping: false after a pause.
          // Let's refine: Emit 'typing: true' on input change, 'typing: false' on blur or send or after timeout.
        }, 3000); // Emit stop typing after 3 seconds of inactivity
      }
    },
    [socket, chatId, emitEvent]
  );

  // Debounced version for emitting "isTyping: true"
  const debouncedEmitTyping = useCallback(
    debounce(() => {
      emitEvent("typing", { chatId, isTyping: true });
    }, 300),
    [chatId, emitEvent]
  ); // Debounce by 300ms

  // Function called when user stops typing (e.g., after a delay)
  const emitStopTyping = useCallback(() => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    emitEvent("typing", { chatId, isTyping: false });
  }, [chatId, emitEvent]);

  // --- Send Message Handler ---
  const handleSendMessage = useCallback(
    async (content, attachment = null) => {
      if (!socket || !chatId || (!content && !attachment)) return;

      // Clear stop typing timeout
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      emitStopTyping(); // Indicate stop typing when sending

      const messageData = {
        chatId,
        content,
        attachment, // { url, public_id, fileType } - provided by ChatInput after upload
        replyToMessageId: replyTo?._id || null,
      };

      // Optimistic UI update (optional but improves perceived speed)
      // const optimisticId = `temp-${Date.now()}`;
      // const optimisticMessage = {
      //   _id: optimisticId,
      //   sender: { _id: user._id, username: user.username, avatar: { url: user.avatar } }, // Use logged-in user data
      //   chat: chatId,
      //   content: content,
      //   attachment: attachment,
      //   replyToMessage: replyTo ? { /* basic reply info */ } : null,
      //   createdAt: new Date().toISOString(),
      //   isSending: true, // Add a flag for styling pending messages
      //   readBy: [{ userId: user._id }]
      // };
      // setMessages((prev) => [...prev, optimisticMessage]);
      setReplyTo(null); // Clear reply state after sending

      // Emit message via Socket.IO with acknowledgement
      emitEvent("sendMessage", messageData, (response) => {
        if (response?.status === "ok") {
          console.log("Message sent successfully:", response.message);
          // If using optimistic UI, replace temp message with actual server response
          // setMessages(prev => prev.map(msg => msg._id === optimisticId ? { ...response.message, isSending: false } : msg));
        } else {
          console.error("Failed to send message:", response?.message);
          // Handle error: remove optimistic message or show error state
          // setMessages(prev => prev.filter(msg => msg._id !== optimisticId));
          alert(`Error: ${response?.message || "Could not send message."}`);
        }
      });
    },
    [socket, chatId, user, emitEvent, replyTo, emitStopTyping]
  );

  // --- Reply Handler ---
  const handleSetReplyTo = useCallback((message) => {
    setReplyTo(message);
    // Focus input field (optional)
  }, []);

  // --- Edit/Delete Handlers (passed to MessageItem) ---
  const handleEditMessage = useCallback(
    (messageId, newContent) => {
      emitEvent("editMessage", { messageId, newContent }, (response) => {
        if (response?.status !== "ok") {
          console.error("Failed to edit message:", response?.message);
          alert(`Error: ${response?.message || "Could not edit message."}`);
        }
      });
    },
    [emitEvent]
  );

  const handleDeleteMessage = useCallback(
    (messageId) => {
      if (window.confirm("Are you sure you want to delete this message?")) {
        emitEvent("deleteMessage", { messageId }, (response) => {
          if (response?.status !== "ok") {
            console.error("Failed to delete message:", response?.message);
            alert(`Error: ${response?.message || "Could not delete message."}`);
          }
        });
      }
    },
    [emitEvent]
  );

  // --- Reaction Handler ---
  const handleToggleReaction = useCallback(
    (messageId, emoji) => {
      emitEvent("toggleReaction", { messageId, emoji }, (response) => {
        if (response?.status !== "ok") {
          console.error("Failed to toggle reaction:", response?.message);
          alert(`Error: ${response?.message || "Could not update reaction."}`);
        }
      });
    },
    [emitEvent]
  );

  // --- Render Logic ---
  if (!chatId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        Select a chat to start messaging
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-500">
        Error loading messages: {error}
      </div>
    );
  }

  const typingUsernames = Object.values(typingUsers).join(", ");

  return (
    <div className="flex-1 flex flex-col bg-gray-100 dark:bg-gray-900 overflow-hidden">
      {/* Chat Header (Optional: Add chat name, participants info) */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <h2 className="font-semibold text-lg">
          Chat with {/* Chat name or participants */}
        </h2>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <MessageItem
            key={msg._id}
            message={msg}
            isOwnMessage={msg.sender._id === user?._id}
            onSetReplyTo={handleSetReplyTo}
            onEdit={handleEditMessage}
            onDelete={handleDeleteMessage}
            onToggleReaction={handleToggleReaction}
          />
        ))}
        <div ref={messagesEndRef} /> {/* Anchor for scrolling */}
      </div>

      {/* Typing Indicator */}
      {typingUsernames && (
        <div className="px-4 pb-2 text-sm text-gray-500 italic animate-pulse">
          {typingUsernames} {Object.keys(typingUsers).length > 1 ? "are" : "is"}{" "}
          typing...
        </div>
      )}

      {/* Message Input */}
      <ChatInput
        onSendMessage={handleSendMessage}
        onTyping={debouncedEmitTyping} // Pass debounced function
        onStopTyping={emitStopTyping} // Pass stop function
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        chatId={chatId} // Pass chatId for potential direct uploads
      />
    </div>
  );
}
