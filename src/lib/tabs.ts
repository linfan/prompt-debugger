import type { ChatRequest, ResponseAggregate } from "./openai";

interface DocumentTabBase {
  id: string;
  name: string;
  path?: string;
  fullPath?: string;
}

export interface RequestTab extends DocumentTabBase {
  kind: "request";
  request: ChatRequest;
  source: string;
  savedSource: string;
}

export interface ResponseTab extends DocumentTabBase {
  kind: "response";
  response: ResponseAggregate;
  temporary: boolean;
  streaming: boolean;
}

export interface TextTab extends DocumentTabBase {
  kind: "text";
  content: string;
}

export type DocumentTab = RequestTab | ResponseTab | TextTab;

export function isDirty(tab: DocumentTab): boolean {
  return tab.kind === "request" && tab.source !== tab.savedSource;
}
