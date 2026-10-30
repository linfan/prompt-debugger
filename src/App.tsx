import { useCallback, useEffect, useState } from "react";
import {
  Braces,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Inbox,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  Sparkles,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";

type Tab = "request" | "response";

export default function App() {
  const [tab, setTab] = useState<Tab>("request");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleCommand = useCallback((command: string) => {
    if (command === "toggle-sidebar") setSidebarOpen((open) => !open);
    if (command === "show-request") setTab("request");
    if (command === "show-response") setTab("response");
  }, []);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const unlisten = listen<string>("native-menu", (event) => handleCommand(event.payload));
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, [handleCommand]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === "b") {
        event.preventDefault();
        handleCommand("toggle-sidebar");
      } else if (event.key === "1") {
        event.preventDefault();
        handleCommand("show-request");
      } else if (event.key === "2") {
        event.preventDefault();
        handleCommand("show-response");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleCommand]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark"><Braces size={19} /></span>
          <span>Prompt Editor</span>
          <span className="version">BETA</span>
        </div>
        <div className="header-actions">
          <button className="button button-secondary" type="button">
            <FolderOpen size={16} /> Open directory
          </button>
          <button className="button button-primary" type="button" disabled>
            <Send size={15} /> Send request
          </button>
        </div>
      </header>

      <div className="workspace-layout">
        <aside className={`sidebar ${sidebarOpen ? "is-open" : "is-collapsed"}`} aria-label="Workspace sidebar">
          <div className="sidebar-heading">
            {sidebarOpen && <span>WORKSPACE</span>}
            <button
              className="icon-button"
              type="button"
              aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              title="Toggle sidebar (⌘B)"
              onClick={() => setSidebarOpen((open) => !open)}
            >
              {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
            </button>
          </div>
          {sidebarOpen ? (
            <div className="sidebar-empty">
              <FolderOpen size={26} strokeWidth={1.5} />
              <strong>No directory open</strong>
              <p>Open a directory to browse JSON and SSE files.</p>
              <button className="button button-quiet" type="button">Choose directory</button>
            </div>
          ) : (
            <button className="collapsed-action" type="button" aria-label="Open directory" title="Open directory">
              <FolderOpen size={18} />
            </button>
          )}
          {sidebarOpen && <div className="sidebar-footer">JSON · SSE</div>}
        </aside>

        <main className="main-panel">
          <div className="main-toolbar">
            <nav className="tabs" aria-label="Editor sections">
              <button className={tab === "request" ? "tab active" : "tab"} onClick={() => setTab("request")} type="button">
                Request
              </button>
              <button className={tab === "response" ? "tab active" : "tab"} onClick={() => setTab("response")} type="button">
                Response
              </button>
            </nav>
            <span className="shortcut-hint">⌘1 / ⌘2</span>
          </div>

          <section className="empty-state">
            <div className="empty-illustration">
              {tab === "request" ? <Sparkles size={30} strokeWidth={1.5} /> : <Inbox size={30} strokeWidth={1.5} />}
            </div>
            <h1>{tab === "request" ? "Shape a better prompt" : "Inspect every detail"}</h1>
            <p>
              {tab === "request"
                ? "Paste an OpenAI chat completion request, or open a JSON file from your workspace."
                : "Run a request or import a JSON / SSE response to see its rendered content."}
            </p>
            <button className="button button-secondary" type="button">
              {tab === "request" ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              {tab === "request" ? "Paste request" : "Import response"}
            </button>
          </section>
        </main>
      </div>
    </div>
  );
}
