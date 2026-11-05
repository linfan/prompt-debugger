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

export function parentDirectory(path: string): string {
  let end = path.length;
  while (end > 1 && (path[end - 1] === "/" || path[end - 1] === "\\")) end -= 1;
  const index = Math.max(path.lastIndexOf("/", end - 1), path.lastIndexOf("\\", end - 1));
  if (index < 0) return path.slice(0, end);
  if (index === 0) return path.slice(0, 1);
  if (index === 2 && path[1] === ":") return path.slice(0, 3);
  return path.slice(0, index);
}

export function isWithin(root: string, fullPath: string): boolean {
  if (root.endsWith("/") || root.endsWith("\\")) return fullPath.startsWith(root);
  return fullPath.startsWith(`${root}/`) || fullPath.startsWith(`${root}\\`);
}

export function relativeToRoot(root: string, fullPath: string): string {
  return fullPath.slice(root.length).replace(/^[\\/]+/, "").replace(/\\/g, "/");
}
