/**
 * imageOfflineService - Compression côté client + stockage IndexedDB offline
 * Max 1600px, qualité 80%, cible ~200KB
 */
import imageCompression from "browser-image-compression";
import { atelierDB } from "./dossierDb";

const COMPRESS_OPTIONS = {
  maxSizeMB: 0.4,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
  initialQuality: 0.8,
};

const THUMB_OPTIONS = {
  maxSizeMB: 0.05,
  maxWidthOrHeight: 400,
  useWebWorker: true,
  initialQuality: 0.75,
};

export interface OfflinePhoto {
  originalName: string;
  blob: Blob;
  thumbBlob: Blob;
  localUrl: string;
  thumbUrl: string;
  sizeKb: number;
}

export async function compressAndStore(
  dossierId: string,
  file: File
): Promise<OfflinePhoto> {
  let compressed: File | Blob;
  let thumb: File | Blob;

  try {
    compressed = await imageCompression(file, COMPRESS_OPTIONS);
    thumb = await imageCompression(file, THUMB_OPTIONS);
  } catch {
    compressed = file;
    thumb = file;
  }

  const localUrl = URL.createObjectURL(compressed);
  const thumbUrl = URL.createObjectURL(thumb);

  // Stocker dans IndexedDB pour upload offline
  try {
    await atelierDB.pendingPhotos.add({
      dossierId,
      file: compressed,
      filename: file.name,
      mimeType: compressed.type || "image/jpeg",
      createdAt: Date.now(),
      attempts: 0,
    });
  } catch (e) {
    console.warn("[imageOfflineService] Erreur stockage IndexedDB:", e);
  }

  return {
    originalName: file.name,
    blob: compressed,
    thumbBlob: thumb,
    localUrl,
    thumbUrl,
    sizeKb: Math.round(compressed.size / 1024),
  };
}

export async function uploadPhotoNow(
  dossierId: string,
  file: File
): Promise<{ urls: string[] } | null> {
  try {
    const compressed = await imageCompression(file, COMPRESS_OPTIONS);
    const form = new FormData();
    form.append("photos", compressed, file.name);
    const resp = await fetch(`/api/dossiers/${dossierId}/photos`, {
      method: "POST",
      body: form,
    });
    if (!resp.ok) return null;
    return resp.json();
  } catch {
    return null;
  }
}

export function getPendingPhotoCount(dossierId: string): Promise<number> {
  return atelierDB.pendingPhotos.where("dossierId").equals(dossierId).count();
}
