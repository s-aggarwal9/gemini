// src/components/chat/ChatInput.jsx
import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  PaperAirplaneIcon, // Send icon
  PaperClipIcon, // Attachment icon
  XMarkIcon, // Close icon (for reply preview)
} from "@heroicons/react/24/solid";
import Spinner from "@/components/ui/Spinner"; // Simple loading spinner

// Debounce function (utility)
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

export default function ChatInput({
  onSendMessage, // (content: string, attachment?: object) => void
  onTyping, // () => void (debounced)
  onStopTyping, // () => void
  replyTo, // { _id, content, sender: { username }, attachment } | null
  onCancelReply, // () => void
  chatId, // Needed for associating uploads
}) {
  const [text, setText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  // Reset text when replyTo changes (optional, depends on desired UX)
  // useEffect(() => {
  //     setText('');
  // }, [replyTo]);

  // Focus textarea when replyTo is set
  useEffect(() => {
    if (replyTo) {
      textareaRef.current?.focus();
    }
  }, [replyTo]);

  // --- Event Handlers ---

  const handleTextChange = (e) => {
    setText(e.target.value);
    // Trigger debounced typing indicator
    debouncedTyping();
    // Adjust textarea height dynamically (simple version)
    adjustTextareaHeight();
  };

  // Debounced call to onTyping prop
  const debouncedTyping = useCallback(
    debounce(() => {
      onTyping();
    }, 500),
    [onTyping]
  ); // Adjust debounce delay as needed

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"; // Reset height
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`; // Set to scroll height
    }
  };

  const handleSend = async () => {
    const content = text.trim();
    if (!content && !isUploading) {
      // Don't send empty messages unless uploading
      return;
    }
    if (isUploading) {
      console.log("Waiting for upload to complete before sending.");
      // Optionally disable send button while uploading
      return;
    }

    console.log(
      `Sending message: Content='${content}', ReplyTo=${replyTo?._id}`
    );
    onSendMessage(content, null); // Send text message (attachment handled separately)
    setText(""); // Clear input
    onStopTyping(); // Indicate user stopped typing
    if (replyTo) onCancelReply(); // Clear reply state after sending
    // Reset textarea height after sending
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e) => {
    // Send on Enter, allow Shift+Enter for newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); // Prevent default newline behavior
      handleSend();
    }
    // Optional: Trigger stop typing immediately if Enter is pressed
    // if (e.key === 'Enter') {
    //     onStopTyping();
    // }
  };

  const handleAttachmentClick = () => {
    fileInputRef.current?.click(); // Trigger hidden file input
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    console.log(
      `Attachment selected: ${file.name}, Size: ${file.size}, Type: ${file.type}`
    );
    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append("attachment", file);
    if (chatId) {
      formData.append("chatId", chatId); // Send chatId for authorization on backend
    }

    try {
      // Make API call to the upload endpoint
      const response = await fetch("/api/upload", {
        method: "POST",
        // No 'Content-Type' header needed, browser sets it for FormData
        body: formData,
        // Include auth token if needed by your API (middleware usually handles cookie)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || `Upload failed with status ${response.status}`
        );
      }

      const result = await response.json();
      console.log("Upload successful:", result.attachment);

      // Send message with attachment data (content might be empty)
      onSendMessage(text.trim(), result.attachment); // Send current text along with attachment
      setText(""); // Clear text input after successful upload and send
      if (replyTo) onCancelReply(); // Clear reply state
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (error) {
      console.error("Upload failed:", error);
      setUploadError(error.message || "Failed to upload file.");
      // Optionally show error to user for a few seconds
      setTimeout(() => setUploadError(null), 5000);
    } finally {
      setIsUploading(false);
      // Reset file input value to allow selecting the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      onStopTyping(); // Ensure typing indicator stops
    }
  };

  // --- Render Reply Preview ---
  const renderReplyPreview = () => {
    if (!replyTo) return null;
    const { sender, content, attachment, deleted } = replyTo;
    let previewText = content || "";
    if (deleted) {
      previewText = "[Original message was deleted]";
    } else if (!previewText && attachment) {
      previewText = `[${attachment.fileType || "Attachment"}]`;
    }

    return (
      <div className="flex items-center justify-between p-2 border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm">
        <div className="flex-1 overflow-hidden mr-2">
          <p className="font-semibold text-blue-600 dark:text-blue-400">
            Replying to {sender?.username || "Unknown"}
          </p>
          <p className="text-gray-600 dark:text-gray-300 truncate">
            {previewText}
          </p>
        </div>
        <button
          onClick={onCancelReply}
          className="p-1 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
          aria-label="Cancel reply"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
    );
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      {/* Reply Preview Area */}
      {renderReplyPreview()}

      {/* Upload Error Message */}
      {uploadError && (
        <div className="px-4 py-1 bg-red-100 text-red-700 text-xs text-center">
          Error: {uploadError}
        </div>
      )}

      {/* Main Input Area */}
      <div className="flex items-end p-2 space-x-2">
        {/* Attachment Button */}
        <button
          onClick={handleAttachmentClick}
          disabled={isUploading}
          className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50"
          aria-label="Attach file"
        >
          {isUploading ? (
            <Spinner className="h-5 w-5" />
          ) : (
            <PaperClipIcon className="h-5 w-5" />
          )}
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" // Adjust accepted types
        />

        {/* Text Input */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onBlur={onStopTyping} // Indicate stop typing on blur
          placeholder="Type a message..."
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg resize-none overflow-y-auto bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400"
          rows="1" // Start with one row
          style={{ maxHeight: "120px" }} // Limit max height
          disabled={isUploading}
        />

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={(!text.trim() && !isUploading) || isUploading} // Disable if no text or uploading
          className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-400"
          aria-label="Send message"
        >
          <PaperAirplaneIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
