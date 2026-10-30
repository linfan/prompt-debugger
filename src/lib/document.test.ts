import { extractJsonBody, extractSseBody } from "./document";

const requestFile = `POST https://example.com/v1/chat/completions
Authorization: Bearer token
Content-Type: application/json

{
  "model": "test",
  "messages": [{ "role": "user", "content": "Hi" }]
}
`;

const sseFile = `HTTP/1.1 200 OK
content-type: text/event-stream

data: {"choices":[{"index":0,"delta":{"content":"Hi"}}]}

data: [DONE]

`;

describe("extractJsonBody", () => {
  it("keeps a plain JSON document untouched", () => {
    const raw = '{"choices": []}\n';
    expect(extractJsonBody(raw)).toBe(raw);
  });

  it("skips an HTTP header block before the JSON body", () => {
    expect(extractJsonBody(requestFile)).toBe('{\n  "model": "test",\n  "messages": [{ "role": "user", "content": "Hi" }]\n}\n');
  });

  it("keeps the original error when no body is found in range", () => {
    const raw = "not json\nstill not json\n{\"broken\": }\n";
    expect(() => extractJsonBody(raw, 2)).toThrow();
  });

  it("honours the scan limit", () => {
    const raw = `${"header\n".repeat(4)}{"ok":true}`;
    expect(() => extractJsonBody(raw, 4)).toThrow();
    expect(extractJsonBody(raw, 5)).toBe('{"ok":true}');
  });
});

describe("extractSseBody", () => {
  it("keeps a plain stream untouched", () => {
    const stream = 'data: {"a":1}\n\ndata: [DONE]\n\n';
    expect(extractSseBody(stream)).toBe(stream);
  });

  it("skips an HTTP header block before the first event", () => {
    expect(extractSseBody(sseFile).startsWith('data: {"choices"')).toBe(true);
  });
});
