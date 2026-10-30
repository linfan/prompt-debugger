import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { WorkspaceNode, WorkspaceSnapshot } from "../../lib/workspace";

type DialogState = {
  mode: "file" | "directory" | "rename" | "delete";
  node?: WorkspaceNode;
  parent: string;
};

interface Props {
  workspace: WorkspaceSnapshot | null;
  currentPath?: string;
  onOpenDirectory: () => void;
  onOpenFile: (path: string) => void;
  onCreate: (parent: string, name: string, kind: "file" | "directory") => Promise<void>;
  onRename: (path: string, name: string) => Promise<void>;
  onDelete: (path: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function WorkspaceSidebar({ workspace, currentPath, onOpenDirectory, onOpenFile, onCreate, onRename, onDelete, onRefresh }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = (path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const openDialog = (state: DialogState) => {
    setDialog(state);
    setName(state.mode === "rename" ? state.node?.name ?? "" : state.mode === "file" ? "request.json" : "New folder");
    setError("");
  };

  const submit = async () => {
    if (!dialog) return;
    setBusy(true);
    setError("");
    try {
      if (dialog.mode === "delete") await onDelete(dialog.node!.path);
      else if (dialog.mode === "rename") await onRename(dialog.node!.path, name);
      else await onCreate(dialog.parent, name, dialog.mode);
      setDialog(null);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  const renderNode = (node: WorkspaceNode, depth: number): React.ReactNode => {
    const isDirectory = node.kind === "directory";
    const isExpanded = expanded.has(node.path);
    return (
      <div key={node.path}>
        <div
          className={`tree-row ${currentPath === node.path ? "selected" : ""}`}
          style={{ paddingLeft: 9 + depth * 15 }}
          onClick={() => isDirectory ? toggle(node.path) : onOpenFile(node.path)}
        >
          <span className="tree-chevron">{isDirectory ? (isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : null}</span>
          {isDirectory ? (isExpanded ? <FolderOpen size={15} /> : <Folder size={15} />) : <FileCode2 size={15} />}
          <span className="tree-name" title={node.path}>{node.name}</span>
          <span className="tree-actions" onClick={(event) => event.stopPropagation()}>
            {isDirectory && <>
              <button title="New file" aria-label={`New file in ${node.name}`} onClick={() => { toggle(node.path); openDialog({ mode: "file", parent: node.path }); }}><FilePlus2 size={12} /></button>
              <button title="New folder" aria-label={`New folder in ${node.name}`} onClick={() => openDialog({ mode: "directory", parent: node.path })}><FolderPlus size={12} /></button>
            </>}
            <button title="Rename" aria-label={`Rename ${node.name}`} onClick={() => openDialog({ mode: "rename", node, parent: "" })}><Pencil size={12} /></button>
            <button title="Delete" aria-label={`Delete ${node.name}`} onClick={() => openDialog({ mode: "delete", node, parent: "" })}><Trash2 size={12} /></button>
          </span>
        </div>
        {isDirectory && isExpanded && <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>}
      </div>
    );
  };

  if (!workspace) {
    return <div className="sidebar-empty"><FolderOpen size={26} strokeWidth={1.5} /><strong>No directory open</strong><p>Open a directory to browse JSON and SSE files.</p><button className="button button-quiet" type="button" onClick={onOpenDirectory}>Choose directory</button></div>;
  }

  return <>
    <div className="workspace-title">
      <span title={workspace.root}><FolderOpen size={15} />{workspace.name}</span>
      <div>
        <button aria-label="New root file" title="New file" onClick={() => openDialog({ mode: "file", parent: "" })}><FilePlus2 size={14} /></button>
        <button aria-label="New root folder" title="New folder" onClick={() => openDialog({ mode: "directory", parent: "" })}><FolderPlus size={14} /></button>
        <button aria-label="Refresh workspace" title="Refresh" onClick={() => void onRefresh()}><RefreshCw size={13} /></button>
      </div>
    </div>
    <div className="tree-scroll">
      {workspace.tree.length ? workspace.tree.map((node) => renderNode(node, 0)) : <p className="tree-empty">No JSON or SSE files yet.</p>}
    </div>
    <div className="sidebar-footer">JSON · SSE</div>

    {dialog && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}>
      <form className="dialog" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <h2>{dialog.mode === "delete" ? "Delete entry?" : dialog.mode === "rename" ? "Rename entry" : dialog.mode === "file" ? "New file" : "New folder"}</h2>
        {dialog.mode === "delete" ? <p>Delete <strong>{dialog.node?.name}</strong>?{dialog.node?.kind === "directory" && " All files and folders inside it will be deleted."} This cannot be undone.</p> : <>
          <label htmlFor="entry-name">Name</label>
          <input id="entry-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={dialog.mode === "file" ? "request.json" : "Folder name"} />
        </>}
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setDialog(null)}>Cancel</button><button disabled={busy || (dialog.mode !== "delete" && !name.trim())} className={`button ${dialog.mode === "delete" ? "button-danger" : "button-primary"}`}>{busy ? "Working…" : dialog.mode === "delete" ? "Delete" : "Confirm"}</button></div>
      </form>
    </div>}
  </>;
}
