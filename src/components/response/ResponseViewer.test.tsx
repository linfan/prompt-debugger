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

  it("collapses reasoning and content independently", () => {
    const response = parseCompletionJson(JSON.stringify({ choices: [{ index: 0, message: { content: "Final answer", reasoning_content: "Long reasoning" } }] }));
    render(<ResponseViewer response={response} />);

    expect(screen.getByRole("button", { name: "Collapse reasoning" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Collapse reasoning" }));
    expect(screen.queryByText("Long reasoning")).not.toBeInTheDocument();
    expect(screen.getByText("Final answer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand reasoning" })).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "Expand reasoning" }));
    expect(screen.getByText("Long reasoning")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collapse content" }));
    expect(screen.queryByText("Final answer")).not.toBeInTheDocument();
    expect(screen.getByText("Long reasoning")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand content" })).toBeInTheDocument();
  });
});
