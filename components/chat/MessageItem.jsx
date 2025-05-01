// src/components/chat/MessageItem.jsx
import React, { useState, useRef } from "react";
import { formatDistanceToNow, parseISO } from "date-fns"; // For relative timestamps
import { useAuth } from "@/hooks/useAuth"; // To get current user for reactions
import {
  PaperClipIcon, // For attachments
  ArrowUturnLeftIcon, // For reply icon
  PencilIcon, // For edit icon
  TrashIcon, // For delete icon
  EllipsisHorizontalIcon, // For options menu
  FaceSmileIcon, // For reaction picker (conceptual)
} from "@heroicons/react/24/solid"; // Or outline/mini as preferred
import Avatar from "@/components/ui/Avatar"; // Assuming a simple Avatar component exists
// TODO: Add an Emoji Picker component for reactions

// Helper to format timestamp
const formatTimestamp = (timestamp) => {
  if (!timestamp) return "";
  try {
    const date =
      typeof timestamp === "string" ? parseISO(timestamp) : timestamp;
    // Show relative time for recent messages, absolute time for older ones
    if (Date.now() - date.getTime() < 24 * 60 * 60 * 1000) {
      // Less than 1 day old
      return formatDistanceToNow(date, { addSuffix: true });
    } else {
      return (
        date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) +
        ", " +
        date.toLocaleDateString()
      );
    }
  } catch (error) {
    console.error("Error formatting date:", error);
    return "Invalid date";
  }
};

// Helper to render attachment preview/link
const AttachmentPreview = ({ attachment }) => {
  if (!attachment || !attachment.url) return null;

  const { url, fileType, originalFilename, size } = attachment;
  const formattedSize = size ? `${(size / 1024).toFixed(1)} KB` : "";

  if (fileType === "image") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 block max-w-xs rounded-lg overflow-hidden"
      >
        <img
          src={url}
          alt={originalFilename || "Attached image"}
          className="max-h-60 w-auto object-contain rounded-lg border border-gray-200 dark:border-gray-700"
        />
      </a>
    );
  }

  if (fileType === "video") {
    return (
      <video
        controls
        className="mt-2 max-w-xs rounded-lg border border-gray-200 dark:border-gray-700"
        preload="metadata"
      >
        <source
          src={`${url}#t=0.1`}
          type={attachment.format ? `video/${attachment.format}` : "video/mp4"}
        />{" "}
        {/* Add #t=0.1 for thumbnail in some browsers */}
        Your browser does not support the video tag.
        <a href={url} target="_blank" rel="noopener noreferrer">
          Download video
        </a>
      </video>
    );
  }

  if (fileType === "audio") {
    return (
      <audio
        controls
        src={url}
        className="mt-2 w-full max-w-xs"
        preload="metadata"
      >
        Your browser does not support the audio element.
        <a href={url} target="_blank" rel="noopener noreferrer">
          Download audio
        </a>
      </audio>
    );
  }

  // Default file link
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex items-center space-x-2 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 transition duration-150 max-w-xs"
    >
      <PaperClipIcon className="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
      <div className="flex-1 overflow-hidden">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
          {originalFilename || "Attached file"}
        </p>
        {formattedSize && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {formattedSize}
          </p>
        )}
      </div>
    </a>
  );
};

// Helper to render reply snippet
const ReplySnippet = ({ repliedMessage }) => {
  if (!repliedMessage) return null;

  const { content, sender, attachment, deleted } = repliedMessage;
  const senderName = sender?.username || "Unknown User";
  let previewText = content || "";

  if (deleted) {
    previewText = "[Original message was deleted]";
  } else if (!previewText && attachment) {
    previewText = `[${attachment.fileType || "Attachment"}]`;
  }

  return (
    <div className="mb-1 p-2 border-l-4 border-blue-500 bg-black bg-opacity-5 dark:bg-white dark:bg-opacity-10 rounded-r-md text-xs max-w-full">
      <p className="font-semibold text-blue-600 dark:text-blue-400">
        {senderName}
      </p>
      <p className="text-gray-600 dark:text-gray-300 truncate">{previewText}</p>
    </div>
  );
};

