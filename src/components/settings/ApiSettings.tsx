import { useState } from "react";
import { Eye, EyeOff, KeyRound, Settings2, X } from "lucide-react";

interface Props {
  url: string;
  token: string;
  onUrlChange: (url: string) => void;
  onTokenChange: (token: string) => void;
  onClose: () => void;
}

export function ApiSettings({ url, token, onUrlChange, onTokenChange, onClose }: Props) {
  const [showToken, setShowToken] = useState(false);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="dialog api-dialog" onSubmit={(event) => { event.preventDefault(); onClose(); }}>
      <div className="dialog-title-row"><div className="dialog-icon-title"><span><Settings2 size={17} /></span><h2>API connection</h2></div><button type="button" className="icon-button" aria-label="Close API settings" onClick={onClose}><X size={16} /></button></div>
      <p>Send the current request to any OpenAI-compatible Chat Completions endpoint.</p>
      <label htmlFor="api-url">API URL</label>
      <input id="api-url" type="url" required autoFocus value={url} onChange={(event) => onUrlChange(event.target.value)} placeholder="https://api.example.com/v1/chat/completions" spellCheck={false} />
      <label htmlFor="api-token">API TOKEN</label>
      <div className="token-input"><KeyRound size={14} /><input id="api-token" type={showToken ? "text" : "password"} value={token} onChange={(event) => onTokenChange(event.target.value)} placeholder="Optional for local endpoints" autoComplete="off" spellCheck={false} /><button type="button" aria-label={showToken ? "Hide API token" : "Show API token"} onClick={() => setShowToken((value) => !value)}>{showToken ? <EyeOff size={14} /> : <Eye size={14} />}</button></div>
      <div className="security-note">The URL is remembered on this device. The token is kept only in memory and is cleared when you quit.</div>
      <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={!url.trim()}>Done</button></div>
    </form>
  </div>;
}
