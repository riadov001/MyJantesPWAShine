import * as cron from 'node-cron';
import { db } from './db';
import { 
  users, services, quotes, quoteItems, quoteMedia,
  invoices, invoiceItems, invoiceMedia, reservations,
  reservationServices, notifications, engagements,
  workflows, workflowSteps, serviceWorkflows, workshopTasks,
  applicationSettings, invoiceCounters, auditLogs, auditLogChanges,
  chatConversations, chatParticipants, chatMessages, chatAttachments
} from '@shared/schema';
import { eq } from 'drizzle-orm';
import { sendEmail, getEmailHeader, getEmailFooter } from './emailService';
import fs from 'fs';
import path from 'path';

let scheduledTask: cron.ScheduledTask | null = null;
const BACKUP_EMAIL = 'rbelmahi90@gmail.com';
const BACKUP_TIME = '21:00';
const MAX_EMAIL_ATTACHMENT_SIZE = 25 * 1024 * 1024;
const BACKUPS_DIR = path.join(process.cwd(), 'backups');

let backupSettings = {
  enabled: true,
  time: BACKUP_TIME,
  emailEnabled: true,
  emailRecipient: BACKUP_EMAIL,
};

function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

function listOldFiles(prefix: string, ext: string): string[] {
  ensureBackupsDir();
  return fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.startsWith(prefix) && f.endsWith(ext))
    .sort();
}

function deleteOldFiles(prefix: string, ext: string, excludeFile?: string) {
  const oldFiles = listOldFiles(prefix, ext);
  for (const f of oldFiles) {
    if (excludeFile && f === excludeFile) continue;
    try {
      fs.unlinkSync(path.join(BACKUPS_DIR, f));
      console.log(`[Backup] Ancienne sauvegarde supprimee: ${f}`);
    } catch (_) {}
  }
}

export async function generateBackupData() {
  const backupData = {
    version: '1.2',
    exportedAt: new Date().toISOString(),
    data: {
      users: await db.select().from(users),
      services: await db.select().from(services),
      quotes: await db.select().from(quotes),
      quoteItems: await db.select().from(quoteItems),
      quoteMedia: await db.select().from(quoteMedia),
      invoices: await db.select().from(invoices),
      invoiceItems: await db.select().from(invoiceItems),
      invoiceMedia: await db.select().from(invoiceMedia),
      reservations: await db.select().from(reservations),
      reservationServices: await db.select().from(reservationServices),
      notifications: await db.select().from(notifications),
      engagements: await db.select().from(engagements),
      workflows: await db.select().from(workflows),
      workflowSteps: await db.select().from(workflowSteps),
      serviceWorkflows: await db.select().from(serviceWorkflows),
      workshopTasks: await db.select().from(workshopTasks),
      applicationSettings: await db.select().from(applicationSettings),
      invoiceCounters: await db.select().from(invoiceCounters),
      auditLogs: await db.select().from(auditLogs),
      auditLogChanges: await db.select().from(auditLogChanges),
      chatConversations: await db.select().from(chatConversations),
      chatParticipants: await db.select().from(chatParticipants),
      chatMessages: await db.select().from(chatMessages),
      chatAttachments: await db.select().from(chatAttachments)
    }
  };
  return backupData;
}

async function downloadMediaFile(filePath: string): Promise<Buffer | null> {
  if (!filePath) return null;
  try {
    const { downloadMedia } = await import("./mediaService");
    const buf = await downloadMedia(filePath);
    if (!buf) {
      console.warn(`[MediaBackup] Fichier vide ou introuvable: ${filePath}`);
    }
    return buf;
  } catch (err: any) {
    console.error(`[MediaBackup] Echec téléchargement ${filePath}: ${err.message}`);
    return null;
  }
}

