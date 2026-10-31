export interface WorkspaceNode {
  name: string;
  path: string;
  fullPath: string;
  kind: "file" | "directory";
  children: WorkspaceNode[];
}

export interface WorkspaceSnapshot {
  root: string;
  name: string;
  tree: WorkspaceNode[];
}

export interface WorkspaceFile {
  path: string;
  fullPath: string;
  name: string;
  content: string;
}
