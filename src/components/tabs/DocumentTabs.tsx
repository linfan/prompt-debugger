import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronsRight, Copy, FileCode2, FileText, Plus, Save, X, XCircle } from "lucide-react";
import { isDirty, type DocumentTab } from "../../lib/tabs";

interface Props {
  tabs: DocumentTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewTab: () => void;
  onClose: (id: string) => void;
  onCloseAll: () => void;
  onCloseOthers: (id: string) => void;
  onCloseToRight: (id: string) => void;
  onCopyPath: (tab: DocumentTab) => void;
  onSave: (id: string) => void;
}

type MenuState = { tabId: string; x: number; y: number };

export function DocumentTabs({ tabs, activeId, onSelect, onNewTab, onClose, onCloseAll, onCloseOthers, onCloseToRight, onCopyPath, onSave }: Props) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = (event: React.MouseEvent, tab: DocumentTab) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ tabId: tab.id, x: event.clientX, y: event.clientY });
    setMenuPosition({ x: event.clientX, y: event.clientY });
  };

  const run = (action: () => void) => {
    setMenu(null);
    action();
  };

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onMouseDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  useLayoutEffect(() => {
    const element = menuRef.current;
    if (!menu || !element) return;
    const rect = element.getBoundingClientRect();
    setMenuPosition({
      x: Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8)),
    });
  }, [menu]);

  const menuTab = menu ? tabs.find((tab) => tab.id === menu.tabId) : undefined;
  const menuIndex = menuTab ? tabs.findIndex((tab) => tab.id === menuTab.id) : -1;

  return <>
    <div className="document-tabs-bar">
      <div className="document-tabs" role="tablist" aria-label="Open documents" onScroll={() => setMenu(null)}>
        {tabs.length === 0 && <span className="document-tabs-empty">No open documents</span>}
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return <div
            key={tab.id}
            role="tab"
            tabIndex={0}
            aria-selected={active}
            className={`document-tab ${active ? "active" : ""}`}
            title={tab.name}
            onClick={() => onSelect(tab.id)}
            onContextMenu={(event) => openMenu(event, tab)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(tab.id);
              }
            }}
          >
            {tab.kind === "text" ? <FileText size={13} /> : <FileCode2 size={13} />}
            <span className="document-tab-name">{tab.name}</span>
            {isDirty(tab) && <span className="dirty-dot" aria-label="Unsaved changes" />}
            <button className="document-tab-close" type="button" aria-label={`Close ${tab.name}`} title="Close tab" onClick={(event) => { event.stopPropagation(); onClose(tab.id); }}><X size={12} /></button>
          </div>;
        })}
      </div>
      <button className="icon-button document-tab-new" type="button" aria-label="New tab" title="Paste request or response in a new tab" onClick={onNewTab}><Plus size={16} /></button>
    </div>

    {menu && menuTab && <div ref={menuRef} className="context-menu" role="menu" style={{ left: menuPosition.x, top: menuPosition.y }} onContextMenu={(event) => event.preventDefault()}>
      <button role="menuitem" type="button" disabled={!menuTab.fullPath} onClick={() => run(() => onCopyPath(menuTab))}><Copy size={13} />Copy file path</button>
      {menuTab.kind === "response" && menuTab.temporary && <button role="menuitem" type="button" onClick={() => run(() => onSave(menuTab.id))}><Save size={13} />Save response as file…</button>}
      <div className="context-menu-separator" role="separator" />
      <button role="menuitem" type="button" onClick={() => run(() => onClose(menuTab.id))}><X size={13} />Close</button>
      <button role="menuitem" type="button" disabled={tabs.length < 2} onClick={() => run(() => onCloseOthers(menuTab.id))}><X size={13} />Close others</button>
      <button role="menuitem" type="button" disabled={menuIndex < 0 || menuIndex >= tabs.length - 1} onClick={() => run(() => onCloseToRight(menuTab.id))}><ChevronsRight size={13} />Close to the right</button>
      <button role="menuitem" type="button" onClick={() => run(onCloseAll)}><XCircle size={13} />Close all</button>
    </div>}
  </>;
}
