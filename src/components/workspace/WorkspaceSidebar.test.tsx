import { fireEvent, render, screen } from "@testing-library/react";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import type { WorkspaceSnapshot } from "../../lib/workspace";

const workspace: WorkspaceSnapshot = { root: "/tmp/workspace", name: "workspace", tree: [{ name: "request.json", path: "request.json", kind: "file", children: [] }] };

describe("workspace file operations", () => {
  it("requires confirmation before deleting a file", () => {
    const onDelete = vi.fn();
    render(<WorkspaceSidebar workspace={workspace} onOpenDirectory={() => {}} onOpenFile={() => {}} onCreate={vi.fn()} onRename={vi.fn()} onDelete={onDelete} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete request.json" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText("Delete entry?")).toBeInTheDocument();
  });
});
