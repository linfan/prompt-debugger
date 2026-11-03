import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

describe("app shell", () => {
  it("opens a pasted request in a tab and collapses the workspace sidebar", () => {
    render(<App />);
    expect(screen.getByText("Open a prompt or response")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Paste" }));
    fireEvent.change(screen.getByPlaceholderText('{"messages":[...]} or data: {...}'), { target: { value: JSON.stringify({ model: "test-model", messages: [{ role: "user", content: "Hello" }] }) } });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("tab", { name: /Pasted request/ })).toBeInTheDocument();
    expect(screen.getByText("Request", { selector: ".document-kind-label" })).toBeInTheDocument();
    expect(screen.getByText("MESSAGES")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
    expect(screen.queryByText("WORKSPACE")).not.toBeInTheDocument();
  });

  it("creates tabs from the new tab button and switches between their contents", () => {
    render(<App />);
    const openRequest = (model: string, content: string, toolName: string) => {
      fireEvent.click(screen.getByRole("button", { name: "New tab" }));
      const request = {
        model,
        messages: [{ role: "user", content }],
        tools: [{ type: "function", function: { name: toolName, description: `${toolName} description`, parameters: { type: "object" } } }],
      };
      fireEvent.change(screen.getByPlaceholderText('{"messages":[...]} or data: {...}'), { target: { value: JSON.stringify(request) } });
      fireEvent.click(screen.getByRole("button", { name: "Open" }));
    };

    openRequest("first-model", "First request", "first_tool");
    openRequest("second-model", "Second request", "second_tool");
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByDisplayValue("Second request")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tools" }));
    expect(screen.getByText("second_tool")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("tab")[0]);
    expect(screen.getByDisplayValue("First request")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Second request")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tools" }));
    expect(screen.getByText("first_tool")).toBeInTheDocument();
  });

  it("keeps the current tabs when pasted text cannot be parsed", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "New tab" }));
    fireEvent.change(screen.getByPlaceholderText('{"messages":[...]} or data: {...}'), { target: { value: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }) } });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    fireEvent.click(screen.getByRole("button", { name: "New tab" }));
    fireEvent.change(screen.getByPlaceholderText('{"messages":[...]} or data: {...}'), { target: { value: "{" } });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.getByText("Import request or response")).toBeInTheDocument();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByDisplayValue("Hello")).toBeInTheDocument();
  });
});
