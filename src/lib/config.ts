export interface AppConfig {
  apiUrl: string;
  preambleScanLines: number;
  sidebarWidth: number;
  stream: boolean;
}

export const PREAMBLE_MIN_LINES = 1;
export const PREAMBLE_MAX_LINES = 1000;
export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 560;

export const DEFAULT_CONFIG: AppConfig = {
  apiUrl: "",
  preambleScanLines: 50,
  sidebarWidth: 254,
  stream: true,
};

const CONFIG_KEY = "prompt-debugger.config";
const LEGACY_API_URL_KEY = "prompt-debugger.api-url";

export function clampPreambleScanLines(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CONFIG.preambleScanLines;
  return Math.min(PREAMBLE_MAX_LINES, Math.max(PREAMBLE_MIN_LINES, Math.round(value)));
}

export function clampSidebarWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CONFIG.sidebarWidth;
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(value)));
}

export function loadConfig(storage: Storage = localStorage): AppConfig {
  const fallback: AppConfig = {
    ...DEFAULT_CONFIG,
    apiUrl: storage.getItem(LEGACY_API_URL_KEY) ?? DEFAULT_CONFIG.apiUrl,
  };
  try {
    const raw = storage.getItem(CONFIG_KEY);
    if (!raw) return fallback;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
    const record = value as Record<string, unknown>;
    return {
      apiUrl: typeof record.apiUrl === "string" ? record.apiUrl : fallback.apiUrl,
      preambleScanLines: typeof record.preambleScanLines === "number"
        ? clampPreambleScanLines(record.preambleScanLines)
        : fallback.preambleScanLines,
      sidebarWidth: typeof record.sidebarWidth === "number"
        ? clampSidebarWidth(record.sidebarWidth)
        : fallback.sidebarWidth,
      stream: typeof record.stream === "boolean" ? record.stream : fallback.stream,
    };
  } catch {
    return fallback;
  }
}

export function saveConfig(config: AppConfig, storage: Storage = localStorage): void {
  storage.setItem(CONFIG_KEY, JSON.stringify(config));
}
