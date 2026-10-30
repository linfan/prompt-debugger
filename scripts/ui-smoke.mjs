import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto("http://localhost:1420", { waitUntil: "networkidle" });
  await page.getByText("Shape a better prompt").waitFor();
  await page.screenshot({ path: "/tmp/prompt-editor-home.png", fullPage: true });

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.getByRole("button", { name: "Expand sidebar" }).waitFor();
  await page.getByRole("button", { name: "Expand sidebar" }).click();

  await page.getByRole("button", { name: "Paste request" }).click();
  const request = {
    model: "gpt-test",
    messages: [
      { role: "system", content: "You are a concise assistant." },
      { role: "user", content: [{ type: "text", text: "Inspect this image" }, { type: "image_url", image_url: { url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%234a88c4'/%3E%3C/svg%3E" } }] },
      { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "Read", arguments: "{\"path\":\"/tmp/example\"}" } }] },
    ],
  };
  await page.locator(".paste-dialog textarea").fill(JSON.stringify(request));
  await page.getByRole("button", { name: "Open request" }).click();
  await page.getByText("MESSAGES").waitFor();
  assert.equal(await page.locator(".message-list-item").count(), 3);
  await page.locator(".message-list-item").nth(1).click();
  await page.locator(".message-identity .image-count").waitFor();
  await page.locator(".request-config input").fill("gpt-edited");
  await page.getByRole("button", { name: "Raw", exact: true }).click();
  await page.getByRole("button", { name: "Collapse message" }).click();
  await page.getByRole("button", { name: "Expand message" }).waitFor();
  await page.getByRole("button", { name: "Rendered", exact: true }).click();
  await page.screenshot({ path: "/tmp/prompt-editor-request.png", fullPage: true });

  await page.getByRole("button", { name: "Response", exact: true }).click();
  await page.getByRole("button", { name: "Import response" }).click();
  const events = [
    { choices: [{ index: 0, delta: { reasoning_content: "Check the request first.", content: "Streamed " } }] },
    { choices: [{ index: 0, delta: { content: "content", tool_calls: [{ index: 0, id: "call_2", function: { name: "Grep", arguments: "{\"pattern\":\"test\"}" } }] } }] },
  ];
  const sse = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n";
  await page.locator(".paste-dialog textarea").fill(sse);
  await page.getByRole("button", { name: "Open response" }).click();
  await page.getByText("Check the request first.").waitFor();
  await page.getByText("Streamed content").waitFor();
  await page.getByText("Grep").waitFor();
  await page.screenshot({ path: "/tmp/prompt-editor-response.png", fullPage: true });

  await page.getByRole("button", { name: "API settings" }).click();
  await page.getByLabel("API URL").fill("http://localhost:18080/v1/chat/completions");
  await page.locator("#api-token").fill("ui-test-token");
  assert.equal(await page.locator("#api-token").getAttribute("type"), "password");
  await page.getByRole("button", { name: "Done" }).click();

  assert.deepEqual(errors, []);
  console.log("UI smoke passed: sidebar, request editing, image count, JSON tree, SSE response, API settings.");
  console.log("Screenshots: /tmp/prompt-editor-home.png /tmp/prompt-editor-request.png /tmp/prompt-editor-response.png");
} finally {
  await browser.close();
}
