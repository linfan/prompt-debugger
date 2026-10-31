import { render, screen } from "@testing-library/react";
import { RequestEditor } from "./RequestEditor";
import { parseChatRequest } from "../../lib/openai";

const request = parseChatRequest(JSON.stringify({ model: "test-model", messages: [{ role: "user", content: "Hello" }] }));

describe("request editor", () => {
  it("shows the file name in the document title", () => {
    render(<RequestEditor request={request} source={JSON.stringify(request)} dirty={false} filePath="/tmp/prompt.json" name="prompt.json" onChange={() => {}} onSourceChange={() => {}} onSave={() => {}} />);
    expect(screen.getByText("prompt.json")).toBeInTheDocument();
  });

  it("falls back to a generic title for pasted requests", () => {
    render(<RequestEditor request={request} source={JSON.stringify(request)} dirty={false} onChange={() => {}} onSourceChange={() => {}} onSave={() => {}} />);
    expect(screen.getByText("Chat completion request")).toBeInTheDocument();
  });
});
