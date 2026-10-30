import { contentText, messageImageCount, parseChatRequest } from "./openai";
import { formatRequest, updateMessage } from "./request";

describe("request editing", () => {
  it("preserves unknown request, message and part fields", () => {
    const request = parseChatRequest(JSON.stringify({ model: "test", custom: { keep: true }, messages: [{ role: "user", custom: 1, content: [{ type: "text", text: "old", extra: true }, { type: "image_url", image_url: { url: "data:image/png;base64,x" } }] }] }));
    const next = updateMessage(request, 0, (message) => ({ ...message, content: "new" }));
    expect(next.custom).toEqual({ keep: true });
    expect(next.messages[0].custom).toBe(1);
    expect(request.messages[0].content).not.toBe("new");
    expect(messageImageCount(request.messages[0])).toBe(1);
    expect(contentText(request.messages[0].content)).toBe("old");
    expect(formatRequest(next).endsWith("\n")).toBe(true);
  });
});
