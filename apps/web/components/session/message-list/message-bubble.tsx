"use client";

import type { Message } from "../chat-reducer";
import { AssistantParts } from "./assistant-parts";

function formatTimestamp(createdAt?: string | null) {
  if (!createdAt) return null;
  return new Date(createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const timestamp = formatTimestamp(message.createdAt);

  if (isUser) {
    return (
      <div className="flex flex-col items-end gap-1 [content-visibility:auto]">
        <div className="max-w-[80%] bg-accent px-(--of-space-md) py-(--of-space-sm) text-[15px] leading-relaxed text-white">
          {message.parts
            .filter((p) => p.type === "text")
            .map((p, i) => (
              <p key={"id" in p && p.id ? p.id : `text-${i}`} className="whitespace-pre-wrap">
                {p.text}
              </p>
            ))}
        </div>
        {timestamp && (
          <span className="mr-1 text-[11px] text-text-tertiary">{timestamp}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 [content-visibility:auto]">
      <AssistantParts parts={message.parts} />
      {timestamp && (
        <span className="ml-1 text-[11px] text-text-tertiary">{timestamp}</span>
      )}
    </div>
  );
}
