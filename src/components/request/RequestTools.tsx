import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, Code2, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import type { ChatTool } from "../../lib/openai";
import { isRecord } from "../../lib/openai";

interface Props {
  tools: ChatTool[];
  selected: number;
  onSelect: (index: number) => void;
  onChange: (tools: ChatTool[]) => void;
  onAdd: () => void;
}

function toolType(tool: ChatTool): string {
  return typeof tool.type === "string" && tool.type.trim() ? tool.type : "function";
}

function toolName(tool: ChatTool): string {
  const name = tool.function?.name;
  return typeof name === "string" && name.trim() ? name : "Unnamed tool";
}

function toolDescription(tool: ChatTool): string {
  return typeof tool.function?.description === "string" ? tool.function.description : "";
}

function parameterSummary(tool: ChatTool): string {
  const parameters = tool.function?.parameters;
  if (parameters === undefined) return "No params";
  if (!isRecord(parameters) || !isRecord(parameters.properties)) return "0 params";
  const count = Object.keys(parameters.properties).length;
  return `${count} param${count === 1 ? "" : "s"}`;
}

export function RequestTools({ tools, selected, onSelect, onChange, onAdd }: Props) {
  const [mode, setMode] = useState<"rendered" | "raw">("rendered");
  const [rawEditing, setRawEditing] = useState(false);
  const [rawDraft, setRawDraft] = useState("");
  const [rawError, setRawError] = useState("");
  const [parameterDraft, setParameterDraft] = useState("");
  const [parameterError, setParameterError] = useState("");
  const [copied, setCopied] = useState(false);
  const tool = tools[Math.min(selected, tools.length - 1)];

  useEffect(() => {
    const parameters = tool.function?.parameters;
    setParameterDraft(parameters === undefined ? "" : JSON.stringify(parameters, null, 2));
    setParameterError("");
    setRawEditing(false);
    setRawError("");
  }, [selected, mode, tools.length]);

  const updateTool = (updater: (tool: ChatTool) => ChatTool) => {
    onChange(tools.map((item, index) => index === selected ? updater(item) : item));
  };

  const setFunctionField = (field: string, value: unknown) => {
    updateTool((current) => ({ ...current, function: { ...current.function, [field]: value } }));
  };

  const setParameters = (value: unknown) => {
    updateTool((current) => {
      const nextFunction = { ...current.function };
      if (value === undefined) delete nextFunction.parameters;
      else nextFunction.parameters = value;
      return { ...current, function: nextFunction };
    });
  };

  const changeParameters = (value: string) => {
    setParameterDraft(value);
    if (!value.trim()) {
      setParameterError("");
      setParameters(undefined);
      return;
    }
    try {
      setParameters(JSON.parse(value));
      setParameterError("");
    } catch (reason) {
      setParameterError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const deleteTool = () => {
    if (!window.confirm("Delete this tool?")) return;
    const next = tools.filter((_, index) => index !== selected);
    onChange(next);
    onSelect(Math.max(0, Math.min(selected, next.length - 1)));
  };

  const copyTool = async () => {
    await navigator.clipboard.writeText(JSON.stringify(tool, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return <section className="request-columns" aria-label="Request tools">
    <div className="message-list-panel">
      <div className="panel-caption"><span>TOOLS <b>{tools.length}</b></span><button className="icon-button" aria-label="Add tool" title="Add tool" onClick={() => { onAdd(); setMode("rendered"); }}><Plus size={16} /></button></div>
      <div className="message-list">
        {tools.map((item, index) => <button
          key={index}
          className={`message-list-item tool-list-item has-meta ${selected === index ? "selected" : ""}`}
          onClick={() => { onSelect(index); setRawEditing(false); }}
        >
          <span className="tool-type-badge">{toolType(item)}</span>
          <span className="message-item-body">
            <span className="message-item-topline">
              <span className="tool-item-name">{toolName(item)}</span>
              <span className="tool-param-count">{parameterSummary(item)}</span>
            </span>
            <span className="message-preview">{toolDescription(item).trim() || "No description"}</span>
          </span>
        </button>)}
      </div>
    </div>

    <div className="message-detail-panel">
      <div className="message-detail-header">
        <div className="message-identity">
          <span className="tool-type-badge">{toolType(tool)}</span>
          <span className="message-position">#{selected + 1} <span>/ {tools.length}</span></span>
          <span className="tool-param-summary">{parameterSummary(tool)}</span>
        </div>
        <div className="detail-toolbar">
          <div className="segmented"><button className={mode === "rendered" ? "active" : ""} onClick={() => { setMode("rendered"); setRawEditing(false); }}>Rendered</button><button className={mode === "raw" ? "active" : ""} onClick={() => setMode("raw")}>Raw</button></div>
          <button className="icon-button" title="Copy tool" aria-label="Copy tool" onClick={() => void copyTool()}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>
          <span className="toolbar-divider" />
          <button className="icon-button" disabled={selected === 0} aria-label="Previous tool" onClick={() => onSelect(selected - 1)}><ChevronUp size={16} /></button>
          <button className="icon-button" disabled={selected === tools.length - 1} aria-label="Next tool" onClick={() => onSelect(selected + 1)}><ChevronDown size={16} /></button>
          <span className="toolbar-divider" />
          <button className="icon-button delete-message" title="Delete tool" aria-label="Delete tool" onClick={deleteTool}><Trash2 size={15} /></button>
        </div>
      </div>

      <div className="message-detail-scroll">
        {mode === "raw" ? <div className="message-raw tool-raw">
          <div className="raw-heading"><span>TOOL JSON</span><button className="button button-quiet" onClick={() => { setRawEditing((value) => !value); setRawDraft(JSON.stringify(tool, null, 2)); setRawError(""); }}>{rawEditing ? <Code2 size={13} /> : <Pencil size={13} />}{rawEditing ? "View JSON" : "Edit JSON"}</button></div>
          {rawEditing ? <><textarea className="raw-source-editor" value={rawDraft} spellCheck={false} onChange={(event) => {
            const value = event.target.value;
            setRawDraft(value);
            try {
              const parsed: unknown = JSON.parse(value);
              if (!isRecord(parsed)) throw new Error("Tool must be a JSON object.");
              if (parsed.function !== undefined && !isRecord(parsed.function)) throw new Error("Tool function must be an object.");
              updateTool(() => parsed as ChatTool);
              setRawError("");
            } catch (reason) { setRawError(reason instanceof Error ? reason.message : String(reason)); }
          }} />{rawError && <p className="field-error">{rawError}</p>}</> : <pre className="raw-json">{JSON.stringify(tool, null, 2)}</pre>}
        </div> : <div className="rendered-message tool-detail">
          <div className="tool-section">
            <div className="section-label">TOOL</div>
            <div className="field-row">
              <label>TYPE<input value={typeof tool.type === "string" ? tool.type : ""} placeholder="function" onChange={(event) => updateTool((current) => ({ ...current, type: event.target.value }))} /></label>
              <label>NAME<input value={typeof tool.function?.name === "string" ? tool.function.name : ""} placeholder="tool_name" onChange={(event) => setFunctionField("name", event.target.value)} /></label>
            </div>
            <label className="content-field compact">DESCRIPTION<textarea value={toolDescription(tool)} placeholder="Describe when the model should call this tool" onChange={(event) => setFunctionField("description", event.target.value)} /></label>
          </div>
          <div className="tool-section">
            <div className="section-label">PARAMETERS <span>{parameterSummary(tool)}</span></div>
            <label className="content-field compact tool-parameters">PARAMETERS JSON<textarea value={parameterDraft} spellCheck={false} placeholder='{"type": "object", "properties": {}}' onChange={(event) => changeParameters(event.target.value)} /></label>
            {parameterError && <p className="field-error">{parameterError}</p>}
          </div>
        </div>}
      </div>
    </div>
  </section>;
}
