import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { RequestEditor } from "./RequestEditor";
import { parseChatRequest, type ChatRequest } from "../../lib/openai";

const request = parseChatRequest(JSON.stringify({ model: "test-model", messages: [{ role: "user", content: "Hello" }] }));

function EditorHarness({ initial }: { initial: ChatRequest }) {
  const [value, setValue] = useState(initial);
  return <RequestEditor request={value} source={JSON.stringify(value)} dirty={false} onChange={setValue} onSourceChange={() => {}} onSave={() => {}} />;
}

describe("request editor", () => {
  it("shows the file name in the document title", () => {
    render(<RequestEditor request={request} source={JSON.stringify(request)} dirty={false} filePath="/tmp/prompt.json" name="prompt.json" onChange={() => {}} onSourceChange={() => {}} onSave={() => {}} />);
    expect(screen.getByText("prompt.json")).toBeInTheDocument();
  });

  it("falls back to a generic title for pasted requests", () => {
    render(<RequestEditor request={request} source={JSON.stringify(request)} dirty={false} onChange={() => {}} onSourceChange={() => {}} onSave={() => {}} />);
    expect(screen.getByText("Chat completion request")).toBeInTheDocument();
  });

  it("shows a tool call id field when a message is switched to the tool role", () => {
    render(<EditorHarness initial={request} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "tool" } });
    expect(screen.getByLabelText("TOOL CALL ID")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add function call/ })).not.toBeInTheDocument();
  });

  it("adds function calls to assistant messages", () => {
    const assistant = parseChatRequest(JSON.stringify({ messages: [{ role: "assistant", content: "Sure" }] }));
    render(<EditorHarness initial={assistant} />);
    fireEvent.click(screen.getByRole("button", { name: /Add function call/ }));
    expect(screen.getByText("CALL 1")).toBeInTheDocument();
    expect(screen.getByLabelText("FUNCTION")).toHaveValue("");
    expect(screen.getByLabelText("ARGUMENTS")).toHaveValue("{}");
  });
});
