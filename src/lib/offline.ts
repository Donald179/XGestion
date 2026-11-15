export type OfflineEntity = "customer" | "supplier" | "category" | "product" | "service" | "location";
export type OfflineAction = "create" | "update" | "archive" | "toggle";

export type OfflineMutation = {
  id: string;
  createdAt: string;
  entity: OfflineEntity;
  action: OfflineAction;
  payload: Record<string, unknown>;
};

const STORAGE_KEY = "xgestion-offline-mutations";

export function readOfflineMutations(): OfflineMutation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineMutation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeOfflineMutations(items: OfflineMutation[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function enqueueOfflineMutation(mutation: OfflineMutation) {
  const next = readOfflineMutations();
  next.push(mutation);
  writeOfflineMutations(next);
  return next;
}

export function flushOfflineMutations(): Promise<{ processed: number; failed: number }> {
  if (typeof window === "undefined" || !navigator.onLine) return Promise.resolve({ processed: 0, failed: 0 });
  const queue = readOfflineMutations();
  if (!queue.length) return Promise.resolve({ processed: 0, failed: 0 });

  return fetch("/api/offline-sync", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mutations: queue }),
  })
    .then(async (res) => {
      if (!res.ok) {
        return { processed: 0, failed: queue.length };
      }
      const payload = (await res.json().catch(() => ({}))) as { processed?: number; failed?: number };
      writeOfflineMutations([]);
      return {
        processed: payload.processed ?? queue.length,
        failed: payload.failed ?? 0,
      };
    })
    .catch(() => ({ processed: 0, failed: queue.length }));
}

export function formDataObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of fd.entries()) {
    if (key === "") continue;
    const current = out[key];
    if (typeof current === "undefined") {
      out[key] = value instanceof File ? { name: value.name, type: value.type, size: value.size } : String(value);
      continue;
    }
    out[key] = Array.isArray(current) ? [...current, value instanceof File ? { name: value.name, type: value.type, size: value.size } : String(value)] : [current, value instanceof File ? { name: value.name, type: value.type, size: value.size } : String(value)];
  }
  return out;
}
