import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import App from "./App";
import type { WorkspaceSnapshot } from "./lib/workspace";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), Channel: class {} }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));

const workspace: WorkspaceSnapshot = {
  root: "/tmp/workspace",
  name: "workspace",
  tree: [
    { name: "broken.json", path: "broken.json", fullPath: "/tmp/workspace/broken.json", kind: "file", children: [] },
    { name: "request.json", path: "request.json", fullPath: "/tmp/workspace/request.json", kind: "file", children: [] },
  ],
};

describe("app shell", () => {
  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.mocked(invoke).mockReset();
    vi.mocked(open).mockReset();
  });

  it("opens a malformed workspace file as text from its context menu", async () => {
    vi.mocked(open).mockResolvedValue("/tmp/workspace");
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "open_workspace") return workspace;
      if (command === "read_workspace_file") return { path: "broken.json", fullPath: "/tmp/workspace/broken.json", name: "broken.json", content: '{"messages": ' };
      throw new Error(`Unexpected command: ${command}`);
    });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Open directory" }));
    fireEvent.contextMenu(await screen.findByText("broken.json"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open as text" }));
    await waitFor(() => expect(document.querySelector(".text-file pre")?.textContent).toBe('{"messages": '));
    expect(screen.getByText("Text", { selector: ".document-kind-label" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /broken\.json/ })).toBeInTheDocument();
  });

  it("records only dialog-selected directories, never files opened from the tree", async () => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    vi.mocked(open).mockResolvedValue("/tmp/workspace");
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "open_workspace") return workspace;
      if (command === "read_workspace_file") return { path: "request.json", fullPath: "/tmp/workspace/request.json", name: "request.json", content: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }) };
      if (command === "record_recent") return undefined;
      throw new Error(`Unexpected command: ${command}`);
    });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Open directory" }));
    fireEvent.click(await screen.findByText("request.json"));
    await screen.findByRole("tab", { name: /request\.json/ });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("record_recent", { path: "/tmp/workspace", kind: "directory" }));
    expect(invoke).not.toHaveBeenCalledWith("record_recent", expect.objectContaining({ kind: "file" }));
  });

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
