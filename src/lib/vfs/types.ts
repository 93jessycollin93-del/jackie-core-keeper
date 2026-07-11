/** Jackie VFS — a local-first virtual file/folder system. */

export type VfsNodeType = "file" | "folder";
export type VfsEncoding = "utf8" | "base64";

export interface VfsNode {
  id: string;
  parentId: string | null;
  type: VfsNodeType;
  name: string;
  /** Text for utf8 files, raw base64 (no data: prefix) for binary. Empty for folders. */
  content: string;
  encoding: VfsEncoding;
  mime: string;
  /** Decoded byte length of content. */
  size: number;
  color: string | null;
  icon: string | null;
  tags: string[];
  starred: boolean;
  locked: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface VfsSnapshot {
  id: string;
  name: string;
  createdAt: number;
  nodeCount: number;
  bytes: number;
  auto: boolean;
  nodes: VfsNode[];
}

export type VfsSortBy = "name" | "type" | "size" | "updated" | "created";
export type VfsViewMode = "list" | "grid";
export type VfsDensity = "compact" | "cozy";

export interface VfsSettings {
  viewMode: VfsViewMode;
  sortBy: VfsSortBy;
  sortDir: "asc" | "desc";
  foldersFirst: boolean;
  showExtensions: boolean;
  showHidden: boolean;
  density: VfsDensity;
  confirmDelete: boolean;
  autoSnapshot: boolean;
  treeIndentGuides: boolean;
}

export const DEFAULT_VFS_SETTINGS: VfsSettings = {
  viewMode: "list",
  sortBy: "name",
  sortDir: "asc",
  foldersFirst: true,
  showExtensions: true,
  showHidden: true,
  density: "cozy",
  confirmDelete: true,
  autoSnapshot: true,
  treeIndentGuides: true,
};

export const NODE_COLORS = [
  { key: "red", cls: "text-red-500", bg: "bg-red-500" },
  { key: "orange", cls: "text-orange-500", bg: "bg-orange-500" },
  { key: "amber", cls: "text-amber-500", bg: "bg-amber-500" },
  { key: "green", cls: "text-emerald-500", bg: "bg-emerald-500" },
  { key: "cyan", cls: "text-cyan-500", bg: "bg-cyan-500" },
  { key: "blue", cls: "text-blue-500", bg: "bg-blue-500" },
  { key: "violet", cls: "text-violet-500", bg: "bg-violet-500" },
  { key: "pink", cls: "text-pink-500", bg: "bg-pink-500" },
] as const;

export type ExportFormat = "json" | "zip" | "tree" | "markdown" | "csv";
export type ImportMode = "merge" | "replace";
export type CollisionPolicy = "rename" | "overwrite" | "skip";
