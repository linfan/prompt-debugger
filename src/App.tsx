import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Braces, ChevronRight, Clipboard, FolderOpen, Inbox, PanelLeftClose, PanelLeftOpen, Send, Settings2, Sparkles, Square, X } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { Channel, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { WorkspaceSidebar } from "./components/workspace/WorkspaceSidebar";
import { RequestEditor } from "./components/request/RequestEditor";
import { ResponseViewer } from "./components/response/ResponseViewer";
import { ApiSettings } from "./components/settings/ApiSettings";
import type { WorkspaceFile, WorkspaceSnapshot } from "./lib/workspace";
import { type ChatRequest, isRecord, parseChatRequest, parseCompletionJson } from "./lib/openai";
import { CompletionSseParser, parseCompletionSse } from "./lib/sse";
import { extractJsonBody, extractSseBody } from "./lib/document";
import { formatRequest } from "./lib/request";
import { type AppConfig, clampSidebarWidth, loadConfig, saveConfig } from "./lib/config";

type Tab = "request" | "response";
interface RequestDocument { source: string; savedSource: string; path?: string; name?: string }
interface ResponseDocument { response: import("./lib/openai").ResponseAggregate; path?: string; name?: string }

export default function App() {
  const [tab, setTab] = useState<Tab>("request");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [currentFile, setCurrentFile] = useState<WorkspaceFile | null>(null);
  const [request, setRequest] = useState<ChatRequest | null>(null);
  const [requestDoc, setRequestDoc] = useState<RequestDocument | null>(null);
  const [responseDoc, setResponseDoc] = useState<ResponseDocument | null>(null);
  const [pasteTarget, setPasteTarget] = useState<Tab | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [error, setError] = useState("");
  const [config, setConfig] = useState<AppConfig>(loadConfig);
  const [sidebarWidth, setSidebarWidth] = useState(config.sidebarWidth);
  const [resizingSidebar, setResizingSidebar] = useState(false);
  const [apiToken, setApiToken] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const activeRequestId = useRef<string | null>(null);
  const requestGeneration = useRef(0);
  const apiUrl = config.apiUrl;
  const preambleScanLines = config.preambleScanLines;
  const dirty = Boolean(requestDoc && requestDoc.source !== requestDoc.savedSource);
  let sourceError = "";
  if (requestDoc) {
    try { parseChatRequest(requestDoc.source); } catch (reason) { sourceError = reason instanceof Error ? reason.message : String(reason); }
  }

  const confirmDiscard = useCallback(() => !dirty || window.confirm("Discard unsaved request changes?"), [dirty]);

  const loadRequest = useCallback((raw: string, file?: WorkspaceFile) => {
    const source = extractJsonBody(raw, preambleScanLines);
    const parsed = parseChatRequest(source);
    setRequest(parsed);
    setRequestDoc({ source, savedSource: source, path: file?.path, name: file?.name });
    setCurrentFile(null);
    setTab("request");
    setError("");
  }, [preambleScanLines]);

  const loadResponse = useCallback((raw: string, file?: WorkspaceFile) => {
    const isSse = file?.name.endsWith(".sse") || /^(data|event|id|):/m.test(raw);
    const response = isSse
      ? parseCompletionSse(extractSseBody(raw, preambleScanLines))
      : parseCompletionJson(extractJsonBody(raw, preambleScanLines));
    setResponseDoc({ response, path: file?.path, name: file?.name });
    setCurrentFile(null);
    setTab("response");
    setError("");
  }, [preambleScanLines]);

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
      setResponseDoc(null);
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
    setResponseDoc(null);
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

  const sendRequest = useCallback(async () => {
    if (!request || !requestDoc || sourceError || !apiUrl.trim() || sending) {
      if (!apiUrl.trim()) setSettingsOpen(true);
      return;
    }
    const requestId = crypto.randomUUID();
    const generation = ++requestGeneration.current;
    activeRequestId.current = requestId;
    const parser = new CompletionSseParser();
    const channel = new Channel<string>();
    let networkRaw = "";
    setSending(true);
    setTab("response");
    setResponseDoc({ response: parser.snapshot(), name: "Live response" });
    setError("");
    channel.onmessage = (chunk) => {
      if (generation !== requestGeneration.current) return;
      networkRaw += chunk;
      parser.feed(chunk);
      setResponseDoc({ response: parser.snapshot(), name: "Live response" });
    };
    try {
      const completion = await invoke<{ format: "json" | "sse" }>("send_chat_completion", {
        requestId,
        url: apiUrl.trim(),
        token: apiToken,
        payload: request,
        channel,
      });
      if (generation !== requestGeneration.current) return;
      const response = completion.format === "json" ? parseCompletionJson(networkRaw) : parser.finish();
      setResponseDoc({ response, name: "Live response" });
    } catch (reason) {
      if (generation !== requestGeneration.current) return;
      setResponseDoc({ response: parser.finish(), name: "Live response" });
      setError(String(reason));
    } finally {
      if (generation === requestGeneration.current) {
        setSending(false);
        activeRequestId.current = null;
      }
    }
  }, [apiToken, apiUrl, request, requestDoc, sending, sourceError]);

  const cancelRequest = useCallback(async () => {
    if (activeRequestId.current) await invoke("cancel_chat_completion", { requestId: activeRequestId.current });
  }, []);

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
    saveConfig(config);
  }, [config]);

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
      if (path.endsWith(".json")) {
        const body = extractJsonBody(file.content, preambleScanLines);
        const value: unknown = JSON.parse(body);
        if (isRecord(value) && Array.isArray(value.messages)) loadRequest(body, file);
        else loadResponse(body, file);
      } else loadResponse(file.content, file);
    } catch (reason) { setError(String(reason)); }
  };

  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
    } catch (reason) { setError(String(reason)); }
  };

  const startSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    let latest = startWidth;
    const move = (moveEvent: PointerEvent) => {
      latest = clampSidebarWidth(startWidth + moveEvent.clientX - startX);
      setSidebarWidth(latest);
    };
    const stop = () => {
      setResizingSidebar(false);
      setConfig((current) => ({ ...current, sidebarWidth: latest }));
      document.body.style.removeProperty("user-select");
      document.body.style.removeProperty("cursor");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    setResizingSidebar(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  const resizeSidebarByKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = clampSidebarWidth(sidebarWidth + (event.key === "ArrowRight" ? 16 : -16));
    setSidebarWidth(next);
    setConfig((current) => ({ ...current, sidebarWidth: next }));
  };

  const createEntry = async (parent: string, name: string, kind: "file" | "directory") => {
    setWorkspace(await invoke("create_workspace_entry", { parent, name, kind }));
  };
  const renameEntry = async (path: string, newName: string) => {
    setWorkspace(await invoke("rename_workspace_entry", { path, newName }));
    const renamed = `${path.split("/").slice(0, -1).join("/")}${path.includes("/") ? "/" : ""}${newName}`;
    if (requestDoc?.path === path) setRequestDoc({ ...requestDoc, path: renamed, name: newName });
    if (responseDoc?.path === path) setResponseDoc({ ...responseDoc, path: renamed, name: newName });
    if (currentFile?.path === path) setCurrentFile({ ...currentFile, path: renamed, name: newName });
  };
  const deleteEntry = async (path: string) => {
    if (requestDoc?.path && (requestDoc.path === path || requestDoc.path.startsWith(`${path}/`)) && !confirmDiscard()) return;
    setWorkspace(await invoke("delete_workspace_entry", { path }));
    if (requestDoc?.path && (requestDoc.path === path || requestDoc.path.startsWith(`${path}/`))) { setRequest(null); setRequestDoc(null); }
    if (responseDoc?.path && (responseDoc.path === path || responseDoc.path.startsWith(`${path}/`))) setResponseDoc(null);
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
          <button className="button button-secondary" type="button" disabled={sending} onClick={() => { if (tab === "request" && !confirmDiscard()) return; setPasteText(""); setError(""); setPasteTarget(tab); }}><Clipboard size={15} /> Paste</button>
          <button className="icon-button header-settings" type="button" aria-label="Settings" title="Settings" onClick={() => setSettingsOpen(true)}><Settings2 size={17} /></button>
          <button className={`button ${sending ? "button-danger" : "button-primary"}`} type="button" disabled={!sending && (!request || Boolean(sourceError))} onClick={() => sending ? void cancelRequest() : void sendRequest()}>{sending ? <Square size={13} /> : <Send size={15} />} {sending ? "Cancel" : "Send request"}</button>
        </div>
      </header>

      {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError("")}><X size={14} /></button></div>}
      <div className="workspace-layout">
        <aside className={`sidebar ${sidebarOpen ? "is-open" : "is-collapsed"} ${resizingSidebar ? "is-resizing" : ""}`} style={sidebarOpen ? { width: sidebarWidth } : undefined} aria-label="Workspace sidebar">
          <div className="sidebar-heading">
            {sidebarOpen && <span>WORKSPACE</span>}
            <button className="icon-button" type="button" aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"} title="Toggle sidebar (⌘B)" onClick={() => setSidebarOpen((value) => !value)}>{sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</button>
          </div>
          {sidebarOpen ? <WorkspaceSidebar workspace={workspace} currentPath={(tab === "request" ? requestDoc?.path : responseDoc?.path) ?? currentFile?.path} onOpenDirectory={() => void openDirectory()} onOpenFile={(path) => void openFile(path)} onCreate={createEntry} onRename={renameEntry} onDelete={deleteEntry} onCopyPath={copyPath} onRefresh={async () => { if (workspace) setWorkspace(await invoke("list_workspace")); }} /> : <button className="collapsed-action" type="button" aria-label="Open directory" title="Open directory" onClick={() => void openDirectory()}><FolderOpen size={18} /></button>}
          {sidebarOpen && <div className="sidebar-resizer" role="separator" aria-label="Resize workspace sidebar" aria-orientation="vertical" tabIndex={0} title="Drag to resize" onPointerDown={startSidebarResize} onKeyDown={resizeSidebarByKeyboard} />}
        </aside>

        <main className="main-panel">
          <div className="main-toolbar">
            <nav className="tabs" aria-label="Editor sections">
              <button className={tab === "request" ? "tab active" : "tab"} onClick={() => setTab("request")} type="button">Request{requestDoc?.name ? ` · ${requestDoc.name}` : ""}{dirty && <span className="tab-dirty" />}</button>
              <button className={tab === "response" ? "tab active" : "tab"} onClick={() => setTab("response")} type="button">Response</button>
            </nav>
            <span className="shortcut-hint">⌘1 / ⌘2</span>
          </div>

          {tab === "request" && request && requestDoc ? <RequestEditor request={request} source={requestDoc.source} sourceError={sourceError} dirty={dirty} filePath={requestDoc.path} onChange={updateRequest} onSourceChange={updateSource} onSave={() => void saveRequest()} /> : tab === "response" && responseDoc ? <ResponseViewer response={responseDoc.response} name={responseDoc.name} streaming={sending && responseDoc.name === "Live response"} /> : currentFile ? <section className="file-preview">
            <div className="file-preview-heading"><div><span className="eyebrow">{currentFile.name.endsWith(".sse") ? "SSE STREAM" : "JSON DOCUMENT"}</span><h1>{currentFile.name}</h1><p>{currentFile.path}</p></div><button className="icon-button" title="Close file" aria-label="Close file" onClick={() => setCurrentFile(null)}><X size={17} /></button></div>
            <pre>{currentFile.content || "(empty file)"}</pre>
          </section> : <section className="empty-state">
            <div className="empty-illustration">{tab === "request" ? <Sparkles size={30} strokeWidth={1.5} /> : <Inbox size={30} strokeWidth={1.5} />}</div>
            <h1>{tab === "request" ? "Shape a better prompt" : "Inspect every detail"}</h1>
            <p>{tab === "request" ? "Paste an OpenAI chat completion request, or open a JSON file from your workspace." : "Run a request or import a JSON / SSE response to see its rendered content."}</p>
            <button className="button button-secondary" type="button" onClick={() => { setPasteText(""); setError(""); setPasteTarget(tab); }}><Clipboard size={15} />{tab === "request" ? "Paste request" : "Import response"}</button>
          </section>}
        </main>
      </div>

      {settingsOpen && <ApiSettings
        url={apiUrl}
        token={apiToken}
        preambleScanLines={preambleScanLines}
        onUrlChange={(url) => setConfig((current) => ({ ...current, apiUrl: url }))}
        onTokenChange={setApiToken}
        onPreambleScanLinesChange={(lines) => setConfig((current) => ({ ...current, preambleScanLines: lines }))}
        onClose={() => setSettingsOpen(false)}
      />}
      {pasteTarget && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPasteTarget(null); }}>
        <form className="dialog paste-dialog" onSubmit={(event) => { event.preventDefault(); try { if (pasteTarget === "request") loadRequest(pasteText); else loadResponse(pasteText); setPasteTarget(null); } catch (reason) { setError(String(reason)); } }}>
          <div className="dialog-title-row"><h2>{pasteTarget === "request" ? "Paste request JSON" : "Import response"}</h2><button type="button" className="icon-button" aria-label="Close paste dialog" onClick={() => setPasteTarget(null)}><X size={16} /></button></div>
          <p>{pasteTarget === "request" ? "Paste a complete OpenAI Chat Completions request, including its messages array." : "Paste a complete Chat Completions JSON response or an SSE event stream."}</p>
          <textarea autoFocus value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder={pasteTarget === "request" ? '{"model":"gpt-4o","messages":[...]}' : '{"choices":[...]} or data: {...}'} spellCheck={false} />
          {error && <p className="field-error">{error}</p>}
          <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setPasteTarget(null)}>Cancel</button><button className="button button-primary" disabled={!pasteText.trim()}><ChevronRight size={14} /> {pasteTarget === "request" ? "Open request" : "Open response"}</button></div>
        </form>
      </div>}
    </div>
  );
}
