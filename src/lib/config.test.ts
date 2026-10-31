import { DEFAULT_CONFIG, clampPreambleScanLines, clampSidebarWidth, loadConfig, saveConfig } from "./config";

describe("config", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips settings", () => {
    saveConfig({ apiUrl: "https://example.com/v1", preambleScanLines: 12, sidebarWidth: 320, stream: false });
    expect(loadConfig()).toEqual({ apiUrl: "https://example.com/v1", preambleScanLines: 12, sidebarWidth: 320, stream: false });
  });

  it("falls back to defaults for invalid stored values", () => {
    localStorage.setItem("prompt-debugger.config", '{"preambleScanLines":"many","sidebarWidth":null}');
    expect(loadConfig()).toEqual(DEFAULT_CONFIG);
  });

  it("migrates the legacy API URL key", () => {
    localStorage.setItem("prompt-debugger.api-url", "https://legacy.example.com");
    expect(loadConfig().apiUrl).toBe("https://legacy.example.com");
  });

  it("clamps line counts and widths", () => {
    expect(clampPreambleScanLines(0)).toBe(1);
    expect(clampPreambleScanLines(5000)).toBe(1000);
    expect(clampPreambleScanLines(Number.NaN)).toBe(DEFAULT_CONFIG.preambleScanLines);
    expect(clampSidebarWidth(10)).toBe(180);
    expect(clampSidebarWidth(9999)).toBe(560);
  });
});
