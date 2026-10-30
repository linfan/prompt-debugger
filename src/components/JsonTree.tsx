import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { isRecord } from "../lib/openai";

function primitive(value: unknown) {
  if (value === null) return <span className="json-null">null</span>;
  if (typeof value === "string") return <span className="json-string">&quot;{value}&quot;</span>;
  if (typeof value === "number") return <span className="json-number">{String(value)}</span>;
  if (typeof value === "boolean") return <span className="json-boolean">{String(value)}</span>;
  return <span>{String(value)}</span>;
}

export function JsonTree({ value, label = "root" }: { value: unknown; label?: string }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (path: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(path)) next.delete(path); else next.add(path);
    return next;
  });

  const renderValue = (current: unknown, key: string, path: string, depth: number): React.ReactNode => {
    const complex = isRecord(current) || Array.isArray(current);
    if (!complex) return <div className="json-row" style={{ paddingLeft: depth * 17 }}><span className="json-spacer" /><span className="json-key">{key}</span><span className="json-colon">:</span>{primitive(current)}</div>;
    const entries = Array.isArray(current) ? current.map((item, index) => [String(index), item] as const) : Object.entries(current);
    const isCollapsed = collapsed.has(path);
    const open = Array.isArray(current) ? "[" : "{";
    const close = Array.isArray(current) ? "]" : "}";
    return <div>
      <div className="json-row json-branch" style={{ paddingLeft: depth * 17 }} onClick={() => toggle(path)}>
        <button aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${key}`}>{isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</button>
        <span className="json-key">{key}</span><span className="json-colon">:</span><span className="json-brace">{open}</span>
        {isCollapsed && <><span className="json-count">{entries.length} {Array.isArray(current) ? "items" : "keys"}</span><span className="json-brace">{close}</span></>}
      </div>
      {!isCollapsed && <>{entries.map(([childKey, child]) => renderValue(child, childKey, `${path}.${childKey}`, depth + 1))}<div className="json-row" style={{ paddingLeft: depth * 17 }}><span className="json-spacer" /><span className="json-brace">{close}</span></div></>}
    </div>;
  };

  return <div className="json-tree">{renderValue(value, label, "$", 0)}</div>;
}
