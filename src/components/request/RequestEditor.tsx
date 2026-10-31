import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  Braces,
  Check,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  Image as ImageIcon,
  Pencil,
  Plus,
  Save,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import type { ChatMessage, ChatRequest, ToolCall } from "../../lib/openai";
import { isRecord, messageImageCount } from "../../lib/openai";
import { messagePreview, reorderMessages, updateMessage } from "../../lib/request";
import { JsonTree } from "../JsonTree";

interface Props {
  request: ChatRequest;
  source: string;
  sourceError?: string;
  dirty: boolean;
  filePath?: string;
  name?: string;
  onChange: (request: ChatRequest) => void;
  onSourceChange: (source: string) => void;
  onSave: () => void;
}

const roles = ["system", "user", "assistant", "tool"];

export function RequestEditor({ request, source, sourceError, dirty, filePath, name, onChange, onSourceChange, onSave }: Props) {
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<"rendered" | "raw">("rendered");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [rawEditing, setRawEditing] = useState(false);
  const [rawDraft, setRawDraft] = useState("");
  const [rawError, setRawError] = useState("");
  const [copied, setCopied] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropGap, setDropGap] = useState<number | null>(null);
  const [dropTop, setDropTop] = useState(0);
  const dragState = useRef<{ from: number; gap: number; startX: number; startY: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const message = request.messages[Math.min(selected, request.messages.length - 1)];

  useEffect(() => {
    if (selected >= request.messages.length) setSelected(Math.max(0, request.messages.length - 1));
  }, [request.messages.length, selected]);

  const updateCurrent = (updater: (message: ChatMessage) => ChatMessage) => {
    if (message) onChange(updateMessage(request, selected, updater));
  };

  const moveMessage = (from: number, gap: number) => {
    const { messages, index } = reorderMessages(request.messages, from, gap);
    if (messages === request.messages) return;
    let nextSelected = selected;
    if (selected === from) nextSelected = index;
    else if (from < selected && selected <= index) nextSelected -= 1;
    else if (index <= selected && selected < from) nextSelected += 1;
    setSelected(nextSelected);
    setRawEditing(false);
    onChange({ ...request, messages });
  };

  const startRowDrag = (event: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    if (event.button !== 0 || request.messages.length < 2) return;
    const { clientX: startX, clientY: startY } = event;
    dragState.current = { from: index, gap: index, startX, startY, active: false };
    const move = (moveEvent: PointerEvent) => {
      const state = dragState.current;
      const list = listRef.current;
      if (!state || !list) return;
      if (!state.active) {
        if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 6) return;
        state.active = true;
        setDragFrom(state.from);
        document.body.style.userSelect = "none";
      }
      moveEvent.preventDefault();
      const rows = Array.from(list.querySelectorAll<HTMLElement>(".message-list-item"));
      const listRect = list.getBoundingClientRect();
      let gap = rows.length;
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const rect = rows[rowIndex].getBoundingClientRect();
        if (moveEvent.clientY < rect.top + rect.height / 2) { gap = rowIndex; break; }
      }
      const edge = gap < rows.length ? rows[gap].getBoundingClientRect().top : rows[rows.length - 1].getBoundingClientRect().bottom;
      state.gap = gap;
      setDropGap(gap);
      setDropTop(edge - listRect.top + list.scrollTop - 1);
    };
    const stop = () => {
      const state = dragState.current;
      dragState.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.style.removeProperty("user-select");
      setDragFrom(null);
      setDropGap(null);
      if (!state?.active) return;
      suppressClick.current = true;
      window.setTimeout(() => { suppressClick.current = false; }, 0);
      moveMessage(state.from, state.gap);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const updatePart = (partIndex: number, updater: (part: Record<string, unknown>) => Record<string, unknown>) => {
    updateCurrent((current) => ({
      ...current,
      content: Array.isArray(current.content) ? current.content.map((part, index) => index === partIndex && isRecord(part) ? updater(part) : part) : current.content,
    }));
  };

  const updateToolCall = (callIndex: number, updater: (call: ToolCall) => ToolCall) => {
    updateCurrent((current) => ({ ...current, tool_calls: current.tool_calls?.map((call, index) => index === callIndex ? updater(call) : call) }));
  };

  const addToolCall = () => {
    updateCurrent((current) => {
      const calls = Array.isArray(current.tool_calls) ? current.tool_calls : [];
      return {
        ...current,
        tool_calls: [...calls, { id: `call_${crypto.randomUUID().slice(0, 8)}`, type: "function", function: { name: "", arguments: "{}" } }],
      };
    });
  };

  if (!message) {
    return <div className="request-empty"><p>This request has no messages.</p><button className="button button-primary" onClick={() => onChange({ ...request, messages: [{ role: "user", content: "" }] })}><Plus size={15} /> Add message</button></div>;
  }

  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const imageCount = messageImageCount(message);

  return <div className="request-editor">
    <div className="request-config">
      <div className="document-title"><span className="status-dot" /><span>{name ?? "Chat completion request"}</span></div>
      <div className="request-config-controls">
        <label>MODEL<input value={typeof request.model === "string" ? request.model : ""} onChange={(event) => onChange({ ...request, model: event.target.value })} placeholder="Model name" /></label>
        <div className="request-config-actions">
          <button className={`button button-secondary ${sourceOpen ? "is-active" : ""}`} onClick={() => setSourceOpen((value) => !value)}><Braces size={14} /> Request JSON</button>
          <button className="button button-secondary" disabled={!filePath || !dirty || Boolean(sourceError)} onClick={onSave} title={filePath ? "Save request (⌘S)" : "Open a file to save changes"}><Save size={14} /> Save{dirty && <span className="dirty-dot" />}</button>
        </div>
      </div>
    </div>
    {sourceOpen && <div className="request-source">
      <div><span>FULL REQUEST JSON</span><button className="icon-button" aria-label="Close request JSON" onClick={() => setSourceOpen(false)}><X size={14} /></button></div>
      <textarea value={source} onChange={(event) => onSourceChange(event.target.value)} spellCheck={false} />
      {sourceError && <p className="field-error">{sourceError}</p>}
    </div>}

    <div className="request-columns">
      <section className="message-list-panel">
        <div className="panel-caption"><span>MESSAGES <b>{request.messages.length}</b></span><button className="icon-button" aria-label="Add message" title="Add message" onClick={() => { onChange({ ...request, messages: [...request.messages, { role: "user", content: "" }] }); setSelected(request.messages.length); }}><Plus size={16} /></button></div>
        <div className="message-list" ref={listRef}>
          {request.messages.map((item, index) => {
            const calls = Array.isArray(item.tool_calls) ? item.tool_calls : [];
            const images = messageImageCount(item);
            const hasMeta = calls.length > 0 || images > 0;
            return <button
              key={index}
              className={`message-list-item ${hasMeta ? "has-meta" : ""} ${selected === index ? "selected" : ""} ${dragFrom === index ? "dragging" : ""}`}
              title="Drag to reorder"
              onPointerDown={(event) => startRowDrag(event, index)}
              onClick={() => { if (suppressClick.current) return; setSelected(index); setRawEditing(false); }}
            >
              <span className={`role-badge role-${item.role}`}>{item.role}</span>
              <span className="message-item-body">
                <span className="message-item-topline">
                  {calls.slice(0, 3).map((call, callIndex) => <span className="tool-chip" key={callIndex}>{call.function?.name || "function"}</span>)}
                  {calls.length > 3 && <span className="tool-more">+{calls.length - 3}</span>}
                  {images > 0 && <span className="image-count"><ImageIcon size={12} /> ×{images}</span>}
                </span>
                <span className="message-preview">{messagePreview(item)}</span>
              </span>
            </button>;
          })}
          {dragFrom !== null && dropGap !== null && <div className="message-drop-line" style={{ top: dropTop }} />}
        </div>
      </section>

      <section className="message-detail-panel">
        <div className="message-detail-header">
          <div className="message-identity">
            <span className={`role-badge role-${message.role}`}>{message.role}</span>
            <span className="message-position">#{selected + 1} <span>/ {request.messages.length}</span></span>
            {imageCount > 0 && <span className="image-count"><ImageIcon size={12} /> ×{imageCount}</span>}
          </div>
          <div className="detail-toolbar">
            <div className="segmented"><button className={mode === "rendered" ? "active" : ""} onClick={() => { setMode("rendered"); setRawEditing(false); }}>Rendered</button><button className={mode === "raw" ? "active" : ""} onClick={() => setMode("raw")}>Raw</button></div>
            <button className="icon-button" title="Copy message" aria-label="Copy message" onClick={() => void copy(JSON.stringify(message, null, 2))}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>
            <span className="toolbar-divider" />
            <button className="icon-button" disabled={selected === 0} aria-label="Previous message" onClick={() => { setSelected(selected - 1); setRawEditing(false); }}><ChevronUp size={16} /></button>
            <button className="icon-button" disabled={selected === request.messages.length - 1} aria-label="Next message" onClick={() => { setSelected(selected + 1); setRawEditing(false); }}><ChevronDown size={16} /></button>
            <span className="toolbar-divider" />
            <button className="icon-button delete-message" title="Delete message" aria-label="Delete message" onClick={() => { if (window.confirm("Delete this message?")) onChange({ ...request, messages: request.messages.filter((_, index) => index !== selected) }); }}><Trash2 size={15} /></button>
          </div>
        </div>

        <div className="message-detail-scroll">
          {mode === "raw" ? <div className="message-raw">
            <div className="raw-heading"><span>MESSAGE JSON</span><button className="button button-quiet" onClick={() => { setRawEditing((value) => !value); setRawDraft(JSON.stringify(message, null, 2)); setRawError(""); }}>{rawEditing ? <Code2 size={13} /> : <Pencil size={13} />}{rawEditing ? "View tree" : "Edit JSON"}</button></div>
            {rawEditing ? <><textarea className="raw-source-editor" value={rawDraft} spellCheck={false} onChange={(event) => {
              const value = event.target.value;
              setRawDraft(value);
              try {
                const parsed: unknown = JSON.parse(value);
                if (!isRecord(parsed) || typeof parsed.role !== "string") throw new Error("Message must have a role.");
                updateCurrent(() => parsed as ChatMessage);
                setRawError("");
              } catch (reason) { setRawError(reason instanceof Error ? reason.message : String(reason)); }
            }} />{rawError && <p className="field-error">{rawError}</p>}</> : <JsonTree value={message} label="message" />}
          </div> : <div className="rendered-message">
            <div className="field-row"><label>ROLE<select value={message.role} onChange={(event) => updateCurrent((current) => ({ ...current, role: event.target.value }))}>{roles.map((role) => <option key={role}>{role}</option>)}</select></label>{message.role === "tool" && <label>TOOL CALL ID<input value={typeof message.tool_call_id === "string" ? message.tool_call_id : ""} placeholder="call_…" onChange={(event) => updateCurrent((current) => ({ ...current, tool_call_id: event.target.value }))} /></label>}</div>

            {typeof message.content === "string" ? <label className="content-field">CONTENT<textarea value={message.content} onChange={(event) => updateCurrent((current) => ({ ...current, content: event.target.value }))} placeholder="Message content" /></label> : Array.isArray(message.content) ? <div className="content-parts"><div className="section-label">CONTENT PARTS <span>{message.content.length}</span></div>{message.content.map((part, partIndex) => {
              if (!isRecord(part)) return <JsonTree key={partIndex} value={part} label={`part ${partIndex}`} />;
              const image = part.type === "image_url" || part.type === "input_image" || part.type === "image";
              if (image) {
                const imageValue = part.image_url ?? part.image;
                const url = typeof imageValue === "string" ? imageValue : isRecord(imageValue) && typeof imageValue.url === "string" ? imageValue.url : "";
                return <div className="image-part" key={partIndex}><div className="section-label"><span><ImageIcon size={13} /> IMAGE {partIndex + 1}</span></div><input value={url} placeholder="Image URL or data URI" onChange={(event) => updatePart(partIndex, (current) => {
                  if (isRecord(current.image_url)) return { ...current, image_url: { ...current.image_url, url: event.target.value } };
                  if (typeof current.image_url === "string") return { ...current, image_url: event.target.value };
                  return { ...current, image_url: { url: event.target.value } };
                })} />{url && <img src={url} alt={`Message ${selected + 1}, part ${partIndex + 1}`} onError={(event) => { event.currentTarget.style.display = "none"; }} onLoad={(event) => { event.currentTarget.style.display = "block"; }} />}</div>;
              }
              return <label className="content-field compact" key={partIndex}>TEXT PART {partIndex + 1}<textarea value={typeof part.text === "string" ? part.text : ""} onChange={(event) => updatePart(partIndex, (current) => ({ ...current, text: event.target.value }))} /></label>;
            })}</div> : <div className="null-content"><Code2 size={16} /><span>Content is {message.content === null ? "null" : "structured"}.</span><button className="button button-quiet" onClick={() => updateCurrent((current) => ({ ...current, content: "" }))}>Convert to text</button></div>}

            {(message.role === "assistant" || toolCalls.length > 0) && <div className="function-calls"><div className="section-title"><Wrench size={16} /><h3>Function Calls</h3><span>{toolCalls.length}</span>{message.role === "assistant" && <button className="button button-quiet function-add" type="button" onClick={addToolCall}><Plus size={13} />Add function call</button>}</div>{toolCalls.map((call, callIndex) => <div className="function-call-card" key={callIndex}><div className="call-number">CALL {callIndex + 1}</div><div className="call-fields"><label>FUNCTION<input value={call.function?.name ?? ""} onChange={(event) => updateToolCall(callIndex, (current) => ({ ...current, function: { ...current.function, name: event.target.value } }))} /></label><label>ID<input value={call.id ?? ""} onChange={(event) => updateToolCall(callIndex, (current) => ({ ...current, id: event.target.value }))} /></label></div><label className="content-field compact">ARGUMENTS<textarea value={call.function?.arguments ?? ""} spellCheck={false} onChange={(event) => updateToolCall(callIndex, (current) => ({ ...current, function: { ...current.function, arguments: event.target.value } }))} /></label></div>)}</div>}
          </div>}
        </div>
      </section>
    </div>
  </div>;
}
