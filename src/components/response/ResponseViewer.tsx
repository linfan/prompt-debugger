import { useState } from "react";
import { Brain, Check, ChevronDown, ChevronRight, ChevronUp, Copy, MessageSquareText, Save, Wrench } from "lucide-react";
import type { ResponseAggregate } from "../../lib/openai";
import { JsonTree } from "../JsonTree";

type ResponseSection = "reasoning" | "content";

export function ResponseViewer({ response, name, streaming = false, onSave }: { response: ResponseAggregate; name?: string; streaming?: boolean; onSave?: () => void }) {
  const [choicePosition, setChoicePosition] = useState(0);
  const [mode, setMode] = useState<"rendered" | "raw">("rendered");
  const [collapsed, setCollapsed] = useState<Record<ResponseSection, boolean>>({ reasoning: false, content: false });
  const [copied, setCopied] = useState("");
  const choice = response.choices[Math.min(choicePosition, Math.max(0, response.choices.length - 1))];

  const toggleSection = (section: ResponseSection) => {
    setCollapsed((current) => ({ ...current, [section]: !current[section] }));
  };

  const copy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(""), 1200);
  };
  const copyButton = (key: string, value: string) => <button className="icon-button" aria-label={`Copy ${key}`} title={`Copy ${key}`} onClick={() => void copy(key, value)}>{copied === key ? <Check size={14} /> : <Copy size={14} />}</button>;
  const rawJson = () => {
    if (response.source !== "json") return null;
    try { return JSON.parse(response.raw) as unknown; } catch { return null; }
  };
  const json = rawJson();

  return <div className="response-viewer">
    <div className="response-toolbar">
      <div className="document-title"><span className={`status-dot ${streaming ? "is-live" : ""}`} /><span>{name ?? (response.source === "sse" ? "Streamed completion" : "Completion response")}</span>{streaming && <span className="live-label">RECEIVING</span>}</div>
      <div className="detail-toolbar">
        {onSave && <button className="button button-secondary response-save" type="button" title="Save response as file" onClick={onSave}><Save size={13} /> Save</button>}
        {response.choices.length > 1 && <div className="choice-nav"><button className="icon-button" disabled={choicePosition === 0} aria-label="Previous choice" onClick={() => setChoicePosition((value) => value - 1)}><ChevronUp size={14} /></button><span>Choice {choicePosition + 1} / {response.choices.length}</span><button className="icon-button" disabled={choicePosition >= response.choices.length - 1} aria-label="Next choice" onClick={() => setChoicePosition((value) => value + 1)}><ChevronDown size={14} /></button></div>}
        <div className="segmented"><button className={mode === "rendered" ? "active" : ""} onClick={() => setMode("rendered")}>Rendered</button><button className={mode === "raw" ? "active" : ""} onClick={() => setMode("raw")}>Raw</button></div>
        {copyButton("response", response.raw)}
      </div>
    </div>

    {response.warnings.length > 0 && <div className="parse-warnings">{response.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}
    {mode === "raw" ? <div className="response-raw">{json !== null ? <JsonTree value={json} label="response" /> : <pre>{response.raw || "No response content yet."}</pre>}</div> : <div className="response-scroll">
      {!choice ? <div className="response-empty"><MessageSquareText size={25} /><h2>No completion choices</h2><p>The response may contain an error or a non-standard payload. Check Raw for details.</p></div> : <>
        {choice.reasoningContent && <section className="response-card">
          <header>
            <div><Brain size={17} /><h2>Reasoning</h2></div>
            <div className="response-card-actions">
              {copyButton("reasoning", choice.reasoningContent)}
              <button type="button" className="icon-button" aria-expanded={!collapsed.reasoning} aria-label={collapsed.reasoning ? "Expand reasoning" : "Collapse reasoning"} title={collapsed.reasoning ? "Expand reasoning" : "Collapse reasoning"} onClick={() => toggleSection("reasoning")}>{collapsed.reasoning ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</button>
            </div>
          </header>
          {!collapsed.reasoning && <pre className="response-text">{choice.reasoningContent}</pre>}
        </section>}
        {choice.content && <section className="response-card">
          <header>
            <div><MessageSquareText size={17} /><h2>Content</h2></div>
            <div className="response-card-actions">
              {copyButton("content", choice.content)}
              <button type="button" className="icon-button" aria-expanded={!collapsed.content} aria-label={collapsed.content ? "Expand content" : "Collapse content"} title={collapsed.content ? "Expand content" : "Collapse content"} onClick={() => toggleSection("content")}>{collapsed.content ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</button>
            </div>
          </header>
          {!collapsed.content && <pre className="response-text">{choice.content}</pre>}
        </section>}
        {choice.toolCalls.length > 0 && <section className="response-card">
          <header><div><Wrench size={17} /><h2>Function Calls</h2><span className="card-count">{choice.toolCalls.length}</span></div>{copyButton("tool calls", choice.toolCalls.map((call) => `${call.name}(${call.arguments})`).join("\n"))}</header>
          <div className="response-calls">{choice.toolCalls.map((call, index) => {
            let argumentsJson: unknown;
            let validArguments = false;
            try { argumentsJson = JSON.parse(call.arguments); validArguments = true; } catch { validArguments = false; }
            return <article className="response-call" key={`${call.index}-${index}`}><div className="response-call-title"><h3>Call {index + 1}</h3>{copyButton(`call ${index + 1}`, call.arguments)}</div><dl><dt>Function</dt><dd>{call.name || "(unnamed)"}</dd><dt>ID</dt><dd>{call.id || "(not provided)"}</dd></dl><div className="argument-label">ARGUMENTS</div>{validArguments ? <JsonTree value={argumentsJson} label="arguments" /> : <pre className="argument-raw">{call.arguments || "(empty)"}</pre>}</article>;
          })}</div>
        </section>}
        {!choice.reasoningContent && !choice.content && choice.toolCalls.length === 0 && <div className="response-empty"><MessageSquareText size={25} /><h2>Nothing to display</h2><p>This choice contains no reasoning, text content, or function calls. Check Raw for details.</p></div>}
        {choice.finishReason && <div className="finish-reason">FINISH REASON <span>{choice.finishReason}</span></div>}
      </>}
    </div>}
  </div>;
}
