import { contentText, messageImageCount, parseChatRequest } from "./openai";
import { formatRequest, reorderMessages, updateMessage } from "./request";

describe("message reordering", () => {
  const messages = ["a", "b", "c"];

  it("moves an item into the gap after the next item", () => {
    expect(reorderMessages(messages, 0, 2)).toEqual({ messages: ["b", "a", "c"], index: 1 });
    expect(reorderMessages(messages, 0, 3)).toEqual({ messages: ["b", "c", "a"], index: 2 });
  });

  it("moves an item into the gap before the previous item", () => {
    expect(reorderMessages(messages, 2, 0)).toEqual({ messages: ["c", "a", "b"], index: 0 });
    expect(reorderMessages(messages, 2, 1)).toEqual({ messages: ["a", "c", "b"], index: 1 });
  });

  it("keeps the list untouched when the gap is around the dragged item", () => {
    expect(reorderMessages(messages, 1, 1)).toEqual({ messages, index: 1 });
    expect(reorderMessages(messages, 1, 2)).toEqual({ messages, index: 1 });
  });
});

describe("request editing", () => {
  it("preserves unknown request, message and part fields", () => {
    const request = parseChatRequest(JSON.stringify({ model: "test", custom: { keep: true }, tools: [{ type: "function", function: { name: "lookup", description: "Look up a value", parameters: { type: "object" }, providerOption: true } }], messages: [{ role: "user", custom: 1, content: [{ type: "text", text: "old", extra: true }, { type: "image_url", image_url: { url: "data:image/png;base64,x" } }] }] }));
    const next = updateMessage(request, 0, (message) => ({ ...message, content: "new" }));
    expect(next.custom).toEqual({ keep: true });
    expect(next.tools?.[0].function).toEqual({ name: "lookup", description: "Look up a value", parameters: { type: "object" }, providerOption: true });
    expect(next.messages[0].custom).toBe(1);
    expect(request.messages[0].content).not.toBe("new");
    expect(messageImageCount(request.messages[0])).toBe(1);
    expect(contentText(request.messages[0].content)).toBe("old");
    expect(formatRequest(next).endsWith("\n")).toBe(true);
  });

  it("rejects malformed request tools", () => {
    expect(() => parseChatRequest(JSON.stringify({ messages: [], tools: {} }))).toThrow("Request tools must be an array.");
    expect(() => parseChatRequest(JSON.stringify({ messages: [], tools: [{ function: "invalid" }] }))).toThrow("Tool 1 must be an object with a function object.");
  });
});
