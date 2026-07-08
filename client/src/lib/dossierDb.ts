/**
 * Dexie.js - Base IndexedDB pour le Mode Atelier Offline
 */
import Dexie, { type Table } from "dexie";

export interface DossierRecord {
  id: string;
  reference?: string | null;
  clientId: string;
  clientName: string;
  serviceId: string;
  serviceName?: string | null;
  scheduledDate: string;
  estimatedEndDate?: string | null;
  wheelCount?: number | null;
  diameter?: string | null;
  status: string;
  atelierStatus: string;
  urgency: string;
  version: number;
  lastUpdated: string;
  conflictHistory?: any[];
  notes?: string | null;
  vehicleRegistration?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleVin?: string | null;
  repairOrder?: any | null;
  createdAt: string;
  updatedAt: string;
  // Sync state
  _syncedAt?: number;
  _dirty?: boolean;
}

export interface MutationRecord {
  id?: number;
  dosssierId: string;
  type: "status" | "urgency" | "notes" | "photos";
  payload: Record<string, any>;
  clientVersion: number;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

export interface PendingPhotoRecord {
  id?: number;
  dossierId: string;
  file: Blob;
  filename: string;
  mimeType: string;
  createdAt: number;
  attempts: number;
}

export class AtelierDB extends Dexie {
  dossiers!: Table<DossierRecord, string>;
  mutations!: Table<MutationRecord, number>;
  pendingPhotos!: Table<PendingPhotoRecord, number>;

  constructor() {
    super("AtelierDB");
    this.version(1).stores({
      dossiers: "id, atelierStatus, urgency, status, scheduledDate, _dirty, _syncedAt",
      mutations: "++id, dosssierId, type, createdAt",
      pendingPhotos: "++id, dossierId, createdAt",
    });
  }
}

export const atelierDB = new AtelierDB();

// Utilitaire : sauvegarder ou mettre à jour des dossiers en bulk
export async function upsertDossiers(dossiers: DossierRecord[]) {
  await atelierDB.dossiers.bulkPut(dossiers);
}

// Marquer un dossier comme modifié localement
export async function markDirty(id: string, changes: Partial<DossierRecord>) {
  await atelierDB.dossiers.update(id, { ...changes, _dirty: true });
}

// Enqueue une mutation offline
export async function enqueueMutation(
  dossierId: string,
  type: MutationRecord["type"],
  payload: Record<string, any>,
  clientVersion: number
) {
  await atelierDB.mutations.add({
    dosssierId: dossierId,
    type,
    payload,
    clientVersion,
    createdAt: Date.now(),
    attempts: 0,
  });
}

export async function getPendingMutations(): Promise<MutationRecord[]> {
  return atelierDB.mutations.orderBy("createdAt").toArray();
}

export async function removeMutation(id: number) {
  await atelierDB.mutations.delete(id);
}

export async function incrementMutationAttempt(id: number, error: string) {
  await atelierDB.mutations.update(id, {
    attempts: await atelierDB.mutations.get(id).then((m) => (m?.attempts || 0) + 1),
    lastError: error,
  });
}
