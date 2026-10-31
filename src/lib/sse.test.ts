import { parseCompletionJson } from "./openai";
import { extractSseBody } from "./document";
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

describe("reasoning and tool call variants", () => {
  const event = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;

  it("keeps reasoning without duplicating alias fields", () => {
    const result = parseCompletionSse(event({ choices: [{ index: 0, delta: { reasoning: "思考", reasoning_content: "思考" } }] }));
    expect(result.choices[0].reasoningContent).toBe("思考");
  });

  it("collects OpenRouter reasoning details", () => {
    const result = parseCompletionSse(event({ choices: [{ index: 0, delta: { reasoning_details: [{ type: "reasoning.text", text: "先想" }, { type: "reasoning.summary", summary: "再想" }] } }] }));
    expect(result.choices[0].reasoningContent).toBe("先想再想");
  });

  it("collects thinking deltas and reasoning content parts", () => {
    const direct = parseCompletionSse(event({ choices: [{ index: 0, delta: { thinking: "思考" } }] }));
    expect(direct.choices[0].reasoningContent).toBe("思考");
    const parts = parseCompletionSse(event({ choices: [{ index: 0, delta: { content: [{ type: "thinking", thinking: [{ type: "text", text: "推理" }] }, { type: "text", text: "回答" }] } }] }));
    expect(parts.choices[0]).toMatchObject({ reasoningContent: "推理", content: "回答" });
  });

  it("accepts message payloads inside stream events", () => {
    const result = parseCompletionSse(event({ choices: [{ index: 0, message: { reasoning_content: "思考", content: "回答" } }] }));
    expect(result.choices[0]).toMatchObject({ reasoningContent: "思考", content: "回答" });
  });

  it("aggregates tool calls without an index and ignores repeated fragments", () => {
    const rawCalls = [
      { choices: [{ index: 0, delta: { tool_calls: [{ id: "call_1", function: { name: "Read" } }] } }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ id: "call_1", function: { name: "Read", arguments: "{\"p\":" } }] } }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ id: "call_1", function: { name: "Read", arguments: "1}" } }] } }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ id: "call_2", function: { name: "Write", arguments: "{}" } }] } }] },
    ].map(event).join("");
    const result = parseCompletionSse(rawCalls);
    expect(result.choices[0].toolCalls).toEqual([
      { index: 0, id: "call_1", name: "Read", arguments: "{\"p\":1}" },
      { index: 1, id: "call_2", name: "Write", arguments: "{}" },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("handles providers that resend cumulative tool call snapshots", () => {
    const rawCalls = [
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "Read", arguments: "{\"p\":" } }] } }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "Read", arguments: "{\"p\":1}" } }] } }] },
    ].map(event).join("");
    const result = parseCompletionSse(rawCalls);
    expect(result.choices[0].toolCalls).toEqual([{ index: 0, id: "call_1", name: "Read", arguments: "{\"p\":1}" }]);
  });

  it("keeps reasoning when an SSE file has a header preamble", () => {
    const file = `HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\n\r\n${event({ choices: [{ index: 0, delta: { reasoning_content: "思考" } }] })}${event({ choices: [{ index: 0, delta: { content: "回答" } }] })}data: [DONE]\n\n`;
    const result = parseCompletionSse(extractSseBody(file));
    expect(result.choices[0]).toMatchObject({ reasoningContent: "思考", content: "回答" });
  });
});

describe("completion JSON reasoning variants", () => {
  it("collects reasoning details and object arguments", () => {
    const result = parseCompletionJson(JSON.stringify({ choices: [{ index: 0, message: { content: "回答", reasoning_details: [{ type: "reasoning.text", text: "思考" }], tool_calls: [{ id: "call_1", function: { name: "Read", arguments: { path: "/tmp" } } }] } }] }));
    expect(result.choices[0]).toMatchObject({ content: "回答", reasoningContent: "思考" });
    expect(result.choices[0].toolCalls[0]).toMatchObject({ id: "call_1", name: "Read", arguments: "{\"path\":\"/tmp\"}" });
  });
});
