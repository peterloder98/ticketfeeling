"use client";

import { MessageCircle } from "lucide-react";
import { OPEN_CHAT_EVENT } from "@/lib/chat-open";

type Props = {
  className?: string;
  children?: React.ReactNode;
};

/** Opens the floating ChatWidget (root layout). */
export function OpenChatButton({ className, children = "Chat öffnen" }: Props) {
  return (
    <button
      type="button"
      className={className ?? "tf-btn tf-btn-primary inline-flex items-center justify-center gap-2"}
      onClick={() => {
        window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT));
      }}
    >
      <MessageCircle className="h-4 w-4" strokeWidth={2.2} aria-hidden />
      {children}
    </button>
  );
}
