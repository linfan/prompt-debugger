import { parseCompletionJson } from "./openai";
import { CompletionSseParser, parseCompletionSse } from "./sse";

const events = [
  { choices: [{ index: 0, delta: { content: "你好", reasoning_content: "先分析" } }] },
  { choices: [{ index: 1, delta: { content: "第二路" } }, { index: 0, delta: { tool_calls: [{ index: 0, id: "call_", function: { name: "re", arguments: "{\"pa" } }] } }] },
  { choices: [{ index: 0, delta: { content: "，世界", tool_calls: [{ index: 1, id: "other", function: { name: "write", arguments: "{}" } }, { index: 0, function: { name: "ad", arguments: "th\":\"/tmp\"}" } }] } }] },
  { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
];
const raw = events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join("") + "data: [DONE]\r\n\r\n";

describe("completion SSE parser", () => {
  it("aggregates content, reasoning, choices and interleaved tool calls", () => {
    const result = parseCompletionSse(raw);
    expect(result.done).toBe(true);
    expect(result.choices).toHaveLength(2);
    expect(result.choices[0]).toMatchObject({ content: "你好，世界", reasoningContent: "先分析", finishReason: "tool_calls" });
    expect(result.choices[0].toolCalls).toEqual([
      { index: 0, id: "call_", name: "read", arguments: "{\"path\":\"/tmp\"}" },
      { index: 1, id: "other", name: "write", arguments: "{}" },
    ]);
    expect(result.choices[1].content).toBe("第二路");
  });

  it("produces identical output for single-character chunks", () => {
    const parser = new CompletionSseParser();
    for (const character of raw) parser.feed(character);
    expect(parser.finish()).toEqual(parseCompletionSse(raw));
  });

  it("supports comments, multiline data and an unterminated final event", () => {
    const result = parseCompletionSse(": heartbeat\n\ndata: {\"choices\":[{\"index\":0,\ndata: \"delta\":{\"content\":\"ok\"}}]}");
    expect(result.choices[0].content).toBe("ok");
  });

  it("keeps valid data when an event is malformed", () => {
    const result = parseCompletionSse("data: nope\n\ndata: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"ok\"}}]}\n\n");
    expect(result.choices[0].content).toBe("ok");
    expect(result.warnings).toHaveLength(1);
  });
});

describe("completion JSON parser", () => {
  it("extracts messages and multimodal content", () => {
    const result = parseCompletionJson(JSON.stringify({ choices: [{ index: 0, message: { content: [{ type: "text", text: "hello" }, { type: "image_url", image_url: { url: "x" } }], reasoning_content: "think", tool_calls: [{ id: "1", function: { name: "Read", arguments: "{}" } }] } }] }));
    expect(result.choices[0]).toMatchObject({ content: "hello", reasoningContent: "think" });
    expect(result.choices[0].toolCalls[0].name).toBe("Read");
  });
});
