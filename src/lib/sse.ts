import {
  type ChoiceAggregate,
  type ResponseAggregate,
  contentText,
  isRecord,
  reasoningText,
} from "./openai";

function appendFragment(current: string, incoming: string): string {
  if (!incoming || incoming === current) return current;
  if (!current) return incoming;
  return incoming.startsWith(current) ? incoming : current + incoming;
}

function toolCallIndex(choice: ChoiceAggregate, call: Record<string, unknown>): number {
  if (typeof call.index === "number") return call.index;
  if (typeof call.id === "string" && call.id) {
    const matched = choice.toolCalls.find((item) => item.id === call.id);
    if (matched) return matched.index;
    return choice.toolCalls.reduce((max, item) => Math.max(max, item.index + 1), 0);
  }
  return choice.toolCalls.at(-1)?.index ?? 0;
}

export class CompletionSseParser {
  private buffer = "";
  private raw = "";
  private done = false;
  private warnings: string[] = [];
  private choices = new Map<number, ChoiceAggregate>();

  feed(chunk: string): void {
    if (!chunk) return;
    this.raw += chunk;
    this.buffer += chunk;
    let boundary: RegExpExecArray | null;
    const separator = /\r?\n\r?\n/g;
    while ((boundary = separator.exec(this.buffer)) !== null) {
      const event = this.buffer.slice(0, boundary.index);
      this.buffer = this.buffer.slice(boundary.index + boundary[0].length);
      separator.lastIndex = 0;
      this.consumeEvent(event);
    }
  }

  finish(): ResponseAggregate {
    if (this.buffer.trim()) this.consumeEvent(this.buffer);
    this.buffer = "";
    return this.snapshot();
  }

  snapshot(): ResponseAggregate {
    return {
      raw: this.raw,
      source: "sse",
      choices: [...this.choices.values()]
        .sort((a, b) => a.index - b.index)
        .map((choice) => ({ ...choice, toolCalls: choice.toolCalls.map((call) => ({ ...call })) })),
      warnings: [...this.warnings],
      done: this.done,
    };
  }

  private consumeEvent(event: string): void {
    const data = event.split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data) return;
    if (data.trim() === "[DONE]") {
      this.done = true;
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(data);
    } catch {
      this.warnings.push(`Ignored invalid JSON event: ${data.slice(0, 100)}`);
      return;
    }
    if (!isRecord(value) || !Array.isArray(value.choices)) return;
    for (const [position, entry] of value.choices.entries()) {
      if (!isRecord(entry)) continue;
      const index = typeof entry.index === "number" ? entry.index : position;
      const choice = this.choices.get(index) ?? {
        index,
        content: "",
        reasoningContent: "",
        toolCalls: [],
      };
      this.choices.set(index, choice);
      const delta = isRecord(entry.delta) ? entry.delta : isRecord(entry.message) ? entry.message : entry;
      choice.content += contentText(delta.content);
      choice.reasoningContent += reasoningText(delta);
      if (typeof entry.finish_reason === "string") choice.finishReason = entry.finish_reason;
      if (!Array.isArray(delta.tool_calls)) continue;
      for (const call of delta.tool_calls) {
        if (!isRecord(call)) continue;
        const index = toolCallIndex(choice, call);
        let target = choice.toolCalls.find((item) => item.index === index);
        if (!target) {
          target = { index, id: "", name: "", arguments: "" };
          choice.toolCalls.push(target);
        }
        if (typeof call.id === "string") target.id = appendFragment(target.id, call.id);
        if (isRecord(call.function)) {
          if (typeof call.function.name === "string") target.name = appendFragment(target.name, call.function.name);
          if (typeof call.function.arguments === "string") target.arguments = appendFragment(target.arguments, call.function.arguments);
        }
      }
      choice.toolCalls.sort((a, b) => a.index - b.index);
    }
  }
}

export function parseCompletionSse(raw: string): ResponseAggregate {
  const parser = new CompletionSseParser();
  parser.feed(raw);
  return parser.finish();
}
