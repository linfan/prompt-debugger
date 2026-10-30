import { useCallback, useEffect, useState } from "react";
import { Braces, ChevronRight, Clipboard, FolderOpen, Inbox, PanelLeftClose, PanelLeftOpen, Send, Sparkles, X } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { WorkspaceSidebar } from "./components/workspace/WorkspaceSidebar";
import { RequestEditor } from "./components/request/RequestEditor";
import type { WorkspaceFile, WorkspaceSnapshot } from "./lib/workspace";
import { type ChatRequest, parseChatRequest } from "./lib/openai";
import { formatRequest } from "./lib/request";

type Tab = "request" | "response";
interface RequestDocument { source: string; savedSource: string; path?: string; name?: string }

export default function App() {
  const [tab, setTab] = useState<Tab>("request");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [currentFile, setCurrentFile] = useState<WorkspaceFile | null>(null);
  const [request, setRequest] = useState<ChatRequest | null>(null);
  const [requestDoc, setRequestDoc] = useState<RequestDocument | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [error, setError] = useState("");
  const dirty = Boolean(requestDoc && requestDoc.source !== requestDoc.savedSource);
  let sourceError = "";
  if (requestDoc) {
    try { parseChatRequest(requestDoc.source); } catch (reason) { sourceError = reason instanceof Error ? reason.message : String(reason); }
  }

  const confirmDiscard = useCallback(() => !dirty || window.confirm("Discard unsaved request changes?"), [dirty]);

  const loadRequest = useCallback((source: string, file?: WorkspaceFile) => {
    const parsed = parseChatRequest(source);
    setRequest(parsed);
    setRequestDoc({ source, savedSource: source, path: file?.path, name: file?.name });
    setCurrentFile(null);
    setTab("request");
    setError("");
  }, []);

  const openDirectory = useCallback(async () => {
    if (!confirmDiscard()) return;
    try {
      const selected = await open({ directory: true, multiple: false, title: "Open prompt workspace" });
      if (!selected) return;
      const snapshot = await invoke<WorkspaceSnapshot>("open_workspace", { root: selected });
      setWorkspace(snapshot);
      setCurrentFile(null);
      setRequest(null);
      setRequestDoc(null);
      setSidebarOpen(true);
      setError("");
    } catch (reason) { setError(String(reason)); }
  }, [confirmDiscard]);

  const closeWorkspace = useCallback(async () => {
    if (!confirmDiscard()) return;
    await invoke("close_workspace");
    setWorkspace(null);
    setCurrentFile(null);
    setRequest(null);
    setRequestDoc(null);
  }, [confirmDiscard]);

  const saveRequest = useCallback(async () => {
    if (!request || !requestDoc?.path || !dirty || sourceError) return;
    try {
      const formatted = formatRequest(request);
      await invoke("write_request_file", { path: requestDoc.path, content: formatted });
      setRequestDoc({ ...requestDoc, source: formatted, savedSource: formatted });
      setError("");
    } catch (reason) { setError(String(reason)); }
  }, [dirty, request, requestDoc, sourceError]);

  const handleCommand = useCallback((command: string) => {
    if (command === "toggle-sidebar") setSidebarOpen((value) => !value);
    if (command === "show-request") setTab("request");
    if (command === "show-response") setTab("response");
    if (command === "open-directory") void openDirectory();
    if (command === "close-workspace") void closeWorkspace();
    if (command === "save") void saveRequest();
    if (command === "help") setError("Open a directory or paste a request. Use ⌘1/⌘2 to switch views and ⌘S to save.");
  }, [closeWorkspace, openDirectory, saveRequest]);

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
      else if (event.key.toLowerCase() === "s") { event.preventDefault(); handleCommand("save"); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleCommand]);

  const openFile = async (path: string) => {
    if (!confirmDiscard()) return;
    try {
      const file = await invoke<WorkspaceFile>("read_workspace_file", { path });
      if (path.endsWith(".json")) loadRequest(file.content, file);
      else {
        setCurrentFile(file);
        setTab("response");
        setError("");
      }
    } catch (reason) { setError(String(reason)); }
  };

  const createEntry = async (parent: string, name: string, kind: "file" | "directory") => {
    setWorkspace(await invoke("create_workspace_entry", { parent, name, kind }));
  };
  const renameEntry = async (path: string, newName: string) => {
    setWorkspace(await invoke("rename_workspace_entry", { path, newName }));
    const renamed = `${path.split("/").slice(0, -1).join("/")}${path.includes("/") ? "/" : ""}${newName}`;
    if (requestDoc?.path === path) setRequestDoc({ ...requestDoc, path: renamed, name: newName });
    if (currentFile?.path === path) setCurrentFile({ ...currentFile, path: renamed, name: newName });
  };
  const deleteEntry = async (path: string) => {
    if (requestDoc?.path && (requestDoc.path === path || requestDoc.path.startsWith(`${path}/`)) && !confirmDiscard()) return;
    setWorkspace(await invoke("delete_workspace_entry", { path }));
    if (requestDoc?.path && (requestDoc.path === path || requestDoc.path.startsWith(`${path}/`))) { setRequest(null); setRequestDoc(null); }
    if (currentFile && (currentFile.path === path || currentFile.path.startsWith(`${path}/`))) setCurrentFile(null);
  };

  const updateRequest = (next: ChatRequest) => {
    setRequest(next);
    if (requestDoc) setRequestDoc({ ...requestDoc, source: formatRequest(next) });
  };
  const updateSource = (source: string) => {
    if (!requestDoc) return;
    setRequestDoc({ ...requestDoc, source });
    try { setRequest(parseChatRequest(source)); } catch { /* Keep the last valid structured request while editing. */ }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand"><span className="brand-mark"><Braces size={19} /></span><span>Prompt Editor</span><span className="version">BETA</span></div>
        <div className="header-actions">
          <button className="button button-secondary" type="button" onClick={() => void openDirectory()}><FolderOpen size={16} /> Open directory</button>
          <button className="button button-primary" type="button" disabled={!request || Boolean(sourceError)}><Send size={15} /> Send request</button>
        </div>
      </header>

      {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError("")}><X size={14} /></button></div>}
      <div className="workspace-layout">
        <aside className={`sidebar ${sidebarOpen ? "is-open" : "is-collapsed"}`} aria-label="Workspace sidebar">
          <div className="sidebar-heading">
            {sidebarOpen && <span>WORKSPACE</span>}
            <button className="icon-button" type="button" aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"} title="Toggle sidebar (⌘B)" onClick={() => setSidebarOpen((value) => !value)}>{sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</button>
          </div>
          {sidebarOpen ? <WorkspaceSidebar workspace={workspace} currentPath={requestDoc?.path ?? currentFile?.path} onOpenDirectory={() => void openDirectory()} onOpenFile={(path) => void openFile(path)} onCreate={createEntry} onRename={renameEntry} onDelete={deleteEntry} onRefresh={async () => { if (workspace) setWorkspace(await invoke("list_workspace")); }} /> : <button className="collapsed-action" type="button" aria-label="Open directory" title="Open directory" onClick={() => void openDirectory()}><FolderOpen size={18} /></button>}
        </aside>

        <main className="main-panel">
          <div className="main-toolbar">
            <nav className="tabs" aria-label="Editor sections">
              <button className={tab === "request" ? "tab active" : "tab"} onClick={() => setTab("request")} type="button">Request{requestDoc?.name ? ` · ${requestDoc.name}` : ""}{dirty && <span className="tab-dirty" />}</button>
              <button className={tab === "response" ? "tab active" : "tab"} onClick={() => setTab("response")} type="button">Response</button>
            </nav>
            <span className="shortcut-hint">⌘1 / ⌘2</span>
          </div>

          {tab === "request" && request && requestDoc ? <RequestEditor request={request} source={requestDoc.source} sourceError={sourceError} dirty={dirty} filePath={requestDoc.path} onChange={updateRequest} onSourceChange={updateSource} onSave={() => void saveRequest()} /> : currentFile ? <section className="file-preview">
            <div className="file-preview-heading"><div><span className="eyebrow">{currentFile.name.endsWith(".sse") ? "SSE STREAM" : "JSON DOCUMENT"}</span><h1>{currentFile.name}</h1><p>{currentFile.path}</p></div><button className="icon-button" title="Close file" aria-label="Close file" onClick={() => setCurrentFile(null)}><X size={17} /></button></div>
            <pre>{currentFile.content || "(empty file)"}</pre>
          </section> : <section className="empty-state">
            <div className="empty-illustration">{tab === "request" ? <Sparkles size={30} strokeWidth={1.5} /> : <Inbox size={30} strokeWidth={1.5} />}</div>
            <h1>{tab === "request" ? "Shape a better prompt" : "Inspect every detail"}</h1>
            <p>{tab === "request" ? "Paste an OpenAI chat completion request, or open a JSON file from your workspace." : "Run a request or import a JSON / SSE response to see its rendered content."}</p>
            <button className="button button-secondary" type="button" onClick={() => { if (tab === "request") { setPasteText(""); setError(""); setPasteOpen(true); } }}><Clipboard size={15} />{tab === "request" ? "Paste request" : "Import response"}</button>
          </section>}
        </main>
      </div>

      {pasteOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPasteOpen(false); }}>
        <form className="dialog paste-dialog" onSubmit={(event) => { event.preventDefault(); try { loadRequest(pasteText); setPasteOpen(false); } catch (reason) { setError(String(reason)); } }}>
          <div className="dialog-title-row"><h2>Paste request JSON</h2><button type="button" className="icon-button" aria-label="Close paste dialog" onClick={() => setPasteOpen(false)}><X size={16} /></button></div>
          <p>Paste a complete OpenAI Chat Completions request, including its messages array.</p>
          <textarea autoFocus value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder={'{"model":"gpt-4o","messages":[...]}'} spellCheck={false} />
          {error && <p className="field-error">{error}</p>}
          <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setPasteOpen(false)}>Cancel</button><button className="button button-primary" disabled={!pasteText.trim()}><ChevronRight size={14} /> Open request</button></div>
        </form>
      </div>}
    </div>
  );
}
