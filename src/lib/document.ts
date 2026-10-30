const BODY_SCAN_LINES = 50;

function nextLineOffset(raw: string, offset: number, line: string): number {
  const next = offset + line.length;
  if (raw.startsWith("\r\n", next)) return next + 2;
  if (raw[next] === "\n") return next + 1;
  return next;
}

/**
 * Recorded files can carry a request/response header block before the actual
 * JSON body. Only the first few lines are scanned so a stray "{" inside a
 * header value cannot make a malformed document look valid.
 */
export function extractJsonBody(raw: string, maxLines = BODY_SCAN_LINES): string {
  let lastError: unknown;
  try {
    JSON.parse(raw);
    return raw;
  } catch (error) {
    lastError = error;
  }

  const lines = raw.split(/\r?\n/);
  let offset = 0;
  for (let index = 0; index < lines.length && index < maxLines; index += 1) {
    const line = lines[index];
    if (index > 0 && /^[ \t]*[{[]/.test(line)) {
      const body = raw.slice(offset);
      try {
        JSON.parse(body);
        return body;
      } catch (error) {
        lastError = error;
      }
    }
    offset = nextLineOffset(raw, offset, line);
  }
  throw lastError;
}

/**
 * Drops an HTTP header preamble from an SSE recording so the raw view starts
 * at the first event. The SSE parser itself already ignores non-data lines.
 */
export function extractSseBody(raw: string, maxLines = BODY_SCAN_LINES): string {
  const lines = raw.split(/\r?\n/);
  let offset = 0;
  for (let index = 0; index < lines.length && index < maxLines; index += 1) {
    if (/^data:/.test(lines[index]) || /^:\s?/.test(lines[index])) {
      return raw.slice(offset);
    }
    offset = nextLineOffset(raw, offset, lines[index]);
  }
  return raw;
}