// Main Message Item Component
export default function MessageItem({
  message,
  isOwnMessage,
  onSetReplyTo,
  onEdit, // Expects (messageId, currentContent) => void
  onDelete, // Expects (messageId) => void
  onToggleReaction, // Expects (messageId, emoji) => void
}) {
  const { user: currentUser } = useAuth(); // Get current logged-in user
  const [showActions, setShowActions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content || "");
  const messageRef = useRef(null);

  const {
    _id: messageId,
    sender,
    content,
    createdAt,
    isEdited,
    deleted,
    attachment,
    replyToMessage,
    reactions = [], // Default to empty array
    readBy = [],
  } = message;

  const senderName = sender?.username || "Unknown User";
  const avatarUrl = sender?.avatar?.url || "/placeholder-avatar.png";
  const timestamp = formatTimestamp(createdAt);

  // --- Handlers ---
  const handleEditSubmit = (e) => {
    e.preventDefault();
    if (editedContent.trim() && editedContent.trim() !== message.content) {
      onEdit(messageId, editedContent.trim());
    }
    setIsEditing(false); // Exit editing mode
  };

  const handleEditCancel = () => {
    setIsEditing(false);
    setEditedContent(message.content || ""); // Reset content
  };

  const handleReactionClick = (emoji) => {
    onToggleReaction(messageId, emoji);
  };

  // Determine if the current user has reacted with a specific emoji
  const currentUserReaction = (emoji) => {
    return reactions.some(
      (r) => r.userId === currentUser?._id && r.emoji === emoji
    );
  };

  // Aggregate reactions for display (e.g., { '👍': 2, '❤️': 1 })
  const reactionSummary = reactions.reduce((acc, reaction) => {
    acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1;
    return acc;
  }, {});

  // --- Render Logic ---

  // Handle deleted messages
  if (deleted) {
    return (
      <div
        className={`flex ${
          isOwnMessage ? "justify-end" : "justify-start"
        } mb-2`}
      >
        <div
          className={`flex items-end max-w-[75%] ${
            isOwnMessage ? "flex-row-reverse" : "flex-row"
          }`}
        >
          {!isOwnMessage && (
            <Avatar
              src={avatarUrl}
              alt={senderName}
              className="h-6 w-6 mr-2 mb-1"
            />
          )}
          <div className="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 italic text-sm">
            [This message was deleted]
            <span className="ml-2 text-xs text-gray-400 dark:text-gray-500 align-bottom">
              {timestamp}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Handle normal/edited messages
  return (
    <div
      ref={messageRef}
      className={`flex group ${
        isOwnMessage ? "justify-end" : "justify-start"
      } mb-1 relative`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div
        className={`flex items-end max-w-[75%] ${
          isOwnMessage ? "flex-row-reverse" : "flex-row"
        }`}
      >
        {/* Avatar for received messages */}
        {!isOwnMessage && (
          <Avatar
            src={avatarUrl}
            alt={senderName}
            className="h-6 w-6 mr-2 mb-1 self-end flex-shrink-0"
          />
        )}
        {/* Message Bubble */}
        <div
          className={`px-3 py-1.5 rounded-lg shadow-sm relative ${
            isOwnMessage
              ? "bg-blue-500 text-white rounded-br-none"
              : "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-none border border-gray-200 dark:border-gray-600"
          }`}
        >
          {/* Sender Name (for group chats or received messages) */}
          {!isOwnMessage && (
            <p className="text-xs font-semibold mb-0.5 text-purple-600 dark:text-purple-400">
              {senderName}
            </p>
          )}

          {/* Reply Snippet */}
          {replyToMessage && <ReplySnippet repliedMessage={replyToMessage} />}

          {/* Message Content or Edit Form */}
          {isEditing ? (
            <form onSubmit={handleEditSubmit} className="py-1">
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="w-full p-1 border rounded text-sm text-gray-900 bg-white dark:bg-gray-800 dark:text-gray-100"
                rows={Math.max(
                  1,
                  Math.min(5, editedContent.split("\n").length)
                )} // Auto-resize roughly
                autoFocus
              />
              <div className="flex justify-end space-x-2 mt-1">
                <button
                  type="button"
                  onClick={handleEditCancel}
                  className="text-xs text-gray-600 dark:text-gray-400 hover:underline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                >
                  Save
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* Attachment */}
              <AttachmentPreview attachment={attachment} />

              {/* Text Content (only if not just an attachment) */}
              {content && (
                <p className="text-sm whitespace-pre-wrap break-words">
                  {content}
                </p>
              )}
            </>
          )}

          {/* Timestamp and Edited Status */}
          <div className="text-right mt-1">
            {isEdited && !isEditing && (
              <span className="text-xs opacity-70 mr-1">(edited)</span>
            )}
            <span
              className={`text-xs opacity-70 ${
                isOwnMessage
                  ? "text-blue-100"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {timestamp}
              {/* TODO: Add Read Receipt Checkmarks Here (based on readBy vs participants) */}
            </span>
          </div>

          {/* Reactions Display */}
          {Object.keys(reactionSummary).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1 pt-1 border-t border-black border-opacity-10 dark:border-white dark:border-opacity-10">
              {Object.entries(reactionSummary).map(([emoji, count]) => (
                <button
                  key={emoji}
                  onClick={() => handleReactionClick(emoji)}
                  title={`React with ${emoji}`}
                  className={`px-1.5 py-0.5 rounded-full text-xs flex items-center space-x-1 transition duration-150 ${
                    currentUserReaction(emoji)
                      ? "bg-blue-200 dark:bg-blue-800 border border-blue-400 dark:border-blue-600"
                      : "bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500"
                  }`}
                >
                  <span>{emoji}</span>
                  <span
                    className={`font-medium ${
                      currentUserReaction(emoji)
                        ? "text-blue-800 dark:text-blue-200"
                        : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>{" "}
        {/* End Message Bubble */}
        {/* Action Buttons (Appear on hover/focus within group) */}
        {!isEditing && showActions && (
          <div
            className={`absolute top-0 mt-[-8px] flex space-x-1 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-full shadow-md px-1 py-0.5 transition-opacity duration-150 ${
              isOwnMessage ? "right-0 mr-8" : "left-0 ml-8"
            }`}
          >
            {/* Add Reaction Button (Opens Picker) */}
            <button
              onClick={() => alert("Emoji picker not implemented yet!")}
              title="Add reaction"
              className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
            >
              <FaceSmileIcon className="h-4 w-4" />
            </button>
            {/* Reply Button */}
            <button
              onClick={() => onSetReplyTo(message)}
              title="Reply"
              className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
            >
              <ArrowUturnLeftIcon className="h-4 w-4" />
            </button>
            {/* Edit/Delete only for own messages */}
            {isOwnMessage && (
              <>
                <button
                  onClick={() => {
                    setIsEditing(true);
                    setEditedContent(content || "");
                  }}
                  title="Edit"
                  className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onDelete(messageId)}
                  title="Delete"
                  className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-red-500"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </>
            )}
            {/* More Options (Optional) */}
            {/* <button title="More options" className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400">
                             <EllipsisHorizontalIcon className="h-4 w-4" />
                         </button> */}
          </div>
        )}
      </div>
    </div>
  );
}
