import { useCallback, useEffect, useState } from "react";
import { Braces, ChevronRight, FolderOpen, Inbox, PanelLeftClose, PanelLeftOpen, Send, Sparkles, X } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { WorkspaceSidebar } from "./components/workspace/WorkspaceSidebar";
import type { WorkspaceFile, WorkspaceSnapshot } from "./lib/workspace";

type Tab = "request" | "response";

export default function App() {
  const [tab, setTab] = useState<Tab>("request");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [currentFile, setCurrentFile] = useState<WorkspaceFile | null>(null);
  const [error, setError] = useState("");

  const openDirectory = useCallback(async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: "Open prompt workspace" });
      if (!selected) return;
      const snapshot = await invoke<WorkspaceSnapshot>("open_workspace", { root: selected });
      setWorkspace(snapshot);
      setCurrentFile(null);
      setSidebarOpen(true);
      setError("");
    } catch (reason) {
      setError(String(reason));
    }
  }, []);

  const closeWorkspace = useCallback(async () => {
    await invoke("close_workspace");
    setWorkspace(null);
    setCurrentFile(null);
  }, []);

  const handleCommand = useCallback((command: string) => {
    if (command === "toggle-sidebar") setSidebarOpen((value) => !value);
    if (command === "show-request") setTab("request");
    if (command === "show-response") setTab("response");
    if (command === "open-directory") void openDirectory();
    if (command === "close-workspace") void closeWorkspace();
    if (command === "help") setError("Open a directory, then choose a JSON request or JSON/SSE response. Use ⌘1/⌘2 to switch views.");
  }, [closeWorkspace, openDirectory]);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const unlisten = listen<string>("native-menu", (event) => handleCommand(event.payload));
    return () => { void unlisten.then((dispose) => dispose()); };
  }, [handleCommand]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === "b") { event.preventDefault(); handleCommand("toggle-sidebar"); }
      else if (event.key === "1") { event.preventDefault(); handleCommand("show-request"); }
      else if (event.key === "2") { event.preventDefault(); handleCommand("show-response"); }
      else if (event.key.toLowerCase() === "o") { event.preventDefault(); handleCommand("open-directory"); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleCommand]);

  const openFile = async (path: string) => {
    try {
      const file = await invoke<WorkspaceFile>("read_workspace_file", { path });
      setCurrentFile(file);
      setTab(path.endsWith(".sse") ? "response" : "request");
      setError("");
    } catch (reason) { setError(String(reason)); }
  };

  const createEntry = async (parent: string, name: string, kind: "file" | "directory") => {
    setWorkspace(await invoke("create_workspace_entry", { parent, name, kind }));
  };
  const renameEntry = async (path: string, newName: string) => {
    setWorkspace(await invoke("rename_workspace_entry", { path, newName }));
    if (currentFile?.path === path) setCurrentFile(null);
  };
  const deleteEntry = async (path: string) => {
    setWorkspace(await invoke("delete_workspace_entry", { path }));
    if (currentFile && (currentFile.path === path || currentFile.path.startsWith(`${path}/`))) setCurrentFile(null);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand"><span className="brand-mark"><Braces size={19} /></span><span>Prompt Editor</span><span className="version">BETA</span></div>
        <div className="header-actions">
          <button className="button button-secondary" type="button" onClick={() => void openDirectory()}><FolderOpen size={16} /> Open directory</button>
          <button className="button button-primary" type="button" disabled><Send size={15} /> Send request</button>
        </div>
      </header>

      {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError("")}><X size={14} /></button></div>}
      <div className="workspace-layout">
        <aside className={`sidebar ${sidebarOpen ? "is-open" : "is-collapsed"}`} aria-label="Workspace sidebar">
          <div className="sidebar-heading">
            {sidebarOpen && <span>WORKSPACE</span>}
            <button className="icon-button" type="button" aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"} title="Toggle sidebar (⌘B)" onClick={() => setSidebarOpen((value) => !value)}>
              {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
            </button>
          </div>
          {sidebarOpen ? <WorkspaceSidebar workspace={workspace} currentPath={currentFile?.path} onOpenDirectory={() => void openDirectory()} onOpenFile={(path) => void openFile(path)} onCreate={createEntry} onRename={renameEntry} onDelete={deleteEntry} onRefresh={async () => { if (workspace) setWorkspace(await invoke("list_workspace")); }} /> : <button className="collapsed-action" type="button" aria-label="Open directory" title="Open directory" onClick={() => void openDirectory()}><FolderOpen size={18} /></button>}
        </aside>

        <main className="main-panel">
          <div className="main-toolbar">
            <nav className="tabs" aria-label="Editor sections">
              <button className={tab === "request" ? "tab active" : "tab"} onClick={() => setTab("request")} type="button">Request{currentFile && tab === "request" ? " · " + currentFile.name : ""}</button>
              <button className={tab === "response" ? "tab active" : "tab"} onClick={() => setTab("response")} type="button">Response</button>
            </nav>
            <span className="shortcut-hint">⌘1 / ⌘2</span>
          </div>

          {currentFile ? <section className="file-preview">
            <div className="file-preview-heading"><div><span className="eyebrow">{currentFile.name.endsWith(".sse") ? "SSE STREAM" : "JSON DOCUMENT"}</span><h1>{currentFile.name}</h1><p>{currentFile.path}</p></div><button className="icon-button" title="Close file" aria-label="Close file" onClick={() => setCurrentFile(null)}><X size={17} /></button></div>
            <pre>{currentFile.content || "(empty file)"}</pre>
          </section> : <section className="empty-state">
            <div className="empty-illustration">{tab === "request" ? <Sparkles size={30} strokeWidth={1.5} /> : <Inbox size={30} strokeWidth={1.5} />}</div>
            <h1>{tab === "request" ? "Shape a better prompt" : "Inspect every detail"}</h1>
            <p>{tab === "request" ? "Paste an OpenAI chat completion request, or open a JSON file from your workspace." : "Run a request or import a JSON / SSE response to see its rendered content."}</p>
            <button className="button button-secondary" type="button"><ChevronRight size={16} />{tab === "request" ? "Paste request" : "Import response"}</button>
          </section>}
        </main>
      </div>
    </div>
  );
}
