import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("keeps tools behind a toggle and previews type, name, description, and parameter counts", () => {
    const withTools = parseChatRequest(JSON.stringify({
      messages: [{ role: "user", content: "Weather" }],
      tools: [
        { type: "function", function: { name: "get_weather", description: "Read the current weather", parameters: { type: "object", properties: { location: { type: "string", description: "City name" } }, required: ["location"] } } },
        { type: "function", function: { name: "search" } },
      ],
    }));
    render(<EditorHarness initial={withTools} />);
    expect(screen.getByText("MESSAGES")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Request tools" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tools" }));
    const tools = screen.getByRole("region", { name: "Request tools" });
    expect(screen.queryByText("MESSAGES")).not.toBeInTheDocument();
    const list = tools.querySelector(".message-list") as HTMLElement;
    expect(within(list).getAllByText("function")).toHaveLength(2);
    expect(within(list).getByText("get_weather")).toBeInTheDocument();
    expect(within(list).getByText("Read the current weather")).toBeInTheDocument();
    expect(within(list).getByText("1 param")).toBeInTheDocument();
    expect(within(list).getByText("No description")).toBeInTheDocument();
    expect(within(list).getByText("No params")).toBeInTheDocument();

    expect(screen.getByLabelText("TYPE")).toHaveValue("function");
    expect(screen.getByLabelText("NAME")).toHaveValue("get_weather");
    expect(screen.getByLabelText("DESCRIPTION")).toHaveValue("Read the current weather");
    expect(screen.getByLabelText("PARAMETERS JSON")).toHaveValue(JSON.stringify({ type: "object", properties: { location: { type: "string", description: "City name" } }, required: ["location"] }, null, 2));

    fireEvent.click(screen.getByRole("button", { name: "Messages" }));
    expect(screen.getByText("MESSAGES")).toBeInTheDocument();
  });

  it("shows raw tool JSON and edits it", () => {
    const withTools = parseChatRequest(JSON.stringify({ messages: [{ role: "user", content: "Weather" }], tools: [{ type: "function", function: { name: "get_weather" } }] }));
    render(<EditorHarness initial={withTools} />);
    fireEvent.click(screen.getByRole("button", { name: "Tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Raw" }));
    expect(screen.getByText(/"name": "get_weather"/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Edit JSON/ }));
    fireEvent.change(screen.getByDisplayValue(/"name": "get_weather"/), { target: { value: JSON.stringify({ type: "function", function: { name: "renamed" } }, null, 2) } });
    expect(screen.getByText("renamed")).toBeInTheDocument();
  });

  it("adds, edits, and deletes tools", () => {
    render(<EditorHarness initial={request} />);
    fireEvent.click(screen.getByRole("button", { name: "Tools" }));
    expect(screen.getByText("This request has no tools.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add tool/ }));
    expect(screen.getByLabelText("NAME")).toHaveValue("new_tool");
    fireEvent.change(screen.getByLabelText("NAME"), { target: { value: "lookup" } });
    expect(screen.getByText("lookup")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("TYPE"), { target: { value: "custom" } });
    expect(within(screen.getByRole("region", { name: "Request tools" }).querySelector(".message-list") as HTMLElement).getAllByText("custom")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("PARAMETERS JSON"), { target: { value: '{"type":"object","properties":{"q":{"type":"string"},"limit":{"type":"number"}}}' } });
    expect(within(screen.getByRole("region", { name: "Request tools" }).querySelector(".message-list") as HTMLElement).getByText("2 params")).toBeInTheDocument();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Delete tool" }));
    expect(confirm).toHaveBeenCalledWith("Delete this tool?");
    expect(screen.getByText("This request has no tools.")).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("only shows tools after switching to the tools view", () => {
    render(<EditorHarness initial={request} />);
    expect(screen.queryByRole("region", { name: "Request tools" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tools" }));
    expect(screen.getByText("This request has no tools.")).toBeInTheDocument();
  });

  it("shows tools when the request has no messages", () => {
    const withoutMessages = parseChatRequest(JSON.stringify({ messages: [], tools: [{ type: "function", function: { name: "lonely_tool" } }] }));
    render(<EditorHarness initial={withoutMessages} />);
    expect(screen.getByText("This request has no messages.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tools" }));
    expect(screen.getByRole("region", { name: "Request tools" })).toBeInTheDocument();
    expect(screen.getByText("lonely_tool")).toBeInTheDocument();
  });
});
