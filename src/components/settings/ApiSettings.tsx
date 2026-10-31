import { useState } from "react";
import { Eye, EyeOff, FileCode2, KeyRound, Settings2, Waves, X } from "lucide-react";
import { PREAMBLE_MAX_LINES, PREAMBLE_MIN_LINES, clampPreambleScanLines } from "../../lib/config";

interface Props {
  url: string;
  token: string;
  preambleScanLines: number;
  stream: boolean;
  onUrlChange: (url: string) => void;
  onTokenChange: (token: string) => void;
  onPreambleScanLinesChange: (lines: number) => void;
  onStreamChange: (stream: boolean) => void;
  onClose: () => void;
}

export function ApiSettings({ url, token, preambleScanLines, stream, onUrlChange, onTokenChange, onPreambleScanLinesChange, onStreamChange, onClose }: Props) {
  const [showToken, setShowToken] = useState(false);
  const [linesDraft, setLinesDraft] = useState(String(preambleScanLines));

  const commitLines = () => {
    const value = clampPreambleScanLines(Number(linesDraft));
    setLinesDraft(String(value));
    onPreambleScanLinesChange(value);
  };

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="dialog api-dialog" onSubmit={(event) => { event.preventDefault(); commitLines(); onClose(); }}>
      <div className="dialog-title-row"><div className="dialog-icon-title"><span><Settings2 size={17} /></span><h2>Settings</h2></div><button type="button" className="icon-button" aria-label="Close settings" onClick={onClose}><X size={16} /></button></div>
      <h3 className="settings-section"><span className="settings-section-icon"><KeyRound size={14} /></span>API connection</h3>
      <p>Send the current request to any OpenAI-compatible Chat Completions endpoint.</p>
      <label htmlFor="api-url">API URL</label>
      <input id="api-url" type="url" autoFocus value={url} onChange={(event) => onUrlChange(event.target.value)} placeholder="https://api.example.com/v1/chat/completions" spellCheck={false} />
      <label htmlFor="api-token">API TOKEN</label>
      <div className="token-input"><KeyRound size={14} /><input id="api-token" type={showToken ? "text" : "password"} value={token} onChange={(event) => onTokenChange(event.target.value)} placeholder="Optional for local endpoints" autoComplete="off" spellCheck={false} /><button type="button" aria-label={showToken ? "Hide API token" : "Show API token"} onClick={() => setShowToken((value) => !value)}>{showToken ? <EyeOff size={14} /> : <Eye size={14} />}</button></div>
      <div className="security-note">The URL and file parsing settings are remembered on this device. The token is kept only in memory and is cleared when you quit.</div>
      <h3 className="settings-section"><span className="settings-section-icon"><Waves size={14} /></span>Request delivery</h3>
      <p>Streaming renders tokens as they arrive. Complete waits for the full response before rendering it.</p>
      <div className="segmented settings-segmented" role="group" aria-label="Request delivery mode">
        <button type="button" className={stream ? "active" : ""} aria-pressed={stream} onClick={() => onStreamChange(true)}>Streaming</button>
        <button type="button" className={!stream ? "active" : ""} aria-pressed={!stream} onClick={() => onStreamChange(false)}>Complete</button>
      </div>
      <h3 className="settings-section"><span className="settings-section-icon"><FileCode2 size={14} /></span>File parsing</h3>
      <p>When a recorded JSON or SSE file starts with an HTTP header block, the editor skips leading lines to find the body. Only the first N lines are scanned.</p>
      <label htmlFor="preamble-lines">HEADER SCAN LINES (N)</label>
      <input id="preamble-lines" type="number" min={PREAMBLE_MIN_LINES} max={PREAMBLE_MAX_LINES} value={linesDraft} onChange={(event) => setLinesDraft(event.target.value)} onBlur={commitLines} spellCheck={false} />
      <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary">Done</button></div>
    </form>
  </div>;
}
