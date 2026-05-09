"use client";

import type { Message } from "../use-chat-messages";
import { AssistantParts } from "./assistant-parts";

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end [content-visibility:auto]">
        <div className="max-w-[80%] bg-accent px-(--of-space-md) py-(--of-space-sm) text-[15px] leading-relaxed text-white">
          {message.parts
            .filter((p) => p.type === "text")
            .map((p, i) => (
              <p key={i} className="whitespace-pre-wrap">
                {p.text}
              </p>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start [content-visibility:auto]">
      <div className="max-w-[95%] sm:max-w-[88%]">
        <AssistantParts parts={message.parts} />
      </div>
    </div>
  );
}
