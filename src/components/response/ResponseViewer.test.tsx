import { fireEvent, render, screen } from "@testing-library/react";
import { ResponseViewer } from "./ResponseViewer";
import { parseCompletionJson } from "../../lib/openai";

describe("response viewer", () => {
  it("renders completion sections and collapsible argument JSON", () => {
    const response = parseCompletionJson(JSON.stringify({ choices: [{ index: 0, message: { content: "Done", reasoning_content: "Think", tool_calls: [{ id: "call_1", function: { name: "Read", arguments: "{\"path\":\"/tmp\",\"options\":{\"deep\":true}}" } }] } }] }));
    render(<ResponseViewer response={response} />);
    expect(screen.getByText("Think")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("deep")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse arguments" }));
    expect(screen.queryByText("deep")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Raw" }));
    expect(screen.getByRole("button", { name: "Collapse response" })).toBeInTheDocument();
  });
});
