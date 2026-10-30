import { fireEvent, render, screen } from "@testing-library/react";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import type { WorkspaceSnapshot } from "../../lib/workspace";

const workspace: WorkspaceSnapshot = {
  root: "/tmp/workspace",
  name: "workspace",
  tree: [{ name: "request.json", path: "request.json", fullPath: "/tmp/workspace/request.json", kind: "file", children: [] }],
};

const renderSidebar = (overrides: Partial<React.ComponentProps<typeof WorkspaceSidebar>> = {}) => render(
  <WorkspaceSidebar
    workspace={workspace}
    onOpenDirectory={() => {}}
    onOpenFile={() => {}}
    onCreate={vi.fn()}
    onRename={vi.fn()}
    onDelete={vi.fn()}
    onCopyPath={vi.fn()}
    onRefresh={vi.fn()}
    {...overrides}
  />,
);

describe("workspace file operations", () => {
  it("requires confirmation before deleting a file", () => {
    const onDelete = vi.fn();
    renderSidebar({ onDelete });
    fireEvent.contextMenu(screen.getByText("request.json"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText("Delete entry?")).toBeInTheDocument();
  });

  it("offers copy path from the context menu", () => {
    const onCopyPath = vi.fn();
    renderSidebar({ onCopyPath });
    fireEvent.contextMenu(screen.getByText("request.json"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy file path" }));
    expect(onCopyPath).toHaveBeenCalledWith("/tmp/workspace/request.json");
  });

  it("closes the context menu when clicking elsewhere", () => {
    renderSidebar();
    fireEvent.contextMenu(screen.getByText("request.json"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
