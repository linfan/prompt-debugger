import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

describe("app shell", () => {
  it("opens a pasted request in a tab and collapses the workspace sidebar", () => {
    render(<App />);
    expect(screen.getByText("Open a prompt or response")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Paste" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: JSON.stringify({ model: "test-model", messages: [{ role: "user", content: "Hello" }] }) } });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("tab", { name: /Pasted request/ })).toBeInTheDocument();
    expect(screen.getByText("Request", { selector: ".document-kind-label" })).toBeInTheDocument();
    expect(screen.getByText("MESSAGES")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
    expect(screen.queryByText("WORKSPACE")).not.toBeInTheDocument();
  });
});
