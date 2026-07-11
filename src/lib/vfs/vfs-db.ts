import { DEFAULT_VFS_SETTINGS, VfsNode, VfsSettings, VfsSnapshot } from "./types";

const DB_NAME = "jackie-vfs";
const DB_VERSION = 1;
const SETTINGS_KEY = "jackie.vfs.settings.v1";
const SEEDED_KEY = "jackie.vfs.seeded.v1";

/** In-memory fallback so the page still works where IndexedDB is unavailable (tests, private modes). */
const memory = {
  nodes: new Map<string, VfsNode>(),
  snapshots: new Map<string, VfsSnapshot>(),
};

function hasIdb(): boolean {
  return typeof indexedDB !== "undefined";
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("nodes")) {
          const store = db.createObjectStore("nodes", { keyPath: "id" });
          store.createIndex("parentId", "parentId", { unique: false });
        }
        if (!db.objectStoreNames.contains("snapshots")) {
          db.createObjectStore("snapshots", { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Failed to open jackie-vfs DB"));
    });
  }
  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("VFS transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("VFS transaction aborted"));
  });
}

function reqResult<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("VFS request failed"));
  });
}

export async function loadAllNodes(): Promise<VfsNode[]> {
  if (!hasIdb()) return [...memory.nodes.values()];
  const db = await openDb();
  const tx = db.transaction("nodes", "readonly");
  return reqResult(tx.objectStore("nodes").getAll() as IDBRequest<VfsNode[]>);
}

export async function putNodes(nodes: VfsNode[]): Promise<void> {
  if (nodes.length === 0) return;
  if (!hasIdb()) {
    for (const n of nodes) memory.nodes.set(n.id, n);
    return;
  }
  const db = await openDb();
  const tx = db.transaction("nodes", "readwrite");
  const store = tx.objectStore("nodes");
  for (const n of nodes) store.put(n);
  await txDone(tx);
}

export async function deleteNodesById(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  if (!hasIdb()) {
    for (const id of ids) memory.nodes.delete(id);
    return;
  }
  const db = await openDb();
  const tx = db.transaction("nodes", "readwrite");
  const store = tx.objectStore("nodes");
  for (const id of ids) store.delete(id);
  await txDone(tx);
}

/** Atomic full replace — used by import(replace), snapshot restore and undo/redo. */
export async function replaceAllNodes(nodes: VfsNode[]): Promise<void> {
  if (!hasIdb()) {
    memory.nodes.clear();
    for (const n of nodes) memory.nodes.set(n.id, n);
    return;
  }
  const db = await openDb();
  const tx = db.transaction("nodes", "readwrite");
  const store = tx.objectStore("nodes");
  store.clear();
  for (const n of nodes) store.put(n);
  await txDone(tx);
}

export async function listSnapshots(): Promise<VfsSnapshot[]> {
  const all = !hasIdb()
    ? [...memory.snapshots.values()]
    : await (async () => {
        const db = await openDb();
        const tx = db.transaction("snapshots", "readonly");
        return reqResult(tx.objectStore("snapshots").getAll() as IDBRequest<VfsSnapshot[]>);
      })();
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveSnapshot(snapshot: VfsSnapshot): Promise<void> {
  if (!hasIdb()) {
    memory.snapshots.set(snapshot.id, snapshot);
    return;
  }
  const db = await openDb();
  const tx = db.transaction("snapshots", "readwrite");
  tx.objectStore("snapshots").put(snapshot);
  await txDone(tx);
}

export async function deleteSnapshot(id: string): Promise<void> {
  if (!hasIdb()) {
    memory.snapshots.delete(id);
    return;
  }
  const db = await openDb();
  const tx = db.transaction("snapshots", "readwrite");
  tx.objectStore("snapshots").delete(id);
  await txDone(tx);
}

/** Keep only the newest `keep` automatic snapshots (manual ones are never pruned). */
export async function pruneAutoSnapshots(keep: number): Promise<void> {
  const all = await listSnapshots();
  const autos = all.filter(s => s.auto);
  for (const stale of autos.slice(keep)) await deleteSnapshot(stale.id);
}

export function loadSettings(): VfsSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_VFS_SETTINGS };
    return { ...DEFAULT_VFS_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_VFS_SETTINGS };
  }
}

export function saveSettings(settings: VfsSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // storage full / unavailable — settings just won't persist
  }
}

export function wasSeeded(): boolean {
  try { return localStorage.getItem(SEEDED_KEY) === "1"; } catch { return true; }
}

export function markSeeded(): void {
  try { localStorage.setItem(SEEDED_KEY, "1"); } catch { /* ignore */ }
}

export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (navigator.storage?.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      return { usage, quota };
    }
  } catch { /* unsupported */ }
  return null;
}