export async function performMediaBackup(): Promise<{ success: boolean; filename?: string; size?: number; mediaCount?: number; zipBuffer?: Buffer; error?: string }> {
  console.log(`[MediaBackup] Demarrage sauvegarde medias...`);
  
  try {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    const quoteMediaResults = await db.select({
      reference: quotes.reference,
      quoteId: quoteMedia.quoteId,
      mediaId: quoteMedia.id,
      filePath: quoteMedia.filePath,
      fileName: quoteMedia.fileName,
      fileType: quoteMedia.fileType
    }).from(quoteMedia).innerJoin(quotes, eq(quoteMedia.quoteId, quotes.id));

    const invoiceMediaResults = await db.select({
      reference: invoices.invoiceNumber,
      invoiceId: invoiceMedia.invoiceId,
      mediaId: invoiceMedia.id,
      filePath: invoiceMedia.filePath,
      fileName: invoiceMedia.fileName,
      fileType: invoiceMedia.fileType
    }).from(invoiceMedia).innerJoin(invoices, eq(invoiceMedia.invoiceId, invoices.id));

    let mediaCount = 0;
    let errorCount = 0;

    for (let i = 0; i < quoteMediaResults.length; i++) {
      const m = quoteMediaResults[i];
      try {
        const buffer = await downloadMediaFile(m.filePath);
        if (buffer) {
          const ext = path.extname(m.fileName || ".jpg");
          const zipName = `devis/${m.reference || 'SANS-REF'}_${i + 1}${ext}`;
          zip.file(zipName, buffer);
          mediaCount++;
        }
      } catch (err) {
        errorCount++;
        console.error(`[MediaBackup] Erreur devis media ${m.mediaId}:`, err);
      }
    }

    for (let i = 0; i < invoiceMediaResults.length; i++) {
      const m = invoiceMediaResults[i];
      try {
        const buffer = await downloadMediaFile(m.filePath);
        if (buffer) {
          const ext = path.extname(m.fileName || ".jpg");
          const zipName = `factures/${m.reference || 'SANS-REF'}_${i + 1}${ext}`;
          zip.file(zipName, buffer);
          mediaCount++;
        }
      } catch (err) {
        errorCount++;
        console.error(`[MediaBackup] Erreur facture media ${m.mediaId}:`, err);
      }
    }

    const mapping = {
      exportedAt: new Date().toISOString(),
      quoteMedia: quoteMediaResults.map(m => ({ entityType: 'quote', ...m })),
      invoiceMedia: invoiceMediaResults.map(m => ({ entityType: 'invoice', ...m }))
    };
    zip.file("media_mapping.json", JSON.stringify(mapping, null, 2));

    if (mediaCount === 0) {
      console.log(`[MediaBackup] Aucun media a sauvegarder`);
      return { success: true, mediaCount: 0 };
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const dateStr = new Date().toISOString().slice(0, 10);
    const zipFileName = `media_backup_${dateStr}.zip`;

    ensureBackupsDir();
    const localZipPath = path.join(BACKUPS_DIR, zipFileName);
    fs.writeFileSync(localZipPath, zipBuffer);

    try {
      const { ObjectStorageService } = await import("./replit_integrations/object_storage");
      const objStore = new ObjectStorageService();
      await objStore.uploadFileBuffer(zipBuffer, zipFileName, "backups");
      console.log(`[MediaBackup] Sauvegarde R2 OK (${mediaCount} medias, ${(zipBuffer.length / 1024 / 1024).toFixed(2)} Mo)`);
    } catch (r2Err: any) {
      console.error(`[MediaBackup] Upload R2 echoue:`, r2Err.message);
    }

    console.log(`[MediaBackup] Termine: ${mediaCount} medias, ${errorCount} erreurs, ${(zipBuffer.length / 1024 / 1024).toFixed(2)} Mo`);
    return { success: true, filename: zipFileName, size: zipBuffer.length, mediaCount, zipBuffer };
  } catch (error: any) {
    console.error('[MediaBackup] Erreur critique:', error.message);
    return { success: false, error: error.message };
  }
}

async function performScheduledBackup() {
  console.log(`[Backup] === Sauvegarde quotidienne demarree a ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} ===`);
  
  try {
    const backupData = await generateBackupData();
    const dateStr = new Date().toISOString().slice(0, 10);
    const dbFilename = `backup_${dateStr}.json`;
    
    ensureBackupsDir();
    const dbFilepath = path.join(BACKUPS_DIR, dbFilename);
    const dbJsonStr = JSON.stringify(backupData, null, 2);
    fs.writeFileSync(dbFilepath, dbJsonStr);
    const dbBuffer = Buffer.from(dbJsonStr);
    
    console.log(`[Backup] BDD sauvegardee: ${dbFilename} (${(dbBuffer.length / 1024 / 1024).toFixed(2)} Mo)`);
    
    try {
      const { ObjectStorageService } = await import("./replit_integrations/object_storage");
      const objStore = new ObjectStorageService();
      await objStore.uploadFileBuffer(dbBuffer, dbFilename, "backups");
      console.log(`[Backup] BDD envoyee sur R2`);
    } catch (r2Err: any) {
      console.error(`[Backup] Upload R2 BDD echoue:`, r2Err.message);
    }

    console.log(`[Backup] Migration fichiers locaux -> cloud...`);
    try {
      const { migrateLocalToObjectStorage } = await import("./mediaService");
      const migrationResult = await migrateLocalToObjectStorage();
      if (migrationResult.migrated > 0) {
        console.log(`[Backup] Migration: ${migrationResult.migrated} fichiers migres vers le cloud`);
      } else {
        console.log(`[Backup] Migration: aucun fichier local a migrer`);
      }
      if (migrationResult.errors > 0) {
        console.warn(`[Backup] Migration: ${migrationResult.errors} erreurs`);
      }
    } catch (migErr: any) {
      console.error(`[Backup] Migration echouee:`, migErr.message);
    }

    console.log(`[Backup] Lancement sauvegarde medias...`);
    const mediaResult = await performMediaBackup();

    const dateFormatted = new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
    const timeFormatted = new Date().toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' });
    
    const dbStats = Object.entries(backupData.data).map(([table, data]) => {
      const count = Array.isArray(data) ? data.length : 0;
      return `<tr><td style="padding: 4px 12px; border-bottom: 1px solid #f0f0f0;">${table}</td><td style="padding: 4px 12px; border-bottom: 1px solid #f0f0f0; text-align: right; font-weight: bold;">${count}</td></tr>`;
    }).join('');

    const dbSizeMo = (dbBuffer.length / 1024 / 1024).toFixed(2);
    const mediaSizeMo = mediaResult.size ? (mediaResult.size / 1024 / 1024).toFixed(2) : '0';
    const mediaCountStr = mediaResult.mediaCount?.toString() || '0';

    const attachments: Array<{ filename: string; content: Buffer }> = [];
    let attachmentNote = '';

    if (dbBuffer.length <= MAX_EMAIL_ATTACHMENT_SIZE) {
      attachments.push({ filename: dbFilename, content: dbBuffer });
    } else {
      attachmentNote += `<p style="color: #b45309;">La sauvegarde BDD (${dbSizeMo} Mo) depasse la limite email. Disponible sur R2.</p>`;
    }

    if (mediaResult.success && mediaResult.filename && mediaResult.size && mediaResult.zipBuffer) {
      if (mediaResult.size <= MAX_EMAIL_ATTACHMENT_SIZE) {
        attachments.push({ filename: mediaResult.filename, content: mediaResult.zipBuffer });
      } else {
        attachmentNote += `<p style="color: #b45309;">Le ZIP medias (${mediaSizeMo} Mo) depasse la limite email. Disponible sur R2.</p>`;
      }
    }

    try {
      await sendEmail({
        to: BACKUP_EMAIL,
        subject: `[MyJantes] Sauvegarde du ${dateFormatted} - BDD + Medias`,
        source: "backup",
        html: `
          <div style="background-color: #f4f4f5; padding: 40px 10px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e5e7eb;">
              <div style="padding: 30px;">
                ${getEmailHeader('MY JANTES')}
                <h2 style="color: #dc2626; text-align: center; font-size: 22px; margin-bottom: 20px;">Sauvegarde Quotidienne</h2>
                <p style="color: #4b5563; font-size: 14px;">Sauvegarde du <strong>${dateFormatted}</strong> a <strong>${timeFormatted}</strong>.</p>
                <p style="color: #6b7280; font-size: 13px;">La sauvegarde precedente a ete supprimee automatiquement.</p>
                
                <div style="background-color: #fef2f2; border: 1px solid #fee2e2; padding: 16px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="color: #991b1b; margin: 0 0 10px 0; font-size: 16px;">Base de donnees</h3>
                  <p style="margin: 4px 0; color: #4b5563;">Fichier : <strong>${dbFilename}</strong></p>
                  <p style="margin: 4px 0; color: #4b5563;">Taille : <strong>${dbSizeMo} Mo</strong></p>
                  <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; color: #4b5563;">
                    ${dbStats}
                  </table>
                </div>

                <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="color: #166534; margin: 0 0 10px 0; font-size: 16px;">Medias (photos devis/factures)</h3>
                  <p style="margin: 4px 0; color: #4b5563;">Fichier : <strong>${mediaResult.filename || 'Aucun media'}</strong></p>
                  <p style="margin: 4px 0; color: #4b5563;">Medias sauvegardes : <strong>${mediaCountStr}</strong></p>
                  <p style="margin: 4px 0; color: #4b5563;">Taille : <strong>${mediaSizeMo} Mo</strong></p>
                </div>

                ${attachmentNote ? `<div style="background-color: #fffbeb; border: 1px solid #fde68a; padding: 12px; border-radius: 8px; margin: 15px 0;">${attachmentNote}</div>` : ''}

                <p style="color: #6b7280; font-size: 12px; margin-top: 20px; text-align: center;">
                  ${attachments.length > 0 ? `${attachments.length} fichier(s) en piece jointe.` : 'Fichiers trop volumineux - disponibles sur R2.'}
                  <br/>Sauvegarde egalement stockee sur le bucket R2.
                </p>
              </div>
              ${getEmailFooter('MY JANTES')}
            </div>
          </div>
        `,
        attachments: attachments.length > 0 ? attachments : undefined
      });
      console.log(`[Backup] Email envoye a ${BACKUP_EMAIL} avec ${attachments.length} piece(s) jointe(s)`);
    } catch (emailErr: any) {
      console.error(`[Backup] Erreur envoi email:`, emailErr.message);
    }
    
    const dbFileExists = fs.existsSync(dbFilepath) && fs.statSync(dbFilepath).size > 0;
    const mediaOk = mediaResult.success === true;

    if (dbFileExists && mediaOk) {
      deleteOldFiles("backup_", ".json", dbFilename);
      if (mediaResult.filename) {
        deleteOldFiles("media_backup_", ".zip", mediaResult.filename);
      }
      console.log(`[Backup] Anciennes sauvegardes supprimees (nouvelle sauvegarde reussie)`);
    } else {
      console.log(`[Backup] Anciennes sauvegardes conservees (BDD ok: ${dbFileExists}, medias ok: ${mediaOk})`);
    }

    console.log(`[Backup] === Sauvegarde quotidienne terminee avec succes ===`);
    return { success: true, filename: dbFilename, filepath: dbFilepath, mediaResult };
  } catch (error: any) {
    console.error('[Backup] ECHEC sauvegarde:', error.message);
    return { success: false, error: error.message };
  }
}

export function updateBackupSchedule(settings: Partial<typeof backupSettings>) {
  backupSettings = { ...backupSettings, ...settings };
  
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
  
  if (backupSettings.enabled && backupSettings.time) {
    const [hours, minutes] = backupSettings.time.split(':');
    const cronExpression = `${minutes} ${hours} * * *`;
    
    scheduledTask = cron.schedule(cronExpression, performScheduledBackup, {
      timezone: 'Europe/Paris'
    });
    
    console.log(`[Backup] Sauvegarde quotidienne planifiee a ${backupSettings.time} (Europe/Paris) -> ${BACKUP_EMAIL}`);
  }
}

export function getBackupSettings() {
  return { ...backupSettings };
}

export async function listBackups() {
  ensureBackupsDir();
  
  const files = fs.readdirSync(BACKUPS_DIR)
    .filter(f => (f.startsWith('backup_') && f.endsWith('.json')) || (f.startsWith('media_backup_') && f.endsWith('.zip')))
    .map(filename => {
      const filepath = path.join(BACKUPS_DIR, filename);
      const stats = fs.statSync(filepath);
      return {
        filename,
        type: filename.startsWith('media_backup_') ? 'media' : 'database',
        size: stats.size,
        createdAt: stats.mtime.toISOString()
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  
  return files;
}

export async function triggerManualBackup() {
  return performScheduledBackup();
}

export function initBackupScheduler() {
  updateBackupSchedule(backupSettings);
  console.log(`[Backup] Service initialise (quotidien a 21h, sans cumul, email -> ${BACKUP_EMAIL})`);
}
