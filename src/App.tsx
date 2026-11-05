import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Braces, ChevronRight, Clipboard, FolderOpen, PanelLeftClose, PanelLeftOpen, Send, Settings2, Sparkles, Square, X } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { Channel, invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { WorkspaceSidebar } from "./components/workspace/WorkspaceSidebar";
import { RequestEditor } from "./components/request/RequestEditor";
import { ResponseViewer } from "./components/response/ResponseViewer";
import { ApiSettings } from "./components/settings/ApiSettings";
import { DocumentTabs } from "./components/tabs/DocumentTabs";
import type { WorkspaceFile, WorkspaceNode, WorkspaceSnapshot } from "./lib/workspace";
import { isWithin, parentDirectory, relativeToRoot } from "./lib/workspace";
import type { ChatRequest } from "./lib/openai";
import { isRecord, parseChatRequest, parseCompletionJson } from "./lib/openai";
import { CompletionSseParser, parseCompletionSse } from "./lib/sse";
import { extractJsonBody, extractSseBody } from "./lib/document";
import { formatRequest } from "./lib/request";
import { type AppConfig, clampSidebarWidth, loadConfig, saveConfig } from "./lib/config";
import { isDirty, type DocumentTab } from "./lib/tabs";

interface SavedFile { path: string | null; fullPath: string; name: string }

export default function App() {
  const [tabs, setTabs] = useState<DocumentTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [error, setError] = useState("");
  const [config, setConfig] = useState<AppConfig>(loadConfig);
  const [sidebarWidth, setSidebarWidth] = useState(config.sidebarWidth);
  const [resizingSidebar, setResizingSidebar] = useState(false);
  const [apiToken, setApiToken] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const activeRequestId = useRef<string | null>(null);
  const sendingRef = useRef(false);
  const requestGeneration = useRef(0);
  const apiUrl = config.apiUrl;
  const preambleScanLines = config.preambleScanLines;
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const activeRequest = activeTab?.kind === "request" ? activeTab : null;
  let sourceError = "";
  if (activeRequest) {
    try { parseChatRequest(activeRequest.source); } catch (reason) { sourceError = reason instanceof Error ? reason.message : String(reason); }
  }

  const confirmDiscard = useCallback((scoped?: DocumentTab[]) => {
    const dirtyTabs = (scoped ?? tabs).filter(isDirty);
    if (dirtyTabs.length === 0) return true;
    return window.confirm(dirtyTabs.length === 1 ? "Discard unsaved request changes?" : `Discard unsaved changes in ${dirtyTabs.length} request tabs?`);
  }, [tabs]);

  const abortActive = useCallback(() => {
    requestGeneration.current += 1;
    const requestId = activeRequestId.current;
    activeRequestId.current = null;
    if (requestId) void invoke("cancel_chat_completion", { requestId });
    sendingRef.current = false;
    setSending(false);
  }, []);

  const addTab = useCallback((tab: DocumentTab) => {
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
  }, []);

  const loadRequest = useCallback((raw: string, file?: WorkspaceFile) => {
    const source = extractJsonBody(raw, preambleScanLines);
    const request = parseChatRequest(source);
    addTab({ id: crypto.randomUUID(), kind: "request", name: file?.name ?? "Pasted request", path: file?.path, fullPath: file?.fullPath, request, source, savedSource: source });
    setError("");
  }, [addTab, preambleScanLines]);

  const loadResponse = useCallback((raw: string, file?: WorkspaceFile) => {
    const isSse = file?.name.endsWith(".sse") || /^(data|event|id|):/m.test(raw);
    const response = isSse
      ? parseCompletionSse(extractSseBody(raw, preambleScanLines))
      : parseCompletionJson(extractJsonBody(raw, preambleScanLines));
    addTab({ id: crypto.randomUUID(), kind: "response", name: file?.name ?? "Pasted response", path: file?.path, fullPath: file?.fullPath, response, temporary: !file, streaming: false });
    setError("");
  }, [addTab, preambleScanLines]);

  const updateRequest = (id: string, next: ChatRequest) => {
    setTabs((current) => current.map((tab) => tab.id === id && tab.kind === "request" ? { ...tab, request: next, source: formatRequest(next) } : tab));
  };

  const updateSource = (id: string, source: string) => {
    setTabs((current) => current.map((tab) => {
      if (tab.id !== id || tab.kind !== "request") return tab;
      try { return { ...tab, source, request: parseChatRequest(source) }; } catch { return { ...tab, source }; }
    }));
  };

  const saveRequest = useCallback(async (id: string) => {
    const tab = tabs.find((item) => item.id === id);
    if (!tab || tab.kind !== "request" || !tab.path || tab.source === tab.savedSource) return;
    try { parseChatRequest(tab.source); } catch { return; }
    try {
      const formatted = formatRequest(tab.request);
      await invoke("write_request_file", { path: tab.path, content: formatted });
      setTabs((current) => current.map((item) => item.id === id && item.kind === "request" ? { ...item, source: formatted, savedSource: formatted } : item));
      setError("");
    } catch (reason) { setError(String(reason)); }
  }, [tabs]);

  const saveResponseFile = useCallback(async (id: string) => {
    const tab = tabs.find((item) => item.id === id);
    if (!tab || tab.kind !== "response") return;
    const extension = tab.response.source === "sse" ? "sse" : "json";
    const defaultPath = workspace ? `${workspace.root}/response.${extension}` : `response.${extension}`;
    let target: string | null;
    try {
      target = await save({ title: "Save response", defaultPath, filters: [{ name: "JSON", extensions: ["json"] }, { name: "SSE", extensions: ["sse"] }] });
    } catch (reason) { setError(String(reason)); return; }
    if (!target) return;
    try {
      const saved = await invoke<SavedFile>("save_response_file", { path: target, content: tab.response.raw });
      setTabs((current) => current.map((item) => item.id === id && item.kind === "response" ? { ...item, name: saved.name, path: saved.path ?? undefined, fullPath: saved.fullPath, temporary: false } : item));
      if (workspace) setWorkspace(await invoke<WorkspaceSnapshot>("list_workspace"));
      setError("");
    } catch (reason) { setError(String(reason)); }
  }, [tabs, workspace]);

  const sendRequest = useCallback(async () => {
    const tab = tabs.find((item) => item.id === activeTabId);
    if (!tab || tab.kind !== "request" || sendingRef.current) return;
    if (!apiUrl.trim()) { setSettingsOpen(true); return; }
    try { parseChatRequest(tab.source); } catch { return; }
    const requestId = crypto.randomUUID();
    const responseTabId = crypto.randomUUID();
    const generation = ++requestGeneration.current;
    sendingRef.current = true;
    activeRequestId.current = requestId;
    const parser = new CompletionSseParser();
    const channel = new Channel<string>();
    let networkRaw = "";
    setSending(true);
    setTabs((current) => [...current, { id: responseTabId, kind: "response", name: "Response", response: parser.snapshot(), temporary: true, streaming: true }]);
    setActiveTabId(responseTabId);
    setError("");
    channel.onmessage = (chunk) => {
      if (generation !== requestGeneration.current) return;
      networkRaw += chunk;
      parser.feed(chunk);
      setTabs((current) => current.map((item) => item.id === responseTabId && item.kind === "response" ? { ...item, response: parser.snapshot() } : item));
    };
    try {
      const completion = await invoke<{ format: "json" | "sse" }>("send_chat_completion", {
        requestId,
        url: apiUrl.trim(),
        token: apiToken,
        payload: tab.request,
        stream: config.stream,
        channel,
      });
      if (generation !== requestGeneration.current) return;
      const response = completion.format === "json" ? parseCompletionJson(networkRaw) : parser.finish();
      setTabs((current) => current.map((item) => item.id === responseTabId && item.kind === "response" ? { ...item, response, streaming: false } : item));
    } catch (reason) {
      if (generation !== requestGeneration.current) return;
      setTabs((current) => current.map((item) => item.id === responseTabId && item.kind === "response" ? { ...item, response: parser.finish(), streaming: false } : item));
      const message = String(reason);
      if (!/cancel/i.test(message)) setError(message);
    } finally {
      if (generation === requestGeneration.current) {
        sendingRef.current = false;
        setSending(false);
        activeRequestId.current = null;
      }
    }
  }, [activeTabId, apiToken, apiUrl, config.stream, tabs]);

  const cancelRequest = useCallback(async () => {
    if (activeRequestId.current) await invoke("cancel_chat_completion", { requestId: activeRequestId.current });
  }, []);

  const closeTabIds = useCallback((ids: Set<string>, prompt = true) => {
    const closing = tabs.filter((tab) => ids.has(tab.id));
    if (closing.length === 0) return;
    if (prompt && !confirmDiscard(closing)) return;
    if (closing.some((tab) => tab.kind === "response" && tab.streaming)) abortActive();
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId);
    if (activeTabId && ids.has(activeTabId)) {
      const right = tabs.slice(currentIndex + 1).find((tab) => !ids.has(tab.id));
      const left = [...tabs.slice(0, currentIndex)].reverse().find((tab) => !ids.has(tab.id));
      setActiveTabId((right ?? left)?.id ?? null);
    }
    setTabs(tabs.filter((tab) => !ids.has(tab.id)));
  }, [abortActive, activeTabId, confirmDiscard, tabs]);

  const cycleTab = useCallback((delta: number) => {
    if (tabs.length === 0) return;
    const index = tabs.findIndex((tab) => tab.id === activeTabId);
    if (index < 0) {
      setActiveTabId((delta > 0 ? tabs[0] : tabs[tabs.length - 1]).id);
      return;
    }
    setActiveTabId(tabs[(index + delta + tabs.length) % tabs.length].id);
  }, [activeTabId, tabs]);

  const recordRecent = useCallback((path: string, kind: "file" | "directory") => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    void invoke("record_recent", { path, kind }).catch(() => {});
  }, []);

  const openWorkspaceAt = useCallback(async (root: string) => {
    if (!confirmDiscard()) return null;
    try {
      abortActive();
      const snapshot = await invoke<WorkspaceSnapshot>("open_workspace", { root });
      setWorkspace(snapshot);
      setTabs([]);
      setActiveTabId(null);
      setSidebarOpen(true);
      setError("");
      return snapshot;
    } catch (reason) { setError(String(reason)); return null; }
  }, [abortActive, confirmDiscard]);

  const openDirectory = useCallback(async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: "Open prompt workspace" });
      if (!selected) return;
      const snapshot = await openWorkspaceAt(selected);
      if (snapshot) recordRecent(snapshot.root, "directory");
    } catch (reason) { setError(String(reason)); }
  }, [openWorkspaceAt, recordRecent]);

  const closeWorkspace = useCallback(async () => {
    if (!confirmDiscard()) return;
    abortActive();
    await invoke("close_workspace");
    setWorkspace(null);
    setTabs([]);
    setActiveTabId(null);
  }, [abortActive, confirmDiscard]);

  const loadWorkspaceFile = useCallback(async (path: string) => {
    const file = await invoke<WorkspaceFile>("read_workspace_file", { path });
    if (path.toLowerCase().endsWith(".json")) {
      const body = extractJsonBody(file.content, preambleScanLines);
      const value: unknown = JSON.parse(body);
      if (isRecord(value) && Array.isArray(value.messages)) loadRequest(body, file);
      else loadResponse(body, file);
    } else loadResponse(file.content, file);
    return file;
  }, [loadRequest, loadResponse, preambleScanLines]);

  const openFile = useCallback(async (path: string) => {
    const existing = tabs.find((tab) => tab.path === path);
    if (existing) { setActiveTabId(existing.id); return; }
    try {
      const file = await loadWorkspaceFile(path);
      recordRecent(file.fullPath, "file");
    } catch (reason) { setError(String(reason)); }
  }, [loadWorkspaceFile, recordRecent, tabs]);

  const openRecentFile = useCallback(async (fullPath: string) => {
    const existing = tabs.find((tab) => tab.fullPath === fullPath);
    if (existing) { setActiveTabId(existing.id); return; }
    try {
      let relative: string;
      if (workspace && isWithin(workspace.root, fullPath)) {
        relative = relativeToRoot(workspace.root, fullPath);
      } else {
        const root = parentDirectory(fullPath);
        const snapshot = await openWorkspaceAt(root);
        if (!snapshot) return;
        relative = relativeToRoot(root, fullPath);
      }
      await loadWorkspaceFile(relative);
      recordRecent(fullPath, "file");
    } catch (reason) { setError(String(reason)); }
  }, [loadWorkspaceFile, openWorkspaceAt, recordRecent, tabs, workspace]);

  const openRecentDirectory = useCallback(async (path: string) => {
    const snapshot = await openWorkspaceAt(path);
    if (snapshot) recordRecent(snapshot.root, "directory");
  }, [openWorkspaceAt, recordRecent]);

  const handleCommand = useCallback((command: string) => {
    if (command.startsWith("recent-file:")) { void openRecentFile(command.slice("recent-file:".length)); return; }
    if (command.startsWith("recent-directory:")) { void openRecentDirectory(command.slice("recent-directory:".length)); return; }
    if (command === "clear-recent") {
      void invoke("clear_recent").catch((reason) => setError(String(reason)));
      return;
    }
    if (command === "toggle-sidebar") setSidebarOpen((value) => !value);
    if (command === "next-tab") cycleTab(1);
    if (command === "previous-tab") cycleTab(-1);
    if (command === "open-directory") void openDirectory();
    if (command === "close-workspace") void closeWorkspace();
    if (command === "save" && activeTab?.kind === "request") void saveRequest(activeTab.id);
    if (command === "help") setError("Open a directory or paste a request. Use ⌘1–9 to switch tabs, Ctrl+Tab to cycle, and ⌘S to save.");
  }, [activeTab, closeWorkspace, cycleTab, openDirectory, openRecentDirectory, openRecentFile, saveRequest]);

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
      if (event.ctrlKey && event.key === "Tab") {
        event.preventDefault();
        handleCommand(event.shiftKey ? "previous-tab" : "next-tab");
        return;
      }
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === "b") { event.preventDefault(); handleCommand("toggle-sidebar"); }
      else if (/^[1-9]$/.test(event.key)) { const target = tabs[Number(event.key) - 1]; if (target) { event.preventDefault(); setActiveTabId(target.id); } }
      else if (event.key.toLowerCase() === "o") { event.preventDefault(); handleCommand("open-directory"); }
      else if (event.key.toLowerCase() === "s") { event.preventDefault(); handleCommand("save"); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleCommand, tabs]);

  useEffect(() => () => { requestGeneration.current += 1; }, []);

  const openPasted = () => {
    try {
      const raw = pasteText;
      if (/^(data|event|id|):/m.test(raw)) loadResponse(raw);
      else {
        const body = extractJsonBody(raw, preambleScanLines);
        const value: unknown = JSON.parse(body);
        if (isRecord(value) && Array.isArray(value.messages)) loadRequest(body);
        else loadResponse(body);
      }
      setPasteOpen(false);
    } catch (reason) { setError(String(reason)); }
  };

  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
    } catch (reason) { setError(String(reason)); }
  };

  const copyTabPath = async (tab: DocumentTab) => {
    const value = tab.fullPath ?? tab.path;
    if (value) await copyPath(value);
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
    const snapshot = await invoke<WorkspaceSnapshot>("rename_workspace_entry", { path, newName });
    setWorkspace(snapshot);
    const renamedPath = `${path.split("/").slice(0, -1).join("/")}${path.includes("/") ? "/" : ""}${newName}`;
    const fullPaths = new Map<string, string>();
    const walk = (nodes: WorkspaceNode[]) => {
      for (const node of nodes) {
        if (node.kind === "file") fullPaths.set(node.path, node.fullPath);
        walk(node.children);
      }
    };
    walk(snapshot.tree);
    setTabs((current) => current.map((tab) => {
      if (!tab.path || (tab.path !== path && !tab.path.startsWith(`${path}/`))) return tab;
      const nextPath = `${renamedPath}${tab.path.slice(path.length)}`;
      return { ...tab, path: nextPath, fullPath: fullPaths.get(nextPath) ?? tab.fullPath, name: tab.path === path ? newName : tab.name };
    }));
  };
  const deleteEntry = async (path: string) => {
    const affected = tabs.filter((tab) => tab.path && (tab.path === path || tab.path.startsWith(`${path}/`)));
    if (affected.length > 0 && !confirmDiscard(affected)) return;
    const snapshot = await invoke<WorkspaceSnapshot>("delete_workspace_entry", { path });
    setWorkspace(snapshot);
    if (affected.length > 0) closeTabIds(new Set(affected.map((tab) => tab.id)), false);
  };

  const openPasteDialog = () => {
    setPasteText("");
    setError("");
    setPasteOpen(true);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand"><span className="brand-mark"><Braces size={19} /></span><span>Prompt Debugger</span><span className="version">BETA</span></div>
        <div className="header-actions">
          <button className="button button-secondary" type="button" onClick={() => void openDirectory()}><FolderOpen size={16} /> Open directory</button>
          <button className="button button-secondary" type="button" onClick={openPasteDialog}><Clipboard size={15} /> Paste</button>
          <button className="icon-button header-settings" type="button" aria-label="Settings" title="Settings" onClick={() => setSettingsOpen(true)}><Settings2 size={17} /></button>
          <button className={`button ${sending ? "button-danger" : "button-primary"}`} type="button" disabled={!sending && (!activeRequest || Boolean(sourceError))} onClick={() => sending ? void cancelRequest() : void sendRequest()}>{sending ? <Square size={13} /> : <Send size={15} />} {sending ? "Cancel" : "Send request"}</button>
        </div>
      </header>

      {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError("")}><X size={14} /></button></div>}
      <div className="workspace-layout">
        <aside className={`sidebar ${sidebarOpen ? "is-open" : "is-collapsed"} ${resizingSidebar ? "is-resizing" : ""}`} style={sidebarOpen ? { width: sidebarWidth } : undefined} aria-label="Workspace sidebar">
          <div className="sidebar-heading">
            {sidebarOpen && <span>WORKSPACE</span>}
            <button className="icon-button" type="button" aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"} title="Toggle sidebar (⌘B)" onClick={() => setSidebarOpen((value) => !value)}>{sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</button>
          </div>
          {sidebarOpen ? <WorkspaceSidebar workspace={workspace} currentPath={activeTab?.path} onOpenDirectory={() => void openDirectory()} onOpenFile={(path) => void openFile(path)} onCreate={createEntry} onRename={renameEntry} onDelete={deleteEntry} onCopyPath={copyPath} onRefresh={async () => { if (workspace) setWorkspace(await invoke("list_workspace")); }} /> : <button className="collapsed-action" type="button" aria-label="Open directory" title="Open directory" onClick={() => void openDirectory()}><FolderOpen size={18} /></button>}
          {sidebarOpen && <div className="sidebar-resizer" role="separator" aria-label="Resize workspace sidebar" aria-orientation="vertical" tabIndex={0} title="Drag to resize" onPointerDown={startSidebarResize} onKeyDown={resizeSidebarByKeyboard} />}
        </aside>

        <main className="main-panel">
          <DocumentTabs
            tabs={tabs}
            activeId={activeTabId}
            onSelect={setActiveTabId}
            onNewTab={openPasteDialog}
            onClose={(id) => closeTabIds(new Set([id]))}
            onCloseAll={() => closeTabIds(new Set(tabs.map((tab) => tab.id)))}
            onCloseOthers={(id) => closeTabIds(new Set(tabs.filter((tab) => tab.id !== id).map((tab) => tab.id)))}
            onCloseToRight={(id) => {
              const index = tabs.findIndex((tab) => tab.id === id);
              if (index >= 0) closeTabIds(new Set(tabs.slice(index + 1).map((tab) => tab.id)));
            }}
            onCopyPath={(tab) => void copyTabPath(tab)}
            onSave={(id) => void saveResponseFile(id)}
          />
          {activeTab ? <>
            <div className="document-bar">
              <span className={`document-kind-label ${activeTab.kind}`}>{activeTab.kind === "request" ? "Request" : "Response"}</span>
              <span className="document-bar-path" title={activeTab.fullPath}>{activeTab.fullPath ?? (activeTab.kind === "response" && activeTab.temporary ? "Unsaved response" : "Not saved to a file")}</span>
            </div>
            {activeTab.kind === "request"
              ? <RequestEditor key={activeTab.id} request={activeTab.request} source={activeTab.source} sourceError={sourceError} dirty={isDirty(activeTab)} filePath={activeTab.path} name={activeTab.name} onChange={(next) => updateRequest(activeTab.id, next)} onSourceChange={(source) => updateSource(activeTab.id, source)} onSave={() => void saveRequest(activeTab.id)} />
              : <ResponseViewer key={activeTab.id} response={activeTab.response} name={activeTab.name} streaming={activeTab.streaming} onSave={activeTab.temporary ? () => void saveResponseFile(activeTab.id) : undefined} />}
          </> : <section className="empty-state">
            <div className="empty-illustration"><Sparkles size={30} strokeWidth={1.5} /></div>
            <h1>Open a prompt or response</h1>
            <p>Open a JSON / SSE file from your workspace, or paste a request or response to start a new tab.</p>
            <div className="empty-actions">
              <button className="button button-secondary" type="button" onClick={openPasteDialog}><Clipboard size={15} />Paste request or response</button>
              <button className="button button-secondary" type="button" onClick={() => void openDirectory()}><FolderOpen size={15} />Choose directory</button>
            </div>
          </section>}
        </main>
      </div>

      {settingsOpen && <ApiSettings
        url={apiUrl}
        token={apiToken}
        preambleScanLines={preambleScanLines}
        stream={config.stream}
        onUrlChange={(url) => setConfig((current) => ({ ...current, apiUrl: url }))}
        onTokenChange={setApiToken}
        onPreambleScanLinesChange={(lines) => setConfig((current) => ({ ...current, preambleScanLines: lines }))}
        onStreamChange={(stream) => setConfig((current) => ({ ...current, stream }))}
        onClose={() => setSettingsOpen(false)}
      />}
      {pasteOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPasteOpen(false); }}>
        <form className="dialog paste-dialog" onSubmit={(event) => { event.preventDefault(); openPasted(); }}>
          <div className="dialog-title-row"><h2>Import request or response</h2><button type="button" className="icon-button" aria-label="Close paste dialog" onClick={() => setPasteOpen(false)}><X size={16} /></button></div>
          <p>Paste an OpenAI Chat Completions request, a JSON response, or an SSE event stream. The document type is detected automatically.</p>
          <textarea autoFocus value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder='{"messages":[...]} or data: {...}' spellCheck={false} />
          {error && <p className="field-error">{error}</p>}
          <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setPasteOpen(false)}>Cancel</button><button className="button button-primary" disabled={!pasteText.trim()}><ChevronRight size={14} /> Open</button></div>
        </form>
      </div>}
    </div>
  );
}
