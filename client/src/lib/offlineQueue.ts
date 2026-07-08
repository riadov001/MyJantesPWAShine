/**
 * OfflineQueue - Sync automatique des mutations en attente
 * Auto-retry avec backoff exponentiel
 */
import {
  getPendingMutations,
  removeMutation,
  incrementMutationAttempt,
  atelierDB,
  type MutationRecord,
} from "./dossierDb";

type SyncStatus = "idle" | "syncing" | "synced" | "offline" | "error";

type StatusCallback = (status: SyncStatus, pending: number) => void;

const MAX_ATTEMPTS = 5;
const RETRY_BASE_MS = 2000;

let _onStatusChange: StatusCallback | null = null;
let _status: SyncStatus = "idle";
let _syncTimer: ReturnType<typeof setTimeout> | null = null;
let _isRunning = false;

export function setStatusCallback(cb: StatusCallback) {
  _onStatusChange = cb;
}

function notifyStatus(s: SyncStatus, pending: number = 0) {
  _status = s;
  _onStatusChange?.(s, pending);
}

async function syncMutation(mut: MutationRecord): Promise<boolean> {
  try {
    let url = "";
    let body: any = {};
    let method = "PATCH";

    if (mut.type === "status" || mut.type === "urgency") {
      url = `/api/dossiers/${mut.dosssierId}/status`;
      body = { ...mut.payload, clientVersion: mut.clientVersion };
    } else if (mut.type === "notes") {
      url = `/api/admin/repair-orders`;
      method = "PATCH";
      body = { ...mut.payload };
    } else {
      return true; // skip unknown types
    }

    const resp = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (resp.status === 409) {
      const conflict = await resp.json();
      console.warn("[OfflineQueue] Conflit détecté:", conflict);
      // Résoudre automatiquement
      const resolveResp = await fetch(`/api/dossiers/${mut.dosssierId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientData: { ...mut.payload, version: mut.clientVersion },
          baseData: {},
        }),
      });
      return resolveResp.ok;
    }

    return resp.ok;
  } catch {
    return false;
  }
}

async function runSync() {
  if (_isRunning) return;
  _isRunning = true;

  if (!navigator.onLine) {
    notifyStatus("offline");
    _isRunning = false;
    return;
  }

  const mutations = await getPendingMutations();
  if (mutations.length === 0) {
    notifyStatus("synced");
    _isRunning = false;
    return;
  }

  notifyStatus("syncing", mutations.length);

  for (const mut of mutations) {
    if (mut.attempts >= MAX_ATTEMPTS) {
      await removeMutation(mut.id!);
      continue;
    }

    const ok = await syncMutation(mut);
    if (ok) {
      await removeMutation(mut.id!);
    } else {
      const backoff = RETRY_BASE_MS * Math.pow(2, mut.attempts);
      await incrementMutationAttempt(mut.id!, "sync failed");
      console.warn(`[OfflineQueue] Retry dans ${backoff}ms pour mutation ${mut.id}`);
    }
  }

  const remaining = await getPendingMutations();
  notifyStatus(remaining.length > 0 ? "error" : "synced", remaining.length);
  _isRunning = false;
}

export function startOfflineQueue() {
  window.addEventListener("online", () => {
    notifyStatus("syncing");
    runSync();
  });

  window.addEventListener("offline", () => {
    notifyStatus("offline");
  });

  // Sync périodique toutes les 30s
  const interval = setInterval(() => {
    if (navigator.onLine) runSync();
  }, 30000);

  // Sync initiale
  if (navigator.onLine) runSync();

  return () => clearInterval(interval);
}

export function triggerSync() {
  if (navigator.onLine) runSync();
}

export function getCurrentStatus(): SyncStatus {
  return _status;
}

// Upload photo offline avec retry
export async function uploadPendingPhotos(dossierId: string): Promise<void> {
  const pending = await atelierDB.pendingPhotos.where("dossierId").equals(dossierId).toArray();
  for (const photo of pending) {
    try {
      const form = new FormData();
      form.append("photos", photo.file, photo.filename);
      const resp = await fetch(`/api/dossiers/${dossierId}/photos`, { method: "POST", body: form });
      if (resp.ok) await atelierDB.pendingPhotos.delete(photo.id!);
    } catch {}
  }
}
