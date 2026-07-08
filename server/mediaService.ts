import fs from 'fs';
import path from 'path';
import { db } from './db';
import { quoteMedia, invoiceMedia } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { ObjectStorageService } from './objectStorage';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
    '.doc': 'application/msword', '.zip': 'application/zip',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

export async function isObjectStorageAvailable(): Promise<boolean> {
  return true;
}

export async function uploadMedia(
  fileData: Buffer,
  fileName: string,
  folder: string = 'uploads',
  _garageSlug?: string
): Promise<string> {
  const svc = new ObjectStorageService();
  const objectPath = await svc.uploadFileBuffer(fileData, fileName, folder);
  console.log(`[MediaService] Upload OK: ${objectPath} (${fileData.length} bytes)`);
  return objectPath;
}

export async function downloadMedia(filePath: string): Promise<Buffer | null> {
  try {
    if (filePath.startsWith('/objects/')) {
      const svc = new ObjectStorageService();
      const { data } = await svc.getObject(filePath);
      return data;
    } else if (filePath.startsWith('/gdrive/')) {
      const { extractFileId, downloadFromGoogleDrive } = await import('./googleDriveStorage');
      const fileId = extractFileId(filePath);
      if (fileId) {
        const result = await downloadFromGoogleDrive(fileId);
        return result.data;
      }
    } else if (filePath.startsWith('/uploads/')) {
      const localPath = path.join(process.cwd(), filePath);
      if (fs.existsSync(localPath)) return fs.readFileSync(localPath);

      const baseName = path.basename(filePath);
      const svc = new ObjectStorageService();
      try {
        const { data } = await svc.getObject(`/objects/uploads/${baseName}`);
        return data;
      } catch {}
    } else if (filePath.startsWith('https://')) {
      const response = await fetch(filePath);
      if (response.ok) return Buffer.from(await response.arrayBuffer());
    } else {
      const localPath = filePath.startsWith('/') ? `.${filePath}` : filePath;
      if (fs.existsSync(localPath)) return fs.readFileSync(localPath);
    }
  } catch (err: any) {
    console.error(`[MediaService] Download failed ${filePath}:`, err.message);
  }
  return null;
}

export async function deleteMedia(filePath: string): Promise<void> {
  try {
    if (filePath.startsWith('/objects/')) {
      const svc = new ObjectStorageService();
      const storagePath = filePath.replace('/objects/', '.private/');
      await svc.deleteObject(storagePath);
    } else if (filePath.startsWith('/gdrive/')) {
      const { extractFileId, deleteFromGoogleDrive } = await import('./googleDriveStorage');
      const fileId = extractFileId(filePath);
      if (fileId) await deleteFromGoogleDrive(fileId);
    } else if (!filePath.startsWith('https://')) {
      const localPath = filePath.startsWith('/') ? `.${filePath}` : filePath;
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    }
  } catch (err: any) {
    console.error(`[MediaService] Delete failed ${filePath}:`, err.message);
  }
}

export function serveMediaHeaders(filePath: string): { contentType: string } {
  return { contentType: getMimeType(filePath) };
}

export async function migrateLocalToObjectStorage(): Promise<{
  migrated: number;
  errors: number;
  skipped: number;
  details: Array<{ file: string; oldPath: string; newPath: string; status: string }>;
}> {
  console.log(`[MediaMigration] Demarrage migration local -> Object Storage...`);

  const results: Array<{ file: string; oldPath: string; newPath: string; status: string }> = [];
  let migrated = 0, errors = 0, skipped = 0;

  const svc = new ObjectStorageService();

  const allLocalMedia = [
    ...(await db.select({ id: quoteMedia.id, filePath: quoteMedia.filePath, fileName: quoteMedia.fileName, table: quoteMedia.fileType }).from(quoteMedia)).filter(m => m.filePath.startsWith('/uploads/')).map(m => ({ ...m, entityTable: 'quote_media' as const })),
    ...(await db.select({ id: invoiceMedia.id, filePath: invoiceMedia.filePath, fileName: invoiceMedia.fileName, table: invoiceMedia.fileType }).from(invoiceMedia)).filter(m => m.filePath.startsWith('/uploads/')).map(m => ({ ...m, entityTable: 'invoice_media' as const })),
  ];

  console.log(`[MediaMigration] ${allLocalMedia.length} fichiers locaux a migrer`);

  for (const media of allLocalMedia) {
    const localFilePath = path.join(process.cwd(), media.filePath);

    if (!fs.existsSync(localFilePath)) {
      results.push({ file: media.fileName, oldPath: media.filePath, newPath: '', status: 'missing' });
      skipped++;
      continue;
    }

    try {
      const fileData = fs.readFileSync(localFilePath);
      const newPath = await svc.uploadFileBuffer(fileData, media.fileName, 'uploads');

      if (media.entityTable === 'quote_media') {
        await db.update(quoteMedia).set({ filePath: newPath }).where(eq(quoteMedia.id, media.id));
      } else {
        await db.update(invoiceMedia).set({ filePath: newPath }).where(eq(invoiceMedia.id, media.id));
      }

      results.push({ file: media.fileName, oldPath: media.filePath, newPath, status: 'migrated' });
      migrated++;
    } catch (err: any) {
      results.push({ file: media.fileName, oldPath: media.filePath, newPath: '', status: `error: ${err.message}` });
      errors++;
    }
  }

  console.log(`[MediaMigration] Termine: ${migrated} migres, ${errors} erreurs, ${skipped} ignores`);
  return { migrated, errors, skipped, details: results };
}
