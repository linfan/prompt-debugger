import type { ChatMessage, ChatRequest } from "./openai";

export function reorderMessages<T>(messages: T[], from: number, gap: number): { messages: T[]; index: number } {
  const index = gap > from ? gap - 1 : gap;
  if (index === from) return { messages, index };
  const next = [...messages];
  const [moved] = next.splice(from, 1);
  next.splice(index, 0, moved);
  return { messages: next, index };
}

export function updateMessage(request: ChatRequest, index: number, updater: (message: ChatMessage) => ChatMessage): ChatRequest {
  return {
    ...request,
    messages: request.messages.map((message, messageIndex) => messageIndex === index ? updater(message) : message),
  };
}

export function formatRequest(request: ChatRequest): string {
  return `${JSON.stringify(request, null, 2)}\n`;
}

export function messagePreview(message: ChatMessage): string {
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content.map((part) => {
      if (typeof part === "object" && part !== null && "text" in part && typeof part.text === "string") return part.text;
      return "";
    }).join(" ");
  }
  if (message.tool_calls?.length) return `${message.tool_calls.length} tool call${message.tool_calls.length > 1 ? "s" : ""}`;
  return "No text content";
}
