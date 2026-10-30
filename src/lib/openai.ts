export interface ToolCall {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ChatMessage {
  role: string;
  content?: unknown;
  tool_calls?: ToolCall[];
  [key: string]: unknown;
}

export interface ChatRequest {
  messages: ChatMessage[];
  [key: string]: unknown;
}

export interface ToolCallView {
  index: number;
  id: string;
  name: string;
  arguments: string;
}

export interface ChoiceAggregate {
  index: number;
  content: string;
  reasoningContent: string;
  toolCalls: ToolCallView[];
  finishReason?: string;
}

export interface ResponseAggregate {
  raw: string;
  source: "json" | "sse";
  choices: ChoiceAggregate[];
  warnings: string[];
  done: boolean;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseChatRequest(raw: string): ChatRequest {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || !Array.isArray(value.messages)) {
    throw new Error("Request must be a JSON object with a messages array.");
  }
  const messages = value.messages.map((message, index) => {
    if (!isRecord(message) || typeof message.role !== "string") {
      throw new Error(`Message ${index + 1} must be an object with a role.`);
    }
    return message as ChatMessage;
  });
  return { ...value, messages } as ChatRequest;
}

export function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (!isRecord(part)) return "";
    if (part.type === "text" && typeof part.text === "string") return part.text;
    if (part.type === "output_text" && typeof part.text === "string") return part.text;
    return "";
  }).join("");
}

export function messageImageCount(message: ChatMessage): number {
  if (!Array.isArray(message.content)) return 0;
  return message.content.filter((part) => isRecord(part) && (
    part.type === "image_url" || part.type === "input_image" || part.type === "image"
  )).length;
}

function emptyChoice(index: number): ChoiceAggregate {
  return { index, content: "", reasoningContent: "", toolCalls: [] };
}

function applyMessage(choice: ChoiceAggregate, message: Record<string, unknown>) {
  choice.content += contentText(message.content);
  if (typeof message.reasoning_content === "string") choice.reasoningContent += message.reasoning_content;
  if (typeof message.reasoning === "string") choice.reasoningContent += message.reasoning;
  if (Array.isArray(message.tool_calls)) {
    for (const call of message.tool_calls) applyToolCall(choice, call, choice.toolCalls.length, false);
  }
}

function applyToolCall(choice: ChoiceAggregate, value: unknown, fallbackIndex: number, streaming: boolean) {
  if (!isRecord(value)) return;
  const index = typeof value.index === "number" ? value.index : fallbackIndex;
  let target = choice.toolCalls.find((call) => call.index === index);
  if (!target) {
    target = { index, id: "", name: "", arguments: "" };
    choice.toolCalls.push(target);
  }
  if (typeof value.id === "string") target.id = streaming ? target.id + value.id : value.id;
  if (isRecord(value.function)) {
    if (typeof value.function.name === "string") {
      target.name = streaming ? target.name + value.function.name : value.function.name;
    }
    if (typeof value.function.arguments === "string") {
      target.arguments = streaming ? target.arguments + value.function.arguments : value.function.arguments;
    }
  }
  choice.toolCalls.sort((a, b) => a.index - b.index);
}

export function parseCompletionJson(raw: string): ResponseAggregate {
  const value: unknown = JSON.parse(raw);
  const result: ResponseAggregate = { raw, source: "json", choices: [], warnings: [], done: true };
  if (!isRecord(value) || !Array.isArray(value.choices)) {
    result.warnings.push("The JSON does not contain a choices array.");
    return result;
  }
  for (const [position, entry] of value.choices.entries()) {
    if (!isRecord(entry)) {
      result.warnings.push(`Choice ${position} is not an object.`);
      continue;
    }
    const index = typeof entry.index === "number" ? entry.index : position;
    const choice = emptyChoice(index);
    if (isRecord(entry.message)) applyMessage(choice, entry.message);
    if (typeof entry.finish_reason === "string") choice.finishReason = entry.finish_reason;
    result.choices.push(choice);
  }
  result.choices.sort((a, b) => a.index - b.index);
  return result;
}
