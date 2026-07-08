// Local authentication with email/password
import express, { type Express, type Request } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import { eq, sql, count, desc, inArray } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isAdmin, isSuperAdmin, verifyToken } from "./localAuth";
import { 
  insertServiceSchema, insertQuoteSchema, insertInvoiceSchema, insertReservationSchema, insertGarageSchema,
  type User, type InsertAuditLog,
  users, services, quotes, quoteItems, quoteMedia, invoices, invoiceItems, invoiceMedia,
  reservations, reservationServices, notifications, engagements, workflows, workflowSteps,
  serviceWorkflows, workshopTasks, applicationSettings, invoiceCounters,
  auditLogs, auditLogChanges, chatConversations, chatParticipants, chatMessages, chatAttachments, garages,
  reviews, repairOrders, ocrScans, accountingEntries, quoteRequests
} from "@shared/schema";
import { db } from "./db";
import { sendEmail, getEmailHeader, getEmailFooter, generateVoiceDictationEmailHtml } from "./emailService";
import { sendEventSms, sendSms, isFrenchMobile, getSmsLogs, getSmsStats, type SmsEventType } from "./smsService";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { ObjectStorageService } from "./objectStorage";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { uploadMedia, downloadMedia, deleteMedia, migrateLocalToObjectStorage } from "./mediaService";
import { setWsClient, removeWsClient, getWsClient, getWsClients, sendWsNotification, broadcastToUser } from "./wsClients";
import { tenantMiddleware } from "./tenantMiddleware";
import { createTenantStorage } from "./tenantStorage";
import { pool } from "./db";
import { getBaseUrl, buildUrl, getExternalBaseUrl, buildExternalUrl } from "./urlHelper";
import { registerDossierRoutes } from "./dossierRoutes";
import { mailingRouter } from "./mailingRoutes";

const objectStorageService = new ObjectStorageService();

const downloadFileFromPath = downloadMedia;
const deleteFileAtPath = deleteMedia;
const uploadToStorage = uploadMedia;


async function tenantQuery(req: any, queryText: string, params?: any[]): Promise<any> {
  if (req.tenantSchema) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO "${req.tenantSchema}", public`);
      const result = await client.query(queryText, params);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  return pool.query(queryText, params);
}

async function processMediaAfterCreation(
  mediaEntries: Array<{ id: string; filePath: string; fileType: string; fileName: string }>,
  reference: string,
  folder: string,
  updateFn: (mediaId: string, newPath: string, newFileName: string) => Promise<void>
): Promise<void> {
  const { addWatermarkToImage } = await import("./imageWatermark");
  
  for (let i = 0; i < mediaEntries.length; i++) {
    const entry = mediaEntries[i];
    const ext = path.extname(entry.fileName || entry.filePath) || '.jpg';
    const newFileName = `${reference}_${i + 1}${ext}`;
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(entry.fileName || entry.filePath);
    
    try {
      let fileData = await downloadFileFromPath(entry.filePath);
      if (!fileData) {
        console.warn(`[PostProcess] Could not download ${entry.filePath}, skipping`);
        continue;
      }
      
      if (isImage) {
        try {
          const mimeType = ext.toLowerCase().includes('png') ? 'image/png' : 
                           ext.toLowerCase().includes('webp') ? 'image/webp' : 'image/jpeg';
          fileData = await addWatermarkToImage(fileData, reference, mimeType);
          console.log(`[PostProcess] Watermark applied for ${reference} photo ${i + 1}`);
        } catch (wmErr) {
          console.error(`[PostProcess] Watermark failed for ${entry.id}:`, wmErr);
        }
      }
      
      const newPath = await uploadToStorage(fileData, newFileName, folder);
      
      const oldPath = entry.filePath;
      await updateFn(entry.id, newPath, newFileName);
      
      if (oldPath !== newPath) {
        await deleteFileAtPath(oldPath);
      }
      
      console.log(`[PostProcess] ${entry.filePath} -> ${newPath} (${newFileName})`);
    } catch (err) {
      console.error(`[PostProcess] Error processing media ${entry.id}:`, err);
    }
  }
}

const BACKUP_EMAIL_RECIPIENT = "mytoolslast@gmail.com";

const fetchMediaFileBuffer = downloadMedia;

async function sendMediaZipByEmail(
  type: "quote" | "invoice",
  entityId: string,
  reference: string
): Promise<void> {
  try {
    const mediaList = type === "quote"
      ? await storage.getQuoteMedia(entityId)
      : await storage.getInvoiceMedia(entityId);

    const imageMedia = mediaList.filter(m => m.fileType === "image");
    if (imageMedia.length === 0) {
      console.log(`[ZipEmail] No images for ${type} ${reference}, skipping`);
      return;
    }

    const archiver = (await import("archiver")).default;
    const { PassThrough } = await import("stream");

    const buffers: Buffer[] = [];
    const passThrough = new PassThrough();
    passThrough.on("data", (chunk: Buffer) => buffers.push(chunk));

    const archive = archiver("zip", { zlib: { level: 5 } });

    archive.on("warning", (err: Error) => console.warn("[ZipEmail] Archive warning:", err));
    archive.on("error", (err: Error) => { throw err; });

    archive.pipe(passThrough);

    for (let i = 0; i < imageMedia.length; i++) {
      const m = imageMedia[i];
      try {
        const buffer = await fetchMediaFileBuffer(m.filePath);
        if (buffer) {
          const ext = path.extname(m.fileName || ".jpg");
          const cleanName = `${reference}_${i + 1}${ext}`;
          archive.append(buffer, { name: cleanName });
        }
      } catch (fileErr) {
        console.error(`[ZipEmail] Error reading file ${m.filePath}:`, fileErr);
      }
    }

    await archive.finalize();
    await new Promise<void>((resolve, reject) => {
      passThrough.on("end", resolve);
      passThrough.on("error", reject);
    });

    const zipBuffer = Buffer.concat(buffers);
    const label = type === "quote" ? "Devis" : "Facture";
    const zipFileName = `photos_${reference}.zip`;

    const emailResult = await sendEmail({
      to: BACKUP_EMAIL_RECIPIENT,
      subject: `${label} ${reference} - Photos`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #dc2626;">${label} ${reference}</h2>
          <p>Veuillez trouver ci-joint les ${imageMedia.length} photo(s) du ${label.toLowerCase()} <strong>${reference}</strong>.</p>
          <p style="color: #666; font-size: 12px;">Envoi automatique - MY JANTES</p>
        </div>
      `,
      attachments: [{ filename: zipFileName, content: zipBuffer }],
    });

    if (emailResult.success) {
      console.log(`[ZipEmail] ZIP sent for ${type} ${reference} to ${BACKUP_EMAIL_RECIPIENT}`);
    } else {
      console.error(`[ZipEmail] Failed to send for ${type} ${reference}:`, emailResult.error);
    }
  } catch (err) {
    console.error(`[ZipEmail] Error creating/sending ZIP for ${type} ${reference}:`, err);
  }
}

// WebSocket clients map (shared via wsClients module)
const wsClients = getWsClients();

// Utility function to sanitize user objects (remove password)
function sanitizeUser<T extends User>(user: T): Omit<T, 'password'> {
  const { password, ...sanitized } = user;
  return sanitized;
}

function sanitizeUsers<T extends User>(users: T[]): Omit<T, 'password'>[] {
  return users.map(sanitizeUser);
}

// Multi-tenant garage scoping helper
function getGarageScope(user: User | undefined): string | undefined {
  return undefined;
}

// Check if user has access to a specific garage's resource
function hasGarageAccess(user: User | undefined, resourceGarageId: string | null | undefined): boolean {
  return true;
}

// Audit logging helper
type EntityType = "quote" | "invoice" | "reservation" | "service" | "workflow" | "workflow_step" | "user" | "workshop_task";
type ActionType = "created" | "updated" | "deleted" | "validated" | "rejected" | "completed" | "cancelled" | "paid" | "confirmed";

interface AuditContext {
  req: Request & { user?: User };
  entityType: EntityType;
  entityId: string;
  action: ActionType;
  summary: string;
  previousData?: Record<string, any>;
  newData?: Record<string, any>;
  metadata?: Record<string, any>;
}

async function logAuditEvent(ctx: AuditContext): Promise<void> {
  try {
    const user = ctx.req.user;
    
    // Compute field-level changes
    const changes: { field: string; previousValue: any; newValue: any }[] = [];
    if (ctx.previousData && ctx.newData) {
      const allKeys = Array.from(new Set([...Object.keys(ctx.previousData), ...Object.keys(ctx.newData)]));
      for (const key of allKeys) {
        const prev = ctx.previousData[key];
        const curr = ctx.newData[key];
        if (JSON.stringify(prev) !== JSON.stringify(curr)) {
          changes.push({ field: key, previousValue: prev, newValue: curr });
        }
      }
    }
    
    const logData: InsertAuditLog = {
      entityType: ctx.entityType,
      entityId: ctx.entityId,
      action: ctx.action,
      actorId: user?.id ?? null,
      actorRole: user?.role as any ?? null,
      actorName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : null,
      summary: ctx.summary,
      metadata: ctx.metadata ?? null,
      ipAddress: ctx.req.ip ?? ctx.req.socket?.remoteAddress ?? null,
      userAgent: ctx.req.headers['user-agent'] ?? null,
    };
    
    await storage.createAuditLog(logData, changes);
  } catch (error) {
    console.error("Error logging audit event:", error);
  }
}

// Helper to get action labels in French
const actionLabels: Record<ActionType, string> = {
  created: "créé",
  updated: "modifié",
  deleted: "supprimé",
  validated: "validé",
  rejected: "refusé",
  completed: "terminé",
  cancelled: "annulé",
  paid: "payé",
  confirmed: "confirmé",
};

const entityLabels: Record<EntityType, string> = {
  quote: "Devis",
  invoice: "Facture",
  reservation: "Réservation",
  service: "Service",
  workflow: "Workflow",
  workflow_step: "Étape de workflow",
  user: "Utilisateur",
  workshop_task: "Tâche atelier",
};

export async function registerRoutes(app: Express): Promise<Server> {
  // CORS for mobile app (React Native) and web
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || "").split(",").filter(Boolean);
    const replitDomains = process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN || "";

    let allowed = false;
    if (origin) {
      if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
        allowed = true;
      } else if (replitDomains && origin.includes(".replit.")) {
        allowed = true;
      } else if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
        allowed = true;
      } else if (origin.includes("myjantes")) {
        allowed = true;
      }
    }

    if (!origin) {
      res.setHeader("Access-Control-Allow-Origin", "*");
    } else if (allowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }

    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  // Servir les fichiers statiques du dossier uploads
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
  app.use('/public/uploads', express.static(path.join(process.cwd(), 'uploads')));

  app.get("/uploads/:filename", (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(process.cwd(), "uploads", filename);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ message: "Fichier non trouvé localement" });
    }
  });

  // Cloudflare R2 proxy route
  app.get("/r2/*", async (req, res) => {
    try {
      const key = (req.params as any)[0];
      if (!key) return res.status(400).json({ message: "Clé R2 manquante" });

      const { isCloudflareR2Configured, downloadFromR2 } = await import("./cloudflareR2Service");
      if (!isCloudflareR2Configured()) {
        return res.status(503).json({ message: "Cloudflare R2 non configuré" });
      }

      const { data, contentType } = await downloadFromR2(key);
      res.set("Content-Type", contentType);
      res.set("Cache-Control", "public, max-age=31536000, immutable");
      res.send(data);
    } catch (err: any) {
      console.error(`[R2Proxy] Error serving ${(req.params as any)[0]}:`, err.message);
      res.status(404).json({ message: "Fichier R2 non trouvé" });
    }
  });

  // Auth middleware
  await setupAuth(app);

  // Tenant middleware - resolves garage schema after auth
  app.use(tenantMiddleware());

  // Register object storage routes for persistent file uploads
  registerObjectStorageRoutes(app);

  // Register additional mobile routes (v2) FIRST so specific paths like
  // /api/mobile/reservations/availability win over v1's /:id wildcard.
  // v2 only adds new endpoints; it never overrides existing v1 ones.
  const { registerMobileRoutesV2 } = await import("./mobileRoutesV2");
  registerMobileRoutesV2(app);

  const { registerMobileRoutesV3 } = await import("./mobileRoutesV3");
  await registerMobileRoutesV3(app);

  // Register mobile API routes (v1) — used by the published iOS app.
  const { registerMobileRoutes } = await import("./mobileRoutes");
  registerMobileRoutes(app, uploadToStorage);

  // ========== TEST EMAIL BREVO ==========
  app.post("/api/admin/test-email", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { sendEmail } = await import("./emailService");
      const to = req.body?.to || req.user?.email || "rbelmahi90@gmail.com";
      const result = await sendEmail({
        to,
        subject: "✅ Test Brevo API — MyJantes",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:30px;background:#f9fafb;border-radius:12px;">
            <div style="background:#dc2626;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
              <h1 style="color:white;margin:0;font-size:22px;">MyJantes — Test Email Brevo</h1>
            </div>
            <div style="background:white;padding:25px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;">
              <p style="font-size:16px;color:#111;">✅ La configuration Brevo API fonctionne correctement.</p>
              <p style="color:#6b7280;font-size:14px;">Envoyé le : ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}</p>
              <p style="color:#6b7280;font-size:14px;">Destinataire : <strong>${to}</strong></p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
              <p style="color:#9ca3af;font-size:12px;text-align:center;">MyJantes — 46 rue de la Convention, 62800 Liévin</p>
            </div>
          </div>
        `,
      });
      if (result.success) {
        res.json({ success: true, message: `Email de test envoyé à ${to}`, messageId: result.messageId });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ========== PLAID BANK CONNECTION ROUTES ==========
  app.post("/api/plaid/create-link-token", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { createLinkToken } = await import("./plaidService");
      const userId = req.user.id;
      const linkToken = await createLinkToken(userId);
      res.json({ link_token: linkToken });
    } catch (error: any) {
      console.error("Plaid create link token error:", error);
      res.status(500).json({ message: "Erreur lors de la création du lien Plaid", error: error.message });
    }
  });

  app.post("/api/plaid/exchange-token", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { exchangePublicToken } = await import("./plaidService");
      const { public_token } = req.body;
      if (!public_token) {
        return res.status(400).json({ message: "public_token est requis" });
      }
      const result = await exchangePublicToken(public_token);
      res.json(result);
    } catch (error: any) {
      console.error("Plaid exchange token error:", error);
      res.status(500).json({ message: "Erreur lors de l'échange du token", error: error.message });
    }
  });

  app.get("/api/plaid/accounts", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { getAccounts } = await import("./plaidService");
      const accounts = await getAccounts();
      res.json({ accounts });
    } catch (error: any) {
      console.error("Plaid get accounts error:", error);
      res.status(500).json({ message: "Erreur lors de la récupération des comptes", error: error.message });
    }
  });

  app.get("/api/plaid/balances", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { getBalances } = await import("./plaidService");
      const accounts = await getBalances();
      res.json({ accounts });
    } catch (error: any) {
      console.error("Plaid get balances error:", error);
      res.status(500).json({ message: "Erreur lors de la récupération des soldes", error: error.message });
    }
  });

  // ── Bridge OpenBanking ───────────────────────────────────────────────────

  app.get("/api/bridge/status", isAuthenticated, isAdmin, async (_req, res) => {
    const { isBridgeConfigured } = await import("./bridgeService");
    res.json({ configured: isBridgeConfigured() });
  });

  app.post("/api/bridge/connect-session", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { createConnectSession, isBridgeConfigured } = await import("./bridgeService");
      if (!isBridgeConfigured()) {
        return res.status(503).json({ message: "Bridge non configuré. Vérifiez BRIDGE_CLIENT_ID et BRIDGE_CLIENT_SECRET." });
      }
      const bridgeEmail = req.query.email as string || "rbelmahi90@gmail.com";
      const origin = req.headers.origin || `https://${req.headers.host}`;
      const callbackUrl = `${origin}/admin/bridge-banking?connected=1&email=${encodeURIComponent(bridgeEmail)}`;
      const session = await createConnectSession(bridgeEmail, callbackUrl);
      res.json(session);
    } catch (err: any) {
      console.error("[Bridge] connect-session error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/bridge/items", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { listItems } = await import("./bridgeService");
      const bridgeEmail = req.query.email as string || "rbelmahi90@gmail.com";
      const items = await listItems(bridgeEmail);
      res.json({ items });
    } catch (err: any) {
      console.error("[Bridge] items error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/bridge/items/:itemId/refresh", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { refreshItem } = await import("./bridgeService");
      const bridgeEmail = req.query.email as string || "rbelmahi90@gmail.com";
      const item = await refreshItem(bridgeEmail, req.params.itemId);
      res.json({ item });
    } catch (err: any) {
      console.error("[Bridge] refresh error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/bridge/items/:itemId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { deleteItem } = await import("./bridgeService");
      const bridgeEmail = req.query.email as string || "rbelmahi90@gmail.com";
      await deleteItem(bridgeEmail, req.params.itemId);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[Bridge] delete item error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/bridge/accounts", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { listAccounts } = await import("./bridgeService");
      const bridgeEmail = req.query.email as string || "rbelmahi90@gmail.com";
      const accounts = await listAccounts(bridgeEmail);
      res.json({ accounts });
    } catch (err: any) {
      console.error("[Bridge] accounts error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/bridge/accounts/:accountId/transactions", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { listTransactions } = await import("./bridgeService");
      const bridgeEmail = req.query.email as string || "rbelmahi90@gmail.com";
      const limit = parseInt(req.query.limit as string) || 100;
      const transactions = await listTransactions(bridgeEmail, req.params.accountId, limit);
      res.json({ transactions });
    } catch (err: any) {
      console.error("[Bridge] transactions error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/bridge/dashboard", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { getDashboard } = await import("./bridgeService");
      const bridgeEmail = req.query.email as string || "rbelmahi90@gmail.com";
      const dashboard = await getDashboard(bridgeEmail);
      res.json(dashboard);
    } catch (err: any) {
      console.error("[Bridge] dashboard error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ── Bridge → Sync to Accounting ────────────────────────────────────────────

  app.post("/api/bridge/sync-to-accounting", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { listTransactions, listAccounts } = await import("./bridgeService");
      const { email, accountIds, dateFrom, dateTo } = req.body as {
        email: string;
        accountIds: (string | number)[];
        dateFrom?: string;
        dateTo?: string;
      };

      if (!email) return res.status(400).json({ message: "email requis" });

      const garageId = req.user?.garageId || null;
      const year = new Date().getFullYear();

      // Detect which Bridge tx IDs are already imported (sourceId starts with "bridge_")
      const existingEntries = await db
        .select({ sourceId: accountingEntries.sourceId })
        .from(accountingEntries)
        .where(sql`${accountingEntries.sourceId} LIKE 'bridge_%'`);
      const importedIds = new Set(existingEntries.map((e) => e.sourceId));

      const targetAccountIds = accountIds && accountIds.length > 0
        ? accountIds.map(String)
        : (await listAccounts(email)).map((a: any) => String(a.id));

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const accountId of targetAccountIds) {
        let transactions: any[] = [];
        try {
          transactions = await listTransactions(email, accountId, 200);
        } catch (e: any) {
          errors.push(`Compte ${accountId} : ${e.message}`);
          continue;
        }

        for (const tx of transactions) {
          const bridgeKey = `bridge_${tx.id}`;
          if (importedIds.has(bridgeKey)) { skipped++; continue; }

          // Date filter
          if (dateFrom && tx.date < dateFrom) { skipped++; continue; }
          if (dateTo && tx.date > dateTo) { skipped++; continue; }

          try {
            const entryNumber = await storage.getNextEntryNumber(
              new Date(tx.date).getFullYear() || year
            );
            const amount = Math.abs(tx.amount);
            const isCredit = tx.amount > 0;

            const entry = await storage.createAccountingEntry({
              garageId,
              entryNumber,
              date: new Date(tx.date),
              journal: "bank",
              sourceType: "manual",
              sourceId: bridgeKey,
              description: tx.label || "Transaction Bridge",
              totalDebit: String(amount),
              totalCredit: String(amount),
            });

            // Double-entry: bank account 512100 ↔ pending 471000
            if (isCredit) {
              // Money IN → DR 512100 Banque / CR 471000 Compte d'attente
              await storage.createAccountingLine({ entryId: entry.id, accountCode: "512100", accountLabel: "Banque compte courant", description: tx.label, debit: String(amount), credit: "0" });
              await storage.createAccountingLine({ entryId: entry.id, accountCode: "471000", accountLabel: "Compte d'attente - à régulariser", description: tx.label, debit: "0", credit: String(amount) });
            } else {
              // Money OUT → DR 471000 Compte d'attente / CR 512100 Banque
              await storage.createAccountingLine({ entryId: entry.id, accountCode: "471000", accountLabel: "Compte d'attente - à régulariser", description: tx.label, debit: String(amount), credit: "0" });
              await storage.createAccountingLine({ entryId: entry.id, accountCode: "512100", accountLabel: "Banque compte courant", description: tx.label, debit: "0", credit: String(amount) });
            }

            importedIds.add(bridgeKey);
            imported++;
          } catch (e: any) {
            errors.push(`Tx ${tx.id} : ${e.message}`);
          }
        }
      }

      res.json({ imported, skipped, errors });
    } catch (err: any) {
      console.error("[Bridge] sync-to-accounting error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // Preview transactions for sync (no import)
  app.post("/api/bridge/preview-sync", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { listTransactions } = await import("./bridgeService");
      const { email, accountIds, dateFrom, dateTo } = req.body as {
        email: string;
        accountIds: (string | number)[];
        dateFrom?: string;
        dateTo?: string;
      };

      const existingEntries = await db
        .select({ sourceId: accountingEntries.sourceId })
        .from(accountingEntries)
        .where(sql`${accountingEntries.sourceId} LIKE 'bridge_%'`);
      const importedIds = new Set(existingEntries.map((e) => e.sourceId));

      const allTransactions: any[] = [];
      for (const accountId of accountIds.map(String)) {
        try {
          const txs = await listTransactions(email, accountId, 200);
          for (const tx of txs) {
            if (dateFrom && tx.date < dateFrom) continue;
            if (dateTo && tx.date > dateTo) continue;
            allTransactions.push({
              ...tx,
              accountId,
              alreadyImported: importedIds.has(`bridge_${tx.id}`),
            });
          }
        } catch {}
      }

      allTransactions.sort((a, b) => b.date.localeCompare(a.date));
      res.json({ transactions: allTransactions });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Stripe Financial Connections ──────────────────────────────────────────

  app.post("/api/stripe-financial/create-session", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { createFinancialSession, isStripeFinancialConfigured } = await import("./stripeFinancialService");
      if (!isStripeFinancialConfigured()) {
        return res.status(503).json({ message: "Stripe non configuré. Ajoutez STRIPE_SECRET_KEY." });
      }
      const origin = req.headers.origin || `https://${req.headers.host}`;
      const returnUrl = `${origin}/admin/stripe-banking?session_complete=1`;
      const session = await createFinancialSession(returnUrl);
      res.json(session);
    } catch (error: any) {
      console.error("[StripeFinancial] create-session error:", error);
      res.status(500).json({ message: error.message || "Erreur lors de la création de la session" });
    }
  });

  app.post("/api/stripe-financial/retrieve-session", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { retrieveFinancialSession } = await import("./stripeFinancialService");
      const { session_id } = req.body;
      if (!session_id) return res.status(400).json({ message: "session_id requis" });
      const accountIds = await retrieveFinancialSession(session_id);
      res.json({ account_ids: accountIds, count: accountIds.length });
    } catch (error: any) {
      console.error("[StripeFinancial] retrieve-session error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/stripe-financial/accounts", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const { listConnectedAccounts } = await import("./stripeFinancialService");
      const accounts = await listConnectedAccounts();
      res.json({ accounts });
    } catch (error: any) {
      console.error("[StripeFinancial] accounts error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/stripe-financial/refresh-balance/:accountId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { refreshAccountBalance } = await import("./stripeFinancialService");
      const account = await refreshAccountBalance(req.params.accountId);
      res.json({ account });
    } catch (error: any) {
      console.error("[StripeFinancial] refresh-balance error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/stripe-financial/transactions/:accountId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { listTransactions } = await import("./stripeFinancialService");
      const limit = parseInt(req.query.limit as string) || 100;
      const transactions = await listTransactions(req.params.accountId, limit);
      res.json({ transactions });
    } catch (error: any) {
      console.error("[StripeFinancial] transactions error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/stripe-financial/accounts/:accountId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { disconnectAccount } = await import("./stripeFinancialService");
      await disconnectAccount(req.params.accountId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[StripeFinancial] disconnect error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/stripe-financial/status", isAuthenticated, isAdmin, async (_req, res) => {
    const { isStripeFinancialConfigured } = await import("./stripeFinancialService");
    res.json({ configured: isStripeFinancialConfigured() });
  });

  // Keep existing routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Sanitize user object - remove password before sending to client
      res.json(sanitizeUser(user));
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Forgot password - Request password reset
  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "L'email est requis" });
      }
      
      const user = await storage.getUserByEmail(email);
      
      // Always return success message to prevent email enumeration
      if (!user) {
        return res.json({ 
          message: "Si un compte existe avec cette adresse email, vous recevrez un lien de réinitialisation." 
        });
      }
      
      // Generate a secure token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      
      // Save the token
      await storage.createPasswordResetToken({
        userId: user.id,
        token,
        expiresAt,
      });
      
      // Get the base URL for the reset link
      const resetUrl = `${getExternalBaseUrl(req)}/reset-password/${token}`;
      
      // Send email
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Réinitialisation de mot de passe</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          ${getEmailHeader('MY JANTES')}
          
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #dc2626; margin-top: 0;">Réinitialisation de mot de passe</h2>
            
            <p>Bonjour ${user.firstName || user.email},</p>
            
            <p>Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe :</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #dc2626; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Réinitialiser mon mot de passe
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">Ce lien est valable pendant 1 heure.</p>
            
            <p style="color: #666; font-size: 14px;">Si vous n'avez pas demandé cette réinitialisation, vous pouvez ignorer cet email.</p>
            
            <p>Cordialement,<br><strong>L'équipe MY JANTES</strong></p>
          </div>
          
          ${getEmailFooter('MY JANTES')}
        </body>
        </html>
      `;
      
      const emailResult = await sendEmail({
        to: user.email,
        subject: "Réinitialisation de votre mot de passe - MY JANTES",
        html: emailHtml,
        text: `Bonjour, cliquez sur ce lien pour réinitialiser votre mot de passe: ${resetUrl}. Ce lien est valable 1 heure.`,
      });
      
      if (!emailResult.success) {
        console.error("Failed to send password reset email:", emailResult.error);
      }
      
      res.json({ 
        message: "Si un compte existe avec cette adresse email, vous recevrez un lien de réinitialisation." 
      });
    } catch (error) {
      console.error("Error in forgot-password:", error);
      res.status(500).json({ message: "Une erreur est survenue. Veuillez réessayer." });
    }
  });

  // Verify reset token
  app.get('/api/auth/reset-password/:token', async (req, res) => {
    try {
      const { token } = req.params;
      
      const resetToken = await storage.getPasswordResetToken(token);
      
      if (!resetToken) {
        return res.status(400).json({ valid: false, message: "Lien invalide ou expiré" });
      }
      
      if (resetToken.used) {
        return res.status(400).json({ valid: false, message: "Ce lien a déjà été utilisé" });
      }
      
      if (new Date() > new Date(resetToken.expiresAt)) {
        return res.status(400).json({ valid: false, message: "Ce lien a expiré" });
      }
      
      res.json({ valid: true });
    } catch (error) {
      console.error("Error verifying reset token:", error);
      res.status(500).json({ valid: false, message: "Une erreur est survenue" });
    }
  });

  // Reset password with token
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, password } = req.body;
      
      if (!token || !password) {
        return res.status(400).json({ message: "Token et mot de passe requis" });
      }
      
      if (password.length < 6) {
        return res.status(400).json({ message: "Le mot de passe doit contenir au moins 6 caractères" });
      }
      
      const resetToken = await storage.getPasswordResetToken(token);
      
      if (!resetToken) {
        return res.status(400).json({ message: "Lien invalide ou expiré" });
      }
      
      if (resetToken.used) {
        return res.status(400).json({ message: "Ce lien a déjà été utilisé" });
      }
      
      if (new Date() > new Date(resetToken.expiresAt)) {
        return res.status(400).json({ message: "Ce lien a expiré" });
      }
      
      // Hash the new password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Update user's password
      await storage.updateUser(resetToken.userId, { password: hashedPassword });
      
      // Mark token as used
      await storage.markPasswordResetTokenUsed(token);
      
      res.json({ message: "Mot de passe réinitialisé avec succès" });
    } catch (error) {
      console.error("Error resetting password:", error);
      res.status(500).json({ message: "Une erreur est survenue. Veuillez réessayer." });
    }
  });

  // ========== CSV IMPORT ROUTES ==========
  app.post("/api/admin/import/csv", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { table, data } = req.body;
      const validTables = ["users", "quotes", "invoices", "reservations"];
      
      if (!validTables.includes(table)) {
        return res.status(400).json({ message: "Table non supportée pour l'import" });
      }

      if (!Array.isArray(data) || data.length === 0) {
        return res.status(400).json({ message: "Données invalides" });
      }

      const { pool } = await import("./db");

      function camelToSnake(s: string): string {
        return s.replace(/([A-Z])/g, '_$1').toLowerCase();
      }

      const garageId = (req.user.role === "superadmin" || req.user.role === "root") ? null : req.user.garageId;
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const item of data) {
        try {
          if (garageId && !item.garageId) {
            item.garageId = garageId;
          }
          if (table === "users" && item.password) {
            item.password = await bcrypt.hash(item.password, 10);
          }
          if (table === "users" && !item.role) {
            item.role = "client";
          }
          if (!item.id) {
            const { v4: uuidv4 } = await import("uuid");
            item.id = uuidv4();
          }

          const entries = Object.entries(item).filter(([, v]) => v !== undefined && v !== '');
          if (entries.length === 0) continue;

          const cols = entries.map(([k]) => `"${camelToSnake(k)}"`);
          const placeholders = entries.map((_, i) => `$${i + 1}`);
          const values = entries.map(([, v]) => {
            if (v === null || v === 'NULL' || v === 'null') return null;
            if (typeof v === 'object') return JSON.stringify(v);
            return v;
          });

          const insertSQL = `INSERT INTO "${table}" (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT DO NOTHING`;
          const result = await pool.query(insertSQL, values);
          if (result.rowCount && result.rowCount > 0) {
            successCount++;
          }
        } catch (err: any) {
          errorCount++;
          if (errors.length < 5) {
            errors.push(err.message?.slice(0, 100) || 'Unknown error');
          }
          console.error(`[CSV Import] Error importing into ${table}:`, err.message?.slice(0, 150));
        }
      }

      res.json({ 
        message: "Import terminé", 
        successCount, 
        errorCount,
        total: data.length,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      console.error("[CSV Import] Global error:", error);
      res.status(500).json({ message: "Erreur lors de l'import CSV", error: error.message });
    }
  });

  // ========== ANALYTICS ROUTES ==========
  app.get("/api/admin/analytics", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      let garageId = (req.user?.role === "superadmin" || req.user?.role === "root") ? undefined : req.user?.garageId;
      if ((req.user?.role === "superadmin" || req.user?.role === "root") && req.query.garageId) {
        garageId = req.query.garageId as string;
      }
      const { startDate, endDate, paymentMethod, serviceId } = req.query;
      
      const allInvoices = await storage.getInvoices(undefined, garageId);
      const allQuotes = await storage.getQuotes(undefined, garageId);
      const allServices = await storage.getServices();
      const allReservations = await storage.getReservations(undefined, garageId);

      // Apply date filters if provided
      const dateStart = startDate ? new Date(startDate as string) : null;
      const dateEnd = endDate ? new Date(endDate as string) : null;
      
      let filteredInvoices = allInvoices;
      let filteredQuotes = allQuotes;
      
      if (dateStart) {
        filteredInvoices = filteredInvoices.filter(i => new Date(i.createdAt!) >= dateStart);
        filteredQuotes = filteredQuotes.filter(q => new Date(q.createdAt!) >= dateStart);
      }
      if (dateEnd) {
        const endOfDay = new Date(dateEnd);
        endOfDay.setHours(23, 59, 59, 999);
        filteredInvoices = filteredInvoices.filter(i => new Date(i.createdAt!) <= endOfDay);
        filteredQuotes = filteredQuotes.filter(q => new Date(q.createdAt!) <= endOfDay);
      }
      if (paymentMethod && paymentMethod !== 'all') {
        filteredInvoices = filteredInvoices.filter(i => i.paymentMethod === paymentMethod);
      }
      if (serviceId && serviceId !== 'all') {
        filteredQuotes = filteredQuotes.filter(q => q.serviceId === serviceId);
        const quoteIds = new Set(filteredQuotes.map(q => q.id));
        filteredInvoices = filteredInvoices.filter(i => i.quoteId && quoteIds.has(i.quoteId));
      }

      // Monthly revenue calculation (last 12 months) - uses filtered data
      const monthlyRevenue: Record<string, number> = {};
      const now = new Date();
      for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = d.toLocaleString('fr-FR', { month: 'short', year: 'numeric' });
        monthlyRevenue[monthKey] = 0;
      }

      filteredInvoices.filter(inv => inv.status === "paid").forEach(inv => {
        const createdDate = new Date(inv.createdAt!);
        const monthKey = createdDate.toLocaleString('fr-FR', { month: 'short', year: 'numeric' });
        if (monthlyRevenue.hasOwnProperty(monthKey)) {
          monthlyRevenue[monthKey] += parseFloat(inv.amount || "0");
        }
      });

      // Revenue by payment method - uses filtered data
      const revenueByPaymentMethod: Record<string, number> = {
        card: 0,
        wire_transfer: 0,
        cash: 0,
        check: 0
      };
      filteredInvoices.filter(i => i.status === "paid").forEach(inv => {
        const method = inv.paymentMethod || 'other';
        if (revenueByPaymentMethod.hasOwnProperty(method)) {
          revenueByPaymentMethod[method] += parseFloat(inv.amount || "0");
        }
      });

      // Revenue by service - uses filtered data
      const revenueByService: Record<string, { name: string; revenue: number; count: number }> = {};
      allServices.forEach(s => {
        revenueByService[s.id] = { name: s.name, revenue: 0, count: 0 };
      });
      
      filteredQuotes.forEach(q => {
        if (q.serviceId && revenueByService[q.serviceId]) {
          revenueByService[q.serviceId].count += 1;
        }
      });
      
      filteredInvoices.filter(i => i.status === "paid").forEach(inv => {
        const quote = filteredQuotes.find(q => q.id === inv.quoteId);
        if (quote?.serviceId && revenueByService[quote.serviceId]) {
          revenueByService[quote.serviceId].revenue += parseFloat(inv.amount || "0");
        }
      });

      // Weekly distribution (for last 4 weeks) - uses filtered data
      const weeklyRevenue: { week: string; revenue: number; invoices: number }[] = [];
      for (let i = 0; i < 4; i++) {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - (7 * (i + 1)));
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() - (7 * i));
        
        const weekInvoices = filteredInvoices.filter(inv => {
          const date = new Date(inv.createdAt!);
          return inv.status === "paid" && date >= weekStart && date < weekEnd;
        });
        
        weeklyRevenue.unshift({
          week: `S-${i}`,
          revenue: weekInvoices.reduce((sum, i) => sum + parseFloat(i.amount || "0"), 0),
          invoices: weekInvoices.length
        });
      }

      // Invoice status breakdown
      const invoiceStatusStats = {
        paid: filteredInvoices.filter(i => i.status === "paid").length,
        pending: filteredInvoices.filter(i => i.status === "pending").length,
        overdue: filteredInvoices.filter(i => i.status === "overdue").length,
        cancelled: filteredInvoices.filter(i => i.status === "cancelled").length,
      };

      // Quote status breakdown
      const quoteStatusStats = {
        pending: filteredQuotes.filter(q => q.status === "pending").length,
        approved: filteredQuotes.filter(q => q.status === "approved").length,
        accepted: filteredQuotes.filter(q => q.status === "accepted").length,
        rejected: filteredQuotes.filter(q => q.status === "rejected").length,
        completed: filteredQuotes.filter(q => q.status === "completed").length,
      };

      // Quote conversion rate
      const conversionRate = filteredQuotes.length > 0 
        ? ((filteredQuotes.filter(q => q.status === "approved" || q.status === "accepted" || q.status === "completed").length / filteredQuotes.length) * 100).toFixed(1)
        : "0";

      // Average invoice amount
      const paidInvoices = filteredInvoices.filter(i => i.status === "paid");
      const avgInvoiceAmount = paidInvoices.length > 0
        ? paidInvoices.reduce((sum, i) => sum + parseFloat(i.amount || "0"), 0) / paidInvoices.length
        : 0;

      const globalRevenue = filteredInvoices
        .filter(i => i.status === "paid")
        .reduce((sum, i) => sum + parseFloat(i.amount || "0"), 0);

      // Pending revenue (unpaid invoices)
      const pendingRevenue = filteredInvoices
        .filter(i => i.status === "pending" || i.status === "overdue")
        .reduce((sum, i) => sum + parseFloat(i.amount || "0"), 0);

      // Current month metrics (always based on current month, not filters)
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      
      const currentMonthInvoices = allInvoices.filter(i => {
        const date = new Date(i.createdAt!);
        return date >= currentMonthStart && date <= currentMonthEnd;
      });
      const currentMonthQuotes = allQuotes.filter(q => {
        const date = new Date(q.createdAt!);
        return date >= currentMonthStart && date <= currentMonthEnd;
      });
      
      const currentMonthRevenue = currentMonthInvoices
        .filter(i => i.status === "paid")
        .reduce((sum, i) => sum + parseFloat(i.amount || "0"), 0);
      
      const currentMonthPending = currentMonthInvoices
        .filter(i => i.status === "pending" || i.status === "overdue")
        .reduce((sum, i) => sum + parseFloat(i.amount || "0"), 0);
      
      const currentMonthInvoiceCount = currentMonthInvoices.length;
      const currentMonthQuoteCount = currentMonthQuotes.length;
      const currentMonthPaidCount = currentMonthInvoices.filter(i => i.status === "paid").length;
      
      // Last month comparison
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const lastMonthRevenue = allInvoices
        .filter(i => {
          const date = new Date(i.createdAt!);
          return i.status === "paid" && date >= lastMonthStart && date <= lastMonthEnd;
        })
        .reduce((sum, i) => sum + parseFloat(i.amount || "0"), 0);
      
      const revenueGrowth = lastMonthRevenue > 0 
        ? (((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(1)
        : currentMonthRevenue > 0 ? "100" : "0";

      // Get all unique clients for filter
      const allUsers = garageId ? await storage.getUsersByGarage(garageId) : await storage.getAllUsers();
      const clients = allUsers
        .filter(u => u.role === 'client')
        .map(u => ({ id: u.id, name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || 'Client' }));

      // Daily revenue for last 30 days
      const dailyRevenue: { date: string; revenue: number; invoices: number }[] = [];
      const dailyViews: { date: string; quotes: number; invoices: number }[] = [];

      for (let i = 29; i >= 0; i--) {
        const dayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dateStr = dayDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        const dayEnd = new Date(dayDate);
        dayEnd.setHours(23, 59, 59, 999);
        const dayStart = new Date(dayDate);
        dayStart.setHours(0, 0, 0, 0);
        
        const dayInvoices = filteredInvoices.filter(inv => {
          const date = new Date(inv.createdAt!);
          return date >= dayStart && date <= dayEnd;
        });

        dailyRevenue.push({
          date: dateStr,
          revenue: dayInvoices.filter(inv => inv.status === "paid").reduce((sum, inv) => sum + parseFloat(inv.amount || "0"), 0),
          invoices: dayInvoices.length,
        });

        const dayQuoteViews = filteredQuotes.filter(q => {
          if (!q.viewedAt) return false;
          const vDate = new Date(q.viewedAt);
          return vDate >= dayStart && vDate <= dayEnd;
        }).length;

        const dayInvoiceViews = filteredInvoices.filter(inv => {
          if (!inv.viewedAt) return false;
          const vDate = new Date(inv.viewedAt);
          return vDate >= dayStart && vDate <= dayEnd;
        }).length;

        dailyViews.push({
          date: dateStr,
          quotes: dayQuoteViews,
          invoices: dayInvoiceViews,
        });
      }

      // Get settings for daily objective
      const appSettings = await storage.getApplicationSettings();
      const dailyObjective = parseFloat((appSettings as any)?.dailyRevenueObjective || "0");

      res.json({
        monthlyRevenue: Object.entries(monthlyRevenue).reverse().map(([name, total]) => ({ name, total })),
        weeklyRevenue,
        dailyRevenue,
        dailyObjective,
        dailyViews,
        revenueByPaymentMethod: Object.entries(revenueByPaymentMethod).map(([method, amount]) => ({
          method: method === 'card' ? 'Carte' : method === 'wire_transfer' ? 'Virement' : method === 'cash' ? 'Espèces' : 'Chèque',
          amount
        })),
        revenueByService: Object.values(revenueByService).filter(s => s.count > 0 || s.revenue > 0),
        invoiceStatusStats,
        quoteStatusStats,
        globalRevenue,
        pendingRevenue,
        avgInvoiceAmount,
        conversionRate,
        totalInvoices: filteredInvoices.length,
        totalQuotes: filteredQuotes.length,
        totalReservations: allReservations.length,
        tracking: {
          quotesSent: allQuotes.filter(q => q.emailSentAt).length,
          quotesViewed: allQuotes.filter(q => q.viewedAt).length,
          quotesNotSent: allQuotes.filter(q => !q.emailSentAt).length,
          invoicesSent: allInvoices.filter(i => i.emailSentAt).length,
          invoicesViewed: allInvoices.filter(i => i.viewedAt).length,
          invoicesNotSent: allInvoices.filter(i => !i.emailSentAt).length,
        },
        services: allServices.map(s => ({ id: s.id, name: s.name })),
        clients,
        filterApplied: !!(startDate || endDate || (paymentMethod && paymentMethod !== 'all') || (serviceId && serviceId !== 'all')),
        filteredInvoiceIds: filteredInvoices.map(i => i.id),
        filteredQuoteIds: filteredQuotes.map(q => q.id),
        currentMonth: {
          revenue: currentMonthRevenue,
          pending: currentMonthPending,
          invoiceCount: currentMonthInvoiceCount,
          quoteCount: currentMonthQuoteCount,
          paidCount: currentMonthPaidCount,
          growth: revenueGrowth,
          monthName: now.toLocaleString('fr-FR', { month: 'long', year: 'numeric' })
        }
      });
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // ========== ADVANCED ANALYTICS ==========
  app.get("/api/admin/advanced-analytics", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageId = (req.user?.role === "superadmin" || req.user?.role === "root") ? undefined : req.user?.garageId;
      const allInvoices = await storage.getInvoices(undefined, garageId);
      const allQuotes = await storage.getQuotes(undefined, garageId);
      const allServices = await storage.getServices();
      const allReservations = await storage.getReservations(undefined, garageId);
      const allUsers = garageId ? await storage.getUsersByGarage(garageId) : await storage.getAllUsers();
      const clients = allUsers.filter(u => u.role === 'client');

      const now = new Date();
      const paidInvoices = allInvoices.filter(i => i.status === "paid");

      // ---- 1. SERVICE TRENDS (12 months) ----
      const serviceMonthlyData: Record<string, Record<string, { revenue: number; count: number }>> = {};
      allServices.forEach(s => { serviceMonthlyData[s.id] = {}; });

      for (let m = 0; m < 12; m++) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - m, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - m + 1, 0, 23, 59, 59, 999);
        const monthKey = monthStart.toLocaleString('fr-FR', { month: 'short', year: '2-digit' });

        allServices.forEach(s => {
          const sQuotes = allQuotes.filter(q => q.serviceId === s.id);
          const sQuoteIds = new Set(sQuotes.map(q => q.id));
          const monthInvoices = paidInvoices.filter(inv => {
            const d = new Date(inv.createdAt!);
            return d >= monthStart && d <= monthEnd && inv.quoteId && sQuoteIds.has(inv.quoteId);
          });
          const monthQuotes = sQuotes.filter(q => {
            const d = new Date(q.createdAt!);
            return d >= monthStart && d <= monthEnd;
          });
          serviceMonthlyData[s.id][monthKey] = {
            revenue: monthInvoices.reduce((sum, i) => sum + parseFloat(i.amount || "0"), 0),
            count: monthQuotes.length
          };
        });
      }

      const serviceTrends = allServices.map(s => {
        const months = Object.entries(serviceMonthlyData[s.id]).reverse();
        const totalRevenue = months.reduce((sum, [, d]) => sum + d.revenue, 0);
        const totalCount = months.reduce((sum, [, d]) => sum + d.count, 0);
        const recentHalf = months.slice(Math.floor(months.length / 2));
        const olderHalf = months.slice(0, Math.floor(months.length / 2));
        const recentRevenue = recentHalf.reduce((sum, [, d]) => sum + d.revenue, 0);
        const olderRevenue = olderHalf.reduce((sum, [, d]) => sum + d.revenue, 0);
        const trend = olderRevenue > 0 ? ((recentRevenue - olderRevenue) / olderRevenue * 100) : (recentRevenue > 0 ? 100 : 0);
        return {
          id: s.id,
          name: s.name,
          totalRevenue,
          totalCount,
          trend: parseFloat(trend.toFixed(1)),
          monthly: months.map(([month, d]) => ({ month, revenue: d.revenue, count: d.count })),
        };
      }).filter(s => s.totalRevenue > 0 || s.totalCount > 0).sort((a, b) => b.totalRevenue - a.totalRevenue);

      // Top & declining services
      const topServices = [...serviceTrends].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 5);
      const decliningServices = [...serviceTrends].filter(s => s.trend < 0).sort((a, b) => a.trend - b.trend).slice(0, 5);
      const growingServices = [...serviceTrends].filter(s => s.trend > 0).sort((a, b) => b.trend - a.trend).slice(0, 5);

      // ---- 2. FINANCIAL PERFORMANCE ----
      // Monthly cash flow (12 months)
      const cashFlow: { month: string; income: number; expenses: number; net: number }[] = [];
      for (let m = 11; m >= 0; m--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - m, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - m + 1, 0, 23, 59, 59, 999);
        const monthKey = monthStart.toLocaleString('fr-FR', { month: 'short', year: '2-digit' });
        const income = paidInvoices.filter(inv => {
          const d = new Date(inv.createdAt!);
          return d >= monthStart && d <= monthEnd;
        }).reduce((sum, i) => sum + parseFloat(i.amount || "0"), 0);
        cashFlow.push({ month: monthKey, income, expenses: 0, net: income });
      }

      // Revenue forecasting (next 3 months based on trailing 3m average)
      const last3Months = cashFlow.slice(-3);
      const avg3m = last3Months.reduce((sum, m) => sum + m.income, 0) / 3;
      const forecast: { month: string; projected: number; optimistic: number; pessimistic: number }[] = [];
      for (let m = 1; m <= 3; m++) {
        const futureMonth = new Date(now.getFullYear(), now.getMonth() + m, 1);
        const monthKey = futureMonth.toLocaleString('fr-FR', { month: 'short', year: '2-digit' });
        forecast.push({
          month: monthKey,
          projected: Math.round(avg3m),
          optimistic: Math.round(avg3m * 1.2),
          pessimistic: Math.round(avg3m * 0.8),
        });
      }

      // Payment timing analysis
      const paymentDelays: number[] = [];
      paidInvoices.forEach(inv => {
        if (inv.createdAt && inv.paidAt) {
          const created = new Date(inv.createdAt);
          const paid = new Date(inv.paidAt);
          const days = Math.max(0, Math.floor((paid.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)));
          paymentDelays.push(days);
        }
      });
      const avgPaymentDelay = paymentDelays.length > 0 ? paymentDelays.reduce((s, d) => s + d, 0) / paymentDelays.length : 0;
      const medianPaymentDelay = paymentDelays.length > 0 ? paymentDelays.sort((a, b) => a - b)[Math.floor(paymentDelays.length / 2)] : 0;

      // Revenue by quarter
      const quarterlyRevenue: { quarter: string; revenue: number; invoiceCount: number }[] = [];
      for (let q = 3; q >= 0; q--) {
        const qStart = new Date(now.getFullYear(), now.getMonth() - (q * 3 + 2), 1);
        const qEnd = new Date(now.getFullYear(), now.getMonth() - (q * 3) + 1, 0, 23, 59, 59, 999);
        const qLabel = `T${Math.floor(qStart.getMonth() / 3) + 1} ${qStart.getFullYear()}`;
        const qInvoices = paidInvoices.filter(inv => {
          const d = new Date(inv.createdAt!);
          return d >= qStart && d <= qEnd;
        });
        quarterlyRevenue.push({
          quarter: qLabel,
          revenue: qInvoices.reduce((sum, i) => sum + parseFloat(i.amount || "0"), 0),
          invoiceCount: qInvoices.length,
        });
      }

      // Invoice amount distribution
      const amountRanges = [
        { label: '0-100€', min: 0, max: 100 },
        { label: '100-300€', min: 100, max: 300 },
        { label: '300-500€', min: 300, max: 500 },
        { label: '500-1000€', min: 500, max: 1000 },
        { label: '1000-2000€', min: 1000, max: 2000 },
        { label: '2000€+', min: 2000, max: Infinity },
      ];
      const amountDistribution = amountRanges.map(r => ({
        range: r.label,
        count: paidInvoices.filter(i => {
          const amt = parseFloat(i.amount || "0");
          return amt >= r.min && amt < r.max;
        }).length,
      }));

      // ---- 3. CLIENT ANALYTICS ----
      const clientRevenue: Record<string, { name: string; email: string; revenue: number; invoiceCount: number; quoteCount: number; firstDate: Date | null; lastDate: Date | null }> = {};
      clients.forEach(c => {
        clientRevenue[c.id] = {
          name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email || 'Client',
          email: c.email || '',
          revenue: 0,
          invoiceCount: 0,
          quoteCount: 0,
          firstDate: null,
          lastDate: null,
        };
      });

      paidInvoices.forEach(inv => {
        if (inv.clientId && clientRevenue[inv.clientId]) {
          const cr = clientRevenue[inv.clientId];
          const amt = parseFloat(inv.amount || "0");
          cr.revenue += amt;
          cr.invoiceCount += 1;
          const d = new Date(inv.createdAt!);
          if (!cr.firstDate || d < cr.firstDate) cr.firstDate = d;
          if (!cr.lastDate || d > cr.lastDate) cr.lastDate = d;
        }
      });

      allQuotes.forEach(q => {
        if (q.clientId && clientRevenue[q.clientId]) {
          clientRevenue[q.clientId].quoteCount += 1;
        }
      });

      const topClients = Object.values(clientRevenue)
        .filter(c => c.revenue > 0)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)
        .map(c => ({
          name: c.name,
          email: c.email,
          revenue: c.revenue,
          invoiceCount: c.invoiceCount,
          quoteCount: c.quoteCount,
          avgInvoice: c.invoiceCount > 0 ? Math.round(c.revenue / c.invoiceCount) : 0,
        }));

      // Client acquisition by month (first activity = first quote or invoice date)
      const clientFirstActivity: Record<string, Date> = {};
      allQuotes.forEach(q => {
        if (q.clientId) {
          const d = new Date(q.createdAt!);
          if (!clientFirstActivity[q.clientId] || d < clientFirstActivity[q.clientId]) {
            clientFirstActivity[q.clientId] = d;
          }
        }
      });
      allInvoices.forEach(inv => {
        if (inv.clientId) {
          const d = new Date(inv.createdAt!);
          if (!clientFirstActivity[inv.clientId] || d < clientFirstActivity[inv.clientId]) {
            clientFirstActivity[inv.clientId] = d;
          }
        }
      });

      const clientAcquisition: { month: string; newClients: number }[] = [];
      for (let m = 11; m >= 0; m--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - m, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - m + 1, 0, 23, 59, 59, 999);
        const monthKey = monthStart.toLocaleString('fr-FR', { month: 'short', year: '2-digit' });
        const newClients = Object.values(clientFirstActivity).filter(d => d >= monthStart && d <= monthEnd).length;
        clientAcquisition.push({ month: monthKey, newClients });
      }

      // Retention: clients with >1 invoice
      const returningClients = Object.values(clientRevenue).filter(c => c.invoiceCount > 1).length;
      const totalActiveClients = Object.values(clientRevenue).filter(c => c.invoiceCount > 0).length;
      const retentionRate = totalActiveClients > 0 ? ((returningClients / totalActiveClients) * 100).toFixed(1) : "0";

      // ---- 4. CONVERSION FUNNEL ----
      const totalQuotes = allQuotes.length;
      const approvedQuotes = allQuotes.filter(q => ["approved", "accepted", "completed"].includes(q.status || "")).length;
      const invoicedQuotes = allQuotes.filter(q => allInvoices.some(i => i.quoteId === q.id)).length;
      const paidQuotes = allQuotes.filter(q => paidInvoices.some(i => i.quoteId === q.id)).length;

      const conversionFunnel = [
        { stage: 'Devis créés', count: totalQuotes, percentage: 100 },
        { stage: 'Devis approuvés', count: approvedQuotes, percentage: totalQuotes > 0 ? parseFloat(((approvedQuotes / totalQuotes) * 100).toFixed(1)) : 0 },
        { stage: 'Facturés', count: invoicedQuotes, percentage: totalQuotes > 0 ? parseFloat(((invoicedQuotes / totalQuotes) * 100).toFixed(1)) : 0 },
        { stage: 'Payés', count: paidQuotes, percentage: totalQuotes > 0 ? parseFloat(((paidQuotes / totalQuotes) * 100).toFixed(1)) : 0 },
      ];

      // ---- 5. SEASONAL PATTERNS (day of week) ----
      const dayOfWeekRevenue: Record<string, { revenue: number; count: number }> = {
        'Lun': { revenue: 0, count: 0 }, 'Mar': { revenue: 0, count: 0 },
        'Mer': { revenue: 0, count: 0 }, 'Jeu': { revenue: 0, count: 0 },
        'Ven': { revenue: 0, count: 0 }, 'Sam': { revenue: 0, count: 0 },
        'Dim': { revenue: 0, count: 0 },
      };
      const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
      paidInvoices.forEach(inv => {
        const d = new Date(inv.createdAt!);
        const dayName = dayNames[d.getDay()];
        dayOfWeekRevenue[dayName].revenue += parseFloat(inv.amount || "0");
        dayOfWeekRevenue[dayName].count += 1;
      });
      const weekdayDistribution = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => ({
        day,
        revenue: Math.round(dayOfWeekRevenue[day].revenue),
        count: dayOfWeekRevenue[day].count,
      }));

      // ---- 6. SUMMARY KPIs ----
      const totalRevenue = paidInvoices.reduce((sum, i) => sum + parseFloat(i.amount || "0"), 0);
      const paidAmount = totalRevenue;
      const pendingAmount = allInvoices.filter(i => i.status === "pending" || i.status === "overdue").reduce((sum, i) => sum + parseFloat(i.amount || "0"), 0);
      const forecastAmount = allQuotes.filter(q => q.status === "pending" || q.status === "approved").reduce((sum, i) => sum + parseFloat((i as any).quoteAmount || i.amount || "0"), 0);
      const avgTicket = paidInvoices.length > 0 ? totalRevenue / paidInvoices.length : 0;
      const overdueCount = allInvoices.filter(i => i.status === "overdue").length;

      res.json({
        serviceTrends,
        topServices,
        decliningServices,
        growingServices,
        cashFlow,
        forecast,
        quarterlyRevenue,
        amountDistribution,
        avgPaymentDelay: parseFloat(avgPaymentDelay.toFixed(1)),
        medianPaymentDelay,
        topClients,
        clientAcquisition,
        returningClients,
        totalActiveClients,
        retentionRate: parseFloat(retentionRate),
        conversionFunnel,
        weekdayDistribution,
        summary: {
          totalRevenue: Math.round(totalRevenue),
          paidAmount: Math.round(paidAmount),
          pendingAmount: Math.round(pendingAmount),
          forecastAmount: Math.round(forecastAmount),
          avgTicket: Math.round(avgTicket),
          overdueCount,
          totalClients: allUsers.length,
          totalActiveClients,
          totalServices: allServices.length,
          totalQuotes,
          totalInvoices: allInvoices.length,
          paidInvoices: paidInvoices.length,
        }
      });
    } catch (error) {
      console.error("Error fetching advanced analytics:", error);
      res.status(500).json({ message: "Failed to fetch advanced analytics" });
    }
  });

  // ========== GARAGE ROUTES (Multi-tenant - Super Admin only) ==========
  
  // Get all garages (superadmin only)
  app.get("/api/superadmin/garages", isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
      const allGarages = await storage.getGarages();
      res.json(allGarages);
    } catch (error) {
      console.error("Error fetching garages:", error);
      res.status(500).json({ message: "Failed to fetch garages" });
    }
  });

  // Get single garage
  app.get("/api/superadmin/garages/:id", isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
      const garage = await storage.getGarage(req.params.id);
      if (!garage) {
        return res.status(404).json({ message: "Garage not found" });
      }
      res.json(garage);
    } catch (error) {
      console.error("Error fetching garage:", error);
      res.status(500).json({ message: "Failed to fetch garage" });
    }
  });

  // Create garage (superadmin only)
  app.post("/api/superadmin/garages", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      const validatedData = insertGarageSchema.parse(req.body);
      const garage = await storage.createGarage(validatedData);
      res.status(201).json(garage);
    } catch (error) {
      console.error("Error creating garage:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create garage" });
    }
  });

  // Update garage (superadmin only)
  app.patch("/api/superadmin/garages/:id", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      const garage = await storage.updateGarage(req.params.id, req.body);
      res.json(garage);
    } catch (error) {
      console.error("Error updating garage:", error);
      res.status(500).json({ message: "Failed to update garage" });
    }
  });

  app.get("/api/garages/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garage = await storage.getGarage(req.params.id);
      if (!garage) return res.status(404).json({ message: "Garage non trouvé" });
      if (!hasGarageAccess(req.user, garage.id)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }
      res.json(garage);
    } catch (error) {
      console.error("Error fetching garage:", error);
      res.status(500).json({ message: "Failed to fetch garage" });
    }
  });

  app.patch("/api/garages/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garage = await storage.getGarage(req.params.id);
      if (!garage) return res.status(404).json({ message: "Garage non trouvé" });
      if (!hasGarageAccess(req.user, garage.id)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }
      const updated = await storage.updateGarage(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating garage:", error);
      res.status(500).json({ message: "Failed to update garage" });
    }
  });

  // Delete garage (superadmin only)
  app.delete("/api/superadmin/garages/:id", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      await storage.deleteGarage(req.params.id);
      res.json({ message: "Garage deleted successfully" });
    } catch (error) {
      console.error("Error deleting garage:", error);
      res.status(500).json({ message: "Failed to delete garage" });
    }
  });

  // Get users by garage (superadmin only)
  app.get("/api/superadmin/garages/:id/users", isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
      const garageUsers = await storage.getUsersByGarage(req.params.id);
      res.json(garageUsers);
    } catch (error) {
      console.error("Error fetching garage users:", error);
      res.status(500).json({ message: "Failed to fetch garage users" });
    }
  });

  // Assign user to garage (superadmin only)
  app.post("/api/superadmin/garages/:garageId/users/:userId", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      const user = await storage.updateUser(req.params.userId, { garageId: req.params.garageId });
      res.json(user);
    } catch (error) {
      console.error("Error assigning user to garage:", error);
      res.status(500).json({ message: "Failed to assign user to garage" });
    }
  });

  // Remove user from garage (superadmin only)
  app.delete("/api/superadmin/garages/:garageId/users/:userId", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      const user = await storage.updateUser(req.params.userId, { garageId: null });
      res.json(user);
    } catch (error) {
      console.error("Error removing user from garage:", error);
      res.status(500).json({ message: "Failed to remove user from garage" });
    }
  });

  app.get("/api/superadmin/garage-stats", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      const allGarages = await storage.getGarages();
      const allUsers = await storage.getAllUsers();

      const garageStats = await Promise.all(allGarages.map(async (garage) => {
        const schemaName = `garage_${garage.slug.replace(/-/g, "_")}`;
        const client = await pool.connect();
        try {
          const schemaExists = await client.query(
            `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`, [schemaName]
          );

          let invoiceCount = 0, paidInvoices = 0, quoteCount = 0, reservationCount = 0;
          let revenue = 0, pendingRevenue = 0, monthRevenue = 0;

          if (schemaExists.rows.length > 0) {
            await client.query('BEGIN');
            await client.query(`SET LOCAL search_path TO "${schemaName}", public`);

            const invResult = await client.query(`SELECT status, amount, created_at FROM invoices`);
            const invRows = invResult.rows;
            invoiceCount = invRows.length;
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

            for (const inv of invRows) {
              const amt = parseFloat(inv.amount || "0");
              if (inv.status === "paid") {
                revenue += amt;
                paidInvoices++;
                if (new Date(inv.created_at) >= currentMonthStart) monthRevenue += amt;
              }
              if (inv.status === "pending" || inv.status === "overdue") {
                pendingRevenue += amt;
              }
            }

            const qResult = await client.query(`SELECT COUNT(*) as cnt FROM quotes`);
            quoteCount = parseInt(qResult.rows[0].cnt);

            const rResult = await client.query(`SELECT COUNT(*) as cnt FROM reservations`);
            reservationCount = parseInt(rResult.rows[0].cnt);

            await client.query('COMMIT');
          }

          const gClients = allUsers.filter(u => u.garageId === garage.id && u.role === "client");

          return {
            garageId: garage.id,
            garageName: garage.name,
            garageSlug: garage.slug,
            isActive: garage.isActive,
            schemaReady: schemaExists.rows.length > 0,
            totalRevenue: revenue,
            pendingRevenue,
            monthRevenue,
            totalInvoices: invoiceCount,
            paidInvoices,
            totalQuotes: quoteCount,
            totalReservations: reservationCount,
            totalClients: gClients.length,
          };
        } finally {
          client.release();
        }
      }));

      const totalRevenue = garageStats.reduce((s, g) => s + g.totalRevenue, 0);
      const totalMonthRevenue = garageStats.reduce((s, g) => s + g.monthRevenue, 0);

      res.json({
        totalGarages: allGarages.length,
        activeGarages: allGarages.filter(g => g.isActive).length,
        totalRevenue,
        totalMonthRevenue,
        garages: garageStats,
      });
    } catch (error: any) {
      console.error("Error fetching garage stats:", error);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  // Superadmin: switch active garage (stores in session)
  app.post("/api/superadmin/select-garage", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      const { garageId } = req.body;
      if (garageId) {
        const garage = await storage.getGarage(garageId);
        if (!garage) return res.status(404).json({ message: "Garage non trouvé" });
        req.session.selectedGarageId = garageId;
        req.session.selectedGarageSlug = garage.slug;
        res.json({ success: true, garage: { id: garage.id, name: garage.name, slug: garage.slug } });
      } else {
        req.session.selectedGarageId = null;
        req.session.selectedGarageSlug = null;
        res.json({ success: true, garage: null });
      }
    } catch (error: any) {
      console.error("Error selecting garage:", error);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  app.get("/api/superadmin/selected-garage", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      const garageId = req.session?.selectedGarageId;
      if (garageId) {
        const garage = await storage.getGarage(garageId);
        res.json({ garage: garage ? { id: garage.id, name: garage.name, slug: garage.slug } : null });
      } else {
        res.json({ garage: null });
      }
    } catch (error: any) {
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  // Tenant schema management
  app.post("/api/superadmin/tenant/setup", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      const { createTenantSchema, migrateDataToTenantSchema } = await import("./tenantContext");
      const allGarages = await storage.getGarages();
      const results: any[] = [];

      for (const garage of allGarages) {
        console.log(`[Tenant] Setting up schema for garage: ${garage.name} (${garage.slug})`);
        await createTenantSchema(garage.slug);
        const migrationResults = await migrateDataToTenantSchema(garage.id, garage.slug);
        results.push({
          garage: garage.name,
          slug: garage.slug,
          schema: `garage_${garage.slug.replace(/-/g, "_")}`,
          tables: migrationResults,
        });
      }

      res.json({ success: true, results });
    } catch (error: any) {
      console.error("[Tenant] Setup error:", error);
      res.status(500).json({ message: "Erreur lors de la configuration des schémas: " + error.message });
    }
  });

  app.get("/api/superadmin/tenant/status", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      const { pool } = await import("./db");
      const { getSchemaName } = await import("./tenantContext");
      const allGarages = await storage.getGarages();
      const statuses: any[] = [];

      for (const garage of allGarages) {
        const schemaName = getSchemaName(garage.slug);
        const schemaExists = await pool.query(
          `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
          [schemaName]
        );
        
        let tableCount = 0;
        let dataStats: Record<string, number> = {};
        if (schemaExists.rows.length > 0) {
          const tables = await pool.query(
            `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
            [schemaName]
          );
          tableCount = tables.rows.length;

          for (const t of ["services", "quotes", "invoices", "reservations", "reviews"]) {
            try {
              const cnt = await pool.query(`SELECT COUNT(*) as cnt FROM "${schemaName}"."${t}"`);
              dataStats[t] = parseInt(cnt.rows[0].cnt);
            } catch { dataStats[t] = 0; }
          }
        }

        statuses.push({
          garageId: garage.id,
          garageName: garage.name,
          slug: garage.slug,
          schemaName,
          schemaExists: schemaExists.rows.length > 0,
          tableCount,
          dataStats,
        });
      }

      res.json({ tenants: statuses });
    } catch (error: any) {
      console.error("[Tenant] Status error:", error);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  // Service routes (public read, admin write)
  app.get("/api/services", isAuthenticated, async (req: any, res) => {
    try {
      if (req.tenantSchema) {
        const ts = createTenantStorage(req.tenantGarageSlug);
        return res.json(await ts.getServices());
      }
      const services = await storage.getServices();
      res.json(services);
    } catch (error) {
      console.error("Error fetching services:", error);
      res.status(500).json({ message: "Failed to fetch services" });
    }
  });

  app.get("/api/admin/services", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      if (req.tenantSchema) {
        const ts = createTenantStorage(req.tenantGarageSlug);
        return res.json(await ts.getAllServices());
      }
      const services = await storage.getServices();
      res.json(services);
    } catch (error) {
      console.error("Error fetching services:", error);
      res.status(500).json({ message: "Failed to fetch services" });
    }
  });

  app.post("/api/admin/services", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const validatedData = insertServiceSchema.parse(req.body);
      const service = await storage.createService(validatedData);
      
      // Automatically create a workflow for the service with default steps
      const workflow = await storage.createWorkflow({
        name: `Workflow - ${service.name}`,
        description: `Workflow pour le service ${service.name}`,
        serviceId: service.id,
      });
      
      const defaultSteps = [
        { stepNumber: 1, title: "Réception du véhicule", description: "Accueil client et prise en charge du véhicule" },
        { stepNumber: 2, title: "Ordre de réparation", description: "État des lieux du véhicule avant intervention" },
        { stepNumber: 3, title: "Diagnostic", description: "Inspection technique et diagnostic" },
        { stepNumber: 4, title: "Préparation", description: "Préparation des pièces et outils" },
        { stepNumber: 5, title: "Intervention", description: "Réalisation des travaux" },
        { stepNumber: 6, title: "Contrôle qualité", description: "Vérification de la qualité" },
        { stepNumber: 7, title: "Nettoyage", description: "Nettoyage du véhicule" },
        { stepNumber: 8, title: "Restitution", description: "Remise du véhicule au client" },
      ];
      for (const step of defaultSteps) {
        await storage.createWorkflowStep({ workflowId: workflow.id, ...step });
      }
      
      // Log audit event
      await logAuditEvent({
        req,
        entityType: "service",
        entityId: service.id,
        action: "created",
        summary: `${entityLabels.service} "${service.name}" ${actionLabels.created} avec workflow associé (${defaultSteps.length} étapes)`,
        newData: service,
        metadata: { workflowId: workflow.id },
      });
      
      res.json(service);
    } catch (error: any) {
      console.error("Error creating service:", error);
      res.status(400).json({ message: error.message || "Failed to create service" });
    }
  });

  app.patch("/api/admin/services/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const previousService = await storage.getService(id);
      const service = await storage.updateService(id, req.body);
      
      // Log audit event
      await logAuditEvent({
        req,
        entityType: "service",
        entityId: service.id,
        action: "updated",
        summary: `${entityLabels.service} "${service.name}" ${actionLabels.updated}`,
        previousData: previousService,
        newData: service,
      });
      
      res.json(service);
    } catch (error) {
      console.error("Error updating service:", error);
      res.status(500).json({ message: "Failed to update service" });
    }
  });

  app.delete("/api/admin/services/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const previousService = await storage.getService(id);
      await storage.deleteService(id);
      
      // Log audit event
      await logAuditEvent({
        req,
        entityType: "service",
        entityId: id,
        action: "deleted",
        summary: `${entityLabels.service} "${previousService?.name || id}" ${actionLabels.deleted}`,
        previousData: previousService,
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting service:", error);
      res.status(500).json({ message: "Failed to delete service" });
    }
  });

  // Quote routes
  app.get("/api/quotes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const quotes = await storage.getQuotes(userId);
      res.json(quotes);
    } catch (error) {
      console.error("Error fetching quotes:", error);
      res.status(500).json({ message: "Failed to fetch quotes" });
    }
  });

  app.post("/api/quotes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { mediaFiles, ...quoteData } = req.body;
      
      // Validate minimum 1 image requirement
      if (!mediaFiles || !Array.isArray(mediaFiles)) {
        return res.status(400).json({ message: "Les photos sont requises" });
      }
      
      const imageCount = mediaFiles.filter((f: any) => f.type && f.type.startsWith('image/')).length;
      if (imageCount < 1) {
        return res.status(400).json({ 
          message: `Au moins 1 photo est requise (${imageCount}/1 fourni)` 
        });
      }
      
      // Generate reference: DEV-MM-00001
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const allQuotes = await storage.getQuotes();
      const count = allQuotes.filter(q => {
        if (!q.createdAt) return false;
        const qDate = new Date(q.createdAt);
        return !isNaN(qDate.getTime()) && qDate >= startOfMonth;
      }).length + 1;
      const reference = `DEV-${mm}-${String(count).padStart(5, '0')}`;
      
      const validatedData = insertQuoteSchema.parse({
        ...quoteData,
        reference,
        clientId: userId,
        status: "pending",
      });
      const quote = await storage.createQuote(validatedData);
      
      // Create media entries
      for (const file of mediaFiles) {
        await storage.createQuoteMedia({
          quoteId: quote.id,
          filePath: file.key,
          fileType: file.type.startsWith('image/') ? 'image' : 'video',
          fileName: file.name,
        });
      }
      
      // Log audit event
      await logAuditEvent({
        req,
        entityType: "quote",
        entityId: quote.id,
        action: "created",
        summary: `${entityLabels.quote} ${actionLabels.created} par le client`,
        newData: quote,
      });
      
      res.json(quote);
    } catch (error: any) {
      console.error("Error creating quote:", error);
      res.status(400).json({ message: error.message || "Failed to create quote" });
    }
  });

  app.get("/api/admin/quotes", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      if (req.tenantSchema) {
        const ts = createTenantStorage(req.tenantGarageSlug);
        const quotes = await ts.getQuotes();
        return res.json(quotes);
      }
      const garageId = (req.user?.role === "superadmin" || req.user?.role === "root") ? undefined : req.user?.garageId;
      const quotes = await storage.getQuotes(undefined, garageId);
      res.json(quotes);
    } catch (error) {
      console.error("Error fetching quotes:", error);
      res.status(500).json({ message: "Failed to fetch quotes" });
    }
  });

  app.get("/api/admin/quotes/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const quote = await storage.getQuote(id);
      if (!quote) {
        return res.status(404).json({ message: "Devis non trouvé" });
      }
      // Check garage access
      if (!hasGarageAccess(req.user, quote.garageId)) {
        return res.status(403).json({ message: "Accès non autorisé à ce devis" });
      }
      res.json(quote);
    } catch (error) {
      console.error("Error fetching quote:", error);
      res.status(500).json({ message: "Failed to fetch quote" });
    }
  });

  app.post("/api/admin/quotes", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { mediaFiles, wheelCount, wheelPositions, diameter, priceExcludingTax, taxRate, taxAmount, productDetails, quoteAmount, services, ...quoteData } = req.body;
      
      // Validate minimum 1 images requirement
      if (!mediaFiles || !Array.isArray(mediaFiles)) {
        return res.status(400).json({ message: "Media files are required" });
      }
      
      const imageCount = mediaFiles.filter((f: any) => f.type && f.type.startsWith('image/')).length;
      if (imageCount < 1) {
        return res.status(400).json({ 
          message: `Au moins 1 image est requise (${imageCount}/1 fourni)` 
        });
      }

      const parsedWheelCount = wheelCount ? parseInt(wheelCount) : null;
      if (parsedWheelCount && Array.isArray(wheelPositions) && wheelPositions.length !== parsedWheelCount) {
        return res.status(400).json({
          message: `Le nombre de positions (${wheelPositions.length}) doit correspondre au nombre de jantes (${parsedWheelCount})`
        });
      }

      // Generate reference: DEV-MM-00001
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const allQuotes = await storage.getQuotes();
      const count = allQuotes.filter(q => {
        if (!q.createdAt) return false;
        const qDate = new Date(q.createdAt);
        return !isNaN(qDate.getTime()) && qDate >= startOfMonth;
      }).length + 1;
      const reference = `DEV-${mm}-${String(count).padStart(5, '0')}`;
      
      const validatedData = insertQuoteSchema.parse({
        ...quoteData,
        reference,
        wheelCount: wheelCount ? parseInt(wheelCount) : null,
        wheelPositions: Array.isArray(wheelPositions) ? wheelPositions : null,
        diameter,
        priceExcludingTax,
        taxRate,
        taxAmount,
        productDetails,
        quoteAmount,
        status: "approved", // Auto-approved when created by admin
      });
      const quote = await storage.createQuote(validatedData);
      
      // Create media entries
      const createdMediaEntries: Array<{ id: string; filePath: string; fileType: string; fileName: string }> = [];
      for (const file of mediaFiles) {
        let fileName = file.name;
        if (!fileName.includes('.')) {
          const ext = file.type.split('/')[1] || 'jpg';
          fileName = `${fileName}.${ext}`;
        }

        const media = await storage.createQuoteMedia({
          quoteId: quote.id,
          filePath: file.key,
          fileType: file.type.startsWith('image/') ? 'image' : 'video',
          fileName: fileName,
        });
        createdMediaEntries.push({ id: (media as any).id, filePath: file.key, fileType: (media as any).fileType || 'image', fileName: fileName });
      }
      
      // Post-process: apply watermark, rename with reference, upload to Google Drive
      processMediaAfterCreation(
        createdMediaEntries,
        reference,
        "quotes",
        async (mediaId, newPath, newFileName) => {
          await db.update(quoteMedia).set({ filePath: newPath, fileName: newFileName }).where(eq(quoteMedia.id, mediaId));
        }
      ).catch(err => console.error("[PostProcess] Quote media processing error:", err));
      
      // Create quote items if services array is provided
      if (services && Array.isArray(services) && services.length > 0) {
        for (const service of services) {
          const quantity = parseFloat(service.quantity || 1);
          const unitPrice = parseFloat(service.unitPrice || 0);
          const totalHT = quantity * unitPrice;
          const taxRateDecimal = parseFloat(taxRate || 0);
          const taxAmountItem = (totalHT * taxRateDecimal) / 100;
          const totalTTC = totalHT + taxAmountItem;
          
          await storage.createQuoteItem({
            quoteId: quote.id,
            description: service.serviceName,
            quantity: quantity.toString(),
            unitPriceExcludingTax: unitPrice.toString(),
            totalExcludingTax: totalHT.toString(),
            taxRate: taxRateDecimal.toString(),
            taxAmount: taxAmountItem.toString(),
            totalIncludingTax: totalTTC.toString(),
          });
        }
      }
      
      // Log audit event
      await logAuditEvent({
        req,
        entityType: "quote",
        entityId: quote.id,
        action: "created",
        summary: `${entityLabels.quote} ${actionLabels.created} et approuvé par l'administrateur`,
        newData: quote,
        metadata: { clientId: quote.clientId, servicesCount: services?.length || 0, autoApproved: true },
      });
      
      // Create notification for client
      await storage.createNotification({
        userId: quote.clientId,
        type: "quote",
        title: "Nouveau devis",
        message: `Un devis a été créé pour vous`,
        relatedId: quote.id,
      });

      // Send WebSocket notification
      const client = wsClients.get(quote.clientId);
      if (client && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: "quote_updated",
          quoteId: quote.id,
          status: quote.status,
        }));
      }

      // Notify rootadmin immediately (fire-and-forget)
      const quoteMediaForNotif = createdMediaEntries.map((m: any) => ({ filePath: m.filePath, fileName: m.fileName, fileType: m.fileType }));
      notifyRootAdmin("quote", quote, quoteMediaForNotif).catch(() => {});

      res.json(quote);
    } catch (error: any) {
      console.error("Error creating quote:", error);
      res.status(400).json({ message: error.message || "Failed to create quote" });
    }
  });

  app.patch("/api/admin/quotes/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const previousQuote = await storage.getQuote(id);
      if (!previousQuote) {
        return res.status(404).json({ message: "Devis introuvable" });
      }
      // Check garage access
      if (!hasGarageAccess(req.user, previousQuote?.garageId)) {
        return res.status(403).json({ message: "Accès non autorisé à ce devis" });
      }
      const quote = await storage.updateQuote(id, req.body);
      
      // Determine the action based on status change
      let action: ActionType = "updated";
      if (req.body.status) {
        if (req.body.status === "approved") action = "validated";
        else if (req.body.status === "rejected") action = "rejected";
        else if (req.body.status === "completed") action = "completed";
        else if (req.body.status === "cancelled") action = "cancelled";
      }
      
      // Log audit event
      await logAuditEvent({
        req,
        entityType: "quote",
        entityId: quote.id,
        action,
        summary: `${entityLabels.quote} ${actionLabels[action]}`,
        previousData: previousQuote,
        newData: quote,
      });
      
      // Create notification for client
      await storage.createNotification({
        userId: quote.clientId,
        type: "quote",
        title: "Devis mis à jour",
        message: `Votre devis a été ${actionLabels[action]}`,
        relatedId: quote.id,
      });

      // Send WebSocket notification
      const wsClient = wsClients.get(quote.clientId);
      if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(JSON.stringify({
          type: "quote_updated",
          quoteId: quote.id,
          status: quote.status,
        }));
      }
      
      // Automatic email disabled - use manual sending via "Envoyer par email" button
      // if (req.body.status === "approved" && previousQuote?.status !== "approved") { ... }
      
      res.json(quote);
    } catch (error) {
      console.error("Error updating quote:", error);
      res.status(500).json({ message: "Failed to update quote" });
    }
  });


  // Send quote by email
  app.post("/api/admin/quotes/:id/send-email", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { 
        customRecipient, 
        customSubject, 
        customMessage, 
        additionalRecipients = [], 
        sendCopy = false 
      } = req.body;
      
      const quote = await storage.getQuote(id);
      if (!quote) {
        return res.status(404).json({ message: "Devis non trouvé" });
      }

      const client = await storage.getUser(quote.clientId);
      
      // Validation pour les clients professionnels
      if (client?.role === "client_professionnel") {
        const missingInfo = [];
        if (!client.companyName) missingInfo.push("Nom de l'entreprise");
        if (!client.siret) missingInfo.push("SIRET");
        if (!client.companyAddress && !client.address) missingInfo.push("Adresse");
        
        if (missingInfo.length > 0) {
          return res.status(400).json({ 
            message: `Informations professionnelles manquantes : ${missingInfo.join(", ")}. Veuillez compléter le profil du client avant d'envoyer le devis.` 
          });
        }
      }

      if (!client || !client.email) {
        return res.status(400).json({ message: "Email du client non disponible" });
      }

      const items = await storage.getQuoteItems(id);
      const settings = await storage.getApplicationSettings();
      const adminUser = req.user;

      const { sendEmail, generateQuoteEmailHtml, generateQuotePDF } = await import("./emailService");
      
      const formatPrice = (value: string | number | null | undefined): string => {
        if (value === null || value === undefined || value === "") return "0,00 €";
        const num = typeof value === "string" ? parseFloat(value) : value;
        if (isNaN(num)) return "0,00 €";
        return num.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
      };

      const downloadMediaBuffer = async (filePath: string): Promise<Buffer | null> => {
        try {
          return await downloadFileFromPath(filePath);
        } catch (error) {
          console.error(`[Download] Error downloading ${filePath}:`, error);
          return null;
        }
      };

      // Generate or reuse viewToken for public access
      let viewToken = quote.viewToken;
      if (!viewToken) {
        viewToken = crypto.randomBytes(32).toString('hex');
        await storage.updateQuote(id, { viewToken } as any);
      }
      
      // Build the public quote URL
      const quoteViewUrl = `${getExternalBaseUrl(req)}/devis/${viewToken}`;

      // Use proper reference number
      const quoteRef = quote.reference || quote.id.slice(0, 8).toUpperCase();
      const clientName = `${client.firstName || ""} ${client.lastName || ""}`.trim() || client.email;
      const companyName = settings?.companyName || "MyJantes";
      
      const quoteTTC = parseFloat(quote.quoteAmount || "0");
      const quoteTax = parseFloat(quote.taxAmount || "0");
      const quoteHT = quoteTax > 0 ? (quoteTTC - quoteTax) : (quoteTTC / 1.2);

      const pdfBuffer = generateQuotePDF({
        quoteNumber: quoteRef,
        quoteDate: quote.createdAt ? new Date(quote.createdAt).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR'),
        clientName: clientName,
        status: quote.status,
        items: items.map(i => ({
          description: i.description || '',
          quantity: Number(i.quantity) || 1,
          unitPrice: parseFloat(i.unitPriceExcludingTax || "0").toFixed(2),
          total: parseFloat(i.totalExcludingTax || "0").toFixed(2),
        })),
        amount: formatPrice(quote.quoteAmount),
        totalHT: quoteHT.toFixed(2),
        totalTTC: quoteTTC.toFixed(2),
        companyName: companyName,
      });

      const pdfFilename = `Devis-${quoteRef}.pdf`;
      const attachments: { filename: string; content: Buffer }[] = [{ filename: pdfFilename, content: pdfBuffer }];
      console.log(`[Email] PDF generated: ${pdfFilename} (${pdfBuffer.length} bytes)`);

      try {
        const media = await storage.getQuoteMedia(id);
        console.log(`[Email] Found ${media.length} media file(s) for quote ${quoteRef}`);
        for (const item of media) {
          try {
            console.log(`[Email] Downloading: ${item.filePath}`);
            const data = await downloadMediaBuffer(item.filePath);
            if (data) {
              console.log(`[Email] Downloaded OK: ${item.fileName} (${data.length} bytes, isBuffer=${Buffer.isBuffer(data)})`);
              attachments.push({ filename: item.fileName || path.basename(item.filePath), content: data });
            } else {
              console.warn(`[Email] Download returned null for: ${item.filePath}`);
            }
          } catch (err) { console.warn(`[Email] Failed to attach file: ${item.filePath}`, err); }
        }
      } catch (err) { console.error("[Email] Error fetching media for email:", err); }
      console.log(`[Email] Total attachments: ${attachments.length} (${attachments.map(a => a.filename).join(', ')})`);

      const actionLinksHtml = `
        <div style="margin: 30px 0; text-align: center;">
          <a href="${quoteViewUrl}" style="display: inline-block; background: #dc2626; color: white; padding: 16px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; letter-spacing: 0.5px;">
            Voir le devis
          </a>
        </div>
      `;
      
      let html;
      if (customMessage) {
        html = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            ${getEmailHeader(companyName)}
            <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb;">
              <div style="white-space: pre-line; margin-bottom: 20px;">${customMessage}</div>
              ${actionLinksHtml}
            </div>
            ${getEmailFooter(companyName)}
          </div>
        `;
      } else {
        html = generateQuoteEmailHtml({
          clientName,
          quoteNumber: quoteRef,
          quoteAmount: formatPrice(quote.quoteAmount),
          quoteUrl: quoteViewUrl,
          companyName: companyName
        });
      }

      const to = customRecipient || client.email;
      const finalAdditional = [...additionalRecipients];
      if (sendCopy && adminUser.email) finalAdditional.push(adminUser.email);

      await sendEmail({
        to,
        cc: finalAdditional.join(','),
        subject: customSubject || `Votre Devis ${quoteRef} - ${companyName}`,
        html,
        attachments
      });

      // Send SMS to client if consent is given
      if (client.phone && client.smsConsent) {
        await sendEventSms({
          userPhone: client.phone,
          userSmsConsent: client.smsConsent,
          userName: `${client.firstName || ''} ${client.lastName || ''}`.trim(),
          userEmail: client.email,
          eventType: 'quote_sent',
          eventTitle: quoteRef,
          eventDetails: formatPrice(quote.quoteAmount),
          eventUrl: quoteViewUrl,
        });
      }

      // Notify admins and employees with phone numbers
      try {
        const staffMembers = await storage.getUsersByRoles(['admin', 'employee']);
        for (const staff of staffMembers) {
          if (staff.phone && isFrenchMobile(staff.phone)) {
            await sendSms({
              to: staff.phone,
              eventType: 'quote_sent',
              eventTitle: `Nouveau devis : ${quoteRef}`,
              eventDetails: `Client : ${client.firstName || ''} ${client.lastName || ''} - ${formatPrice(quote.quoteAmount)}`,
              recipientName: `${staff.firstName || ''} ${staff.lastName || ''}`.trim()
            });
          }
        }
      } catch (err) {
        console.error("[SMS:Staff] Failed to notify staff for quote:", err);
      }

      res.json({ success: true, message: "Email envoyé avec succès" });
    } catch (error: any) {
      console.error("Error sending quote email:", error);
      res.status(500).json({ message: error.message || "Erreur lors de l'envoi de l'email" });
    }
  });

  // Quote Items routes
  app.get("/api/admin/quotes/:id/items", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      // Check garage access for parent quote
      const quote = await storage.getQuote(id);
      if (quote && !hasGarageAccess(req.user, quote.garageId)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }
      const items = await storage.getQuoteItems(id);
      res.json(items);
    } catch (error) {
      console.error("Error fetching quote items:", error);
      res.status(500).json({ message: "Failed to fetch quote items" });
    }
  });

  app.post("/api/admin/quotes/:id/items", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      // Check garage access for parent quote
      const quote = await storage.getQuote(id);
      if (quote && !hasGarageAccess(req.user, quote.garageId)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }
      const { insertQuoteItemSchema } = await import("@shared/schema");
      const validatedData = insertQuoteItemSchema.parse({ ...req.body, quoteId: id });
      const item = await storage.createQuoteItem(validatedData);
      // Recalculate quote totals after creating item
      await storage.recalculateQuoteTotals(id);
      res.json(item);
    } catch (error: any) {
      console.error("Error creating quote item:", error);
      res.status(400).json({ message: error.message || "Failed to create quote item" });
    }
  });

  app.patch("/api/admin/quote-items/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const item = await storage.updateQuoteItem(id, req.body);
      // Recalculate quote totals after updating item
      await storage.recalculateQuoteTotals(item.quoteId);
      res.json(item);
    } catch (error: any) {
      console.error("Error updating quote item:", error);
      res.status(400).json({ message: error.message || "Failed to update quote item" });
    }
  });

  app.delete("/api/admin/quote-items/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      // Get item first to know its quoteId for recalculation
      const itemToDelete = await storage.getQuoteItem(id);
      if (!itemToDelete) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      await storage.deleteQuoteItem(id);
      // Recalculate quote totals after deleting item
      await storage.recalculateQuoteTotals(itemToDelete.quoteId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting quote item:", error);
      res.status(400).json({ message: error.message || "Failed to delete quote item" });
    }
  });

  // Quote Media routes
  app.get("/api/admin/quotes/:id/media", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      // Check garage access for parent quote
      const quote = await storage.getQuote(id);
      if (quote && !hasGarageAccess(req.user, quote.garageId)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }
      const media = await storage.getQuoteMedia(id);
      res.json(media);
    } catch (error) {
      console.error("Error fetching quote media:", error);
      res.status(500).json({ message: "Failed to fetch quote media" });
    }
  });

  app.post("/api/admin/quotes/:id/media", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const files = req.files;
      
      if (!files || !files.file) {
        return res.status(400).json({ message: "Fichier requis" });
      }

      const file = files.file;
      const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
      
      const quote = await storage.getQuote(id);
      const reference = quote?.reference || `DEVIS-${id.slice(0, 8).toUpperCase()}`;
      
      // Get existing media count for incremental naming
      const existingMedia = await storage.getQuoteMedia(id);
      const nextIndex = (existingMedia?.length || 0) + 1;
      const ext = path.extname(file.name) || '.jpg';
      const newFileName = `${reference}_${nextIndex}${ext}`;
      
      let fileData: Buffer;
      if (file.tempFilePath) {
        fileData = fs.readFileSync(file.tempFilePath);
      } else if (file.data) {
        fileData = file.data;
      } else {
        return res.status(400).json({ message: "Impossible de lire le fichier" });
      }

      if (isImage) {
        try {
          const { addWatermarkToImage } = await import("./imageWatermark");
          fileData = await addWatermarkToImage(fileData, reference, file.mimetype);
          console.log(`[Watermark] Applied to image for reference: ${reference}`);
        } catch (watermarkError) {
          console.error("[Watermark] Failed to apply to image:", watermarkError);
        }
      }
    
      const filePath = await uploadToStorage(fileData, newFileName, "quotes");
      console.log(`[Upload] Quote media uploaded: ${filePath}`);
      
      const media = await storage.createQuoteMedia({
        quoteId: id,
        fileName: newFileName,
        filePath,
        fileType: isImage ? "image" : "document",
        fileSize: fileData.length,
      });
      
      if (file.tempFilePath) {
        try { fs.unlinkSync(file.tempFilePath); } catch (_) {}
      }
      
      sendMediaZipByEmail("quote", id, reference).catch(err =>
        console.error("[ZipEmail] Background quote ZIP failed:", err)
      );
      
      res.json(media);
    } catch (error: any) {
      console.error("Error uploading quote media:", error);
      res.status(500).json({ message: error.message || "Failed to upload media" });
    }
  });

  app.post("/api/admin/quotes/:id/media-zip", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const files = req.files;
      if (!files || !files.file) {
        return res.status(400).json({ message: "Fichier ZIP requis" });
      }
      const file = files.file;
      if (!file.name.toLowerCase().endsWith(".zip")) {
        return res.status(400).json({ message: "Seuls les fichiers ZIP sont acceptés" });
      }

      let zipData: Buffer;
      if (file.tempFilePath) {
        zipData = fs.readFileSync(file.tempFilePath);
      } else if (file.data) {
        zipData = file.data;
      } else {
        return res.status(400).json({ message: "Impossible de lire le fichier" });
      }

      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(zipData);

      const quote = await storage.getQuote(id);
      const reference = quote?.reference || `DEVIS-${id.slice(0, 8).toUpperCase()}`;
      const existingMedia = await storage.getQuoteMedia(id);
      let nextIndex = (existingMedia?.length || 0) + 1;

      const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
      const results: any[] = [];

      for (const [fileName, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) continue;
        const ext = path.extname(fileName).toLowerCase();
        if (!imageExts.includes(ext)) continue;

        const baseName = path.basename(fileName);
        if (baseName.startsWith(".") || baseName.startsWith("__MACOSX")) continue;

        let fileData = Buffer.from(await zipEntry.async("arraybuffer"));
        const newFileName = `${reference}_${nextIndex}${ext}`;
        nextIndex++;

        try {
          const { addWatermarkToImage } = await import("./imageWatermark");
          const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
          fileData = await addWatermarkToImage(fileData, reference, mimeType);
        } catch (_) {}

        const filePath = await uploadToStorage(fileData, newFileName, "quotes");
        const media = await storage.createQuoteMedia({
          quoteId: id,
          fileName: newFileName,
          filePath,
          fileType: "image",
          fileSize: fileData.length,
        });
        results.push(media);
        console.log(`[ZIP] Extracted and uploaded: ${baseName} -> ${newFileName}`);
      }

      if (file.tempFilePath) {
        try { fs.unlinkSync(file.tempFilePath); } catch (_) {}
      }

      if (results.length === 0) {
        return res.status(400).json({ message: "Aucune image trouvée dans le fichier ZIP" });
      }

      sendMediaZipByEmail("quote", id, reference).catch(err =>
        console.error("[ZipEmail] Background quote ZIP failed:", err)
      );

      res.json({ success: true, count: results.length, media: results });
    } catch (error: any) {
      console.error("Error uploading quote ZIP:", error);
      res.status(500).json({ message: error.message || "Erreur lors de l'extraction du ZIP" });
    }
  });

  app.delete("/api/admin/quote-media/:mediaId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { mediaId } = req.params;
      
      const media = await storage.getQuoteMediaById(mediaId);
      if (!media) {
        return res.status(404).json({ message: "Media not found" });
      }
      
      if (media.filePath) {
        if (media.filePath.startsWith("/gdrive/")) {
          try {
            const { extractFileId, deleteFromGoogleDrive } = await import("./googleDriveStorage");
            const fileId = extractFileId(media.filePath);
            if (fileId) await deleteFromGoogleDrive(fileId);
          } catch (err) { console.error("[Delete] Google Drive delete failed:", err); }
        } else if (media.filePath.startsWith("/objects/")) {
          try {
            await deleteMedia(media.filePath);
          } catch (err) { console.error("[Delete] Object Storage delete failed:", err); }
        } else if (media.filePath.startsWith("https://storage.googleapis.com/")) {
          try {
            const { deleteFromFirebaseStorage } = await import("./firebase");
            await deleteFromFirebaseStorage(media.filePath);
          } catch (err) { console.error("[Delete] Firebase delete failed:", err); }
        } else {
          const fs = await import("fs");
          const localPath = media.filePath.startsWith('/') ? `.${media.filePath}` : media.filePath;
          if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
        }
      }
      
      await storage.deleteQuoteMedia(mediaId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting quote media:", error);
      res.status(500).json({ message: error.message || "Failed to delete media" });
    }
  });

  async function downloadMediaBuffer(filePath: string): Promise<Buffer | null> {
    try {
      return await downloadFileFromPath(filePath);
    } catch (err) {
      console.error(`[Download] Error downloading ${filePath}:`, err);
    }
    return null;
  }

  app.get("/api/admin/quotes/:id/media/download-zip", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const quote = await storage.getQuote(id);
      if (quote && !hasGarageAccess(req.user, quote.garageId)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }
      const mediaList = await storage.getQuoteMedia(id);
      if (!mediaList || mediaList.length === 0) {
        return res.status(404).json({ message: "Aucune photo à télécharger" });
      }

      const reference = quote?.reference || `DEVIS-${id.slice(0, 8).toUpperCase()}`;
      const archiver = (await import("archiver")).default;
      const archive = archiver("zip", { zlib: { level: 5 } });

      res.set({
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="photos_${reference}.zip"`,
      });
      archive.pipe(res);

      for (let i = 0; i < mediaList.length; i++) {
        const m = mediaList[i];
        try {
          const buffer = await downloadMediaBuffer(m.filePath);
          if (buffer) {
            const ext = path.extname(m.fileName || ".jpg");
            const cleanName = `devis_${reference}_${i + 1}${ext}`;
            archive.append(buffer, { name: cleanName });
          }
        } catch (fileErr) {
          console.error(`[ZIP] Error reading file ${m.filePath}:`, fileErr);
        }
      }

      await archive.finalize();
    } catch (error: any) {
      console.error("Error creating quote media ZIP:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: error.message || "Erreur lors de la création du ZIP" });
      }
    }
  });

  // Public routes - let SPA handle rendering via catch-all (no server-side validation)
  app.get("/devis/:token", (_req, _res, next) => next());
  app.get("/reservation/:token", (_req, _res, next) => next());
  app.get("/facture/:token", (_req, _res, next) => next());

  app.get("/avis/:token", (_req, _res, next) => next());
  app.get("/facture/:token/paiement-confirme", (_req, _res, next) => next());
  app.get("/payment/checkout", (_req, _res, next) => next());
  app.get("/payment/success", (_req, _res, next) => next());
  app.get("/payment/cancel", (_req, _res, next) => next());

  // Invoice routes
  app.get("/api/invoices", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const invoices = await storage.getInvoices(userId);
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.get("/api/admin/invoices", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      if (req.tenantSchema) {
        const ts = createTenantStorage(req.tenantGarageSlug);
        const invoiceList = await ts.getInvoices();
        return res.json(invoiceList);
      }
      const garageId = (req.user?.role === "superadmin" || req.user?.role === "root") ? undefined : req.user?.garageId;
      const invoiceList = await storage.getInvoices(undefined, garageId);
      res.json(invoiceList);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.post("/api/admin/invoices", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { mediaFiles, ...invoiceData } = req.body;
      
      // If creating from a quote, fetch quote data first to fill required fields
      let quote = null;
      if (invoiceData.quoteId) {
        quote = await storage.getQuote(invoiceData.quoteId);
        if (!quote) return res.status(404).json({ message: "Devis introuvable" });
        
        if (!invoiceData.clientId) invoiceData.clientId = quote.clientId;
        if (!invoiceData.amount) invoiceData.amount = quote.quoteAmount || "0";
        if (!invoiceData.paymentMethod) invoiceData.paymentMethod = "wire_transfer";
      }
      
      const validatedData = insertInvoiceSchema.parse(invoiceData);
      
      // Handle PPF reference for Klarna/Alma (other payment methods use atomic counter in storage)
      let invoiceNumberVal: string | undefined = undefined;
      if (validatedData.paymentMethod === "klarna" || validatedData.paymentMethod === "alma") {
        const nowPPF = new Date();
        const mmPPF = String(nowPPF.getMonth() + 1).padStart(2, '0');
        const allPPF = await storage.getInvoices();
        const countPPF = allPPF.filter(i => (i.invoiceNumber || "").startsWith("PPF")).length + 1;
        invoiceNumberVal = `PPF-${mmPPF}-${String(countPPF).padStart(4, '0')}`;
      }
      
      let wheelCount = validatedData.wheelCount || null;
      let diameter = validatedData.diameter || null;
      let priceExcludingTax = validatedData.priceExcludingTax || "0";
      let taxRate = validatedData.taxRate || 20;
      let taxAmount = validatedData.taxAmount || "0";
      let productDetails = validatedData.productDetails || null;
      
      if (quote) {
        wheelCount = quote.wheelCount;
        diameter = quote.diameter;
        priceExcludingTax = quote.priceExcludingTax ?? "0";
        taxRate = quote.taxRate ?? 20;
        taxAmount = quote.taxAmount ?? "0";
        productDetails = quote.productDetails;
      }
      
      // Copy vehicle info from quote if not provided in invoice payload
      const vehicleFields: Record<string, any> = {};
      if (quote) {
        const fields = ['vehicleRegistration', 'vehicleMake', 'vehicleModel', 'vehicleVin', 'vehicleFuelType', 'vehicleFiscalPower', 'vehicleFirstRegDate', 'vehicleColor'] as const;
        for (const f of fields) {
          if (!(validatedData as any)[f] && (quote as any)[f]) {
            vehicleFields[f] = (quote as any)[f];
          }
        }
      }
      
      const invoice = await storage.createInvoice({
        ...validatedData,
        ...vehicleFields,
        invoiceNumber: invoiceNumberVal,
        wheelCount,
        diameter,
        priceExcludingTax,
        taxRate,
        taxAmount,
        productDetails,
      } as any);
      
      if (validatedData.quoteId && quote) {
        const quoteItems = await storage.getQuoteItems(validatedData.quoteId);
        for (const quoteItem of quoteItems) {
          await storage.createInvoiceItem({
            invoiceId: invoice.id,
            description: quoteItem.description,
            quantity: quoteItem.quantity,
            unitPriceExcludingTax: quoteItem.unitPriceExcludingTax,
            taxRate: quoteItem.taxRate,
            taxAmount: quoteItem.taxAmount,
            totalExcludingTax: quoteItem.totalExcludingTax,
            totalIncludingTax: quoteItem.totalIncludingTax,
          });
        }
      }
      
      const hasNewMedia = mediaFiles && Array.isArray(mediaFiles) && mediaFiles.length > 0;
      if (hasNewMedia) {
        for (const fileEntry of mediaFiles) {
          const fp = typeof fileEntry === 'string' ? fileEntry : (fileEntry.filePath || fileEntry.path || fileEntry.key || '');
          const fn = typeof fileEntry === 'string' ? path.basename(fileEntry) : (fileEntry.fileName || fileEntry.name || path.basename(fp));
          if (fp) {
            await storage.createInvoiceMedia({
              invoiceId: invoice.id,
              fileType: "image",
              filePath: fp,
              fileName: fn,
            });
          }
        }
      }
      if (validatedData.quoteId) {
        const quoteMedia = await storage.getQuoteMedia(validatedData.quoteId);
        for (const media of quoteMedia) {
          await storage.createInvoiceMedia({
            invoiceId: invoice.id,
            fileType: media.fileType || "image",
            filePath: media.filePath,
            fileName: media.fileName,
          });
        }
        console.log(`[Invoice] Auto-copied ${quoteMedia.length} media from quote ${validatedData.quoteId}`);
      }

      // Create notification for client
      if (invoice.clientId) {
        await storage.createNotification({
          userId: invoice.clientId,
          type: "invoice",
          title: "New Invoice",
          message: `A new invoice has been generated`,
          relatedId: invoice.id,
        });
      }

      // Send WebSocket notification
      const wsClient = invoice.clientId ? wsClients.get(invoice.clientId) : undefined;
      if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(JSON.stringify({
          type: "invoice_created",
          invoiceId: invoice.id,
        }));
      }
      
      // Automatic email disabled - use manual send button instead
      console.log(`Invoice created: ${invoice.invoiceNumber} - auto-email disabled`);
      
      res.json(invoice);
    } catch (error: any) {
      console.error("Error creating invoice:", error);
      res.status(400).json({ message: error.message || "Failed to create invoice" });
    }
  });

  // Create invoice directly (without quote)
  app.post("/api/admin/invoices/direct", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { mediaFiles, ...invoiceData } = req.body;
      
      const validatedData = insertInvoiceSchema.parse(invoiceData);
      
      // If direct invoice, default status to draft
      const finalStatus = validatedData.status || "draft";
      
      // Invoice number generated by storage atomic counter (VIR-/ESP-/CBL-/PPF-)
      const invoice = await storage.createInvoice({
        ...validatedData,
        status: finalStatus,
      } as any);

      // Notification only if there's a registered client
      if (invoice.clientId) {
        await storage.createNotification({
          userId: invoice.clientId,
          type: "invoice",
          title: "Nouvelle Facture",
          message: `Une nouvelle facture (Brouillon) a été générée`,
          relatedId: invoice.id,
        });

        // Send WebSocket notification
        const wsClient = wsClients.get(invoice.clientId);
        if (wsClient && wsClient.readyState === WebSocket.OPEN) {
          wsClient.send(JSON.stringify({
            type: "invoice_created",
            invoiceId: invoice.id,
          }));
        }
      }
      
      // Automatic email disabled - use manual send button instead
      console.log(`Direct invoice created: ${invoice.invoiceNumber} - auto-email disabled`);

      // Notify rootadmin immediately (fire-and-forget)
      notifyRootAdmin("invoice", invoice).catch(() => {});

      res.json(invoice);
    } catch (error: any) {
      console.error("Error creating direct invoice:", error);
      res.status(400).json({ message: error.message || "Failed to create direct invoice" });
    }
  });

  // Get single invoice by ID
  app.get("/api/admin/invoices/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const invoice = await storage.getInvoice(id);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      // Check garage access
      if (!hasGarageAccess(req.user, invoice.garageId)) {
        return res.status(403).json({ message: "Accès non autorisé à cette facture" });
      }
      res.json(invoice);
    } catch (error) {
      console.error("Error fetching invoice:", error);
      res.status(500).json({ message: "Failed to fetch invoice" });
    }
  });

  // Update invoice
  app.patch("/api/admin/invoices/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      // Get the previous state for audit logging
      const previousInvoice = await storage.getInvoice(id);
      if (!previousInvoice) {
        return res.status(404).json({ message: "Facture introuvable" });
      }
      // Check garage access
      if (!hasGarageAccess(req.user, previousInvoice?.garageId)) {
        return res.status(403).json({ message: "Accès non autorisé à cette facture" });
      }
      const updateData = { ...req.body };
      
      // Convert date strings to Date objects for all timestamp fields
      Object.keys(updateData).forEach(key => {
        const value = updateData[key];
        if (value && typeof value === 'string') {
          // Check if it looks like an ISO date string
          const dateRegex = /^\d{4}-\d{2}-\d{2}/;
          if (dateRegex.test(value)) {
            const parsedDate = new Date(value);
            if (!isNaN(parsedDate.getTime())) {
              updateData[key] = parsedDate;
            }
          }
        }
      });
      
      const invoice = await storage.updateInvoice(id, updateData);
      
      // Determine action type based on status change
      let action: ActionType = "updated";
      let summary = "Facture mise à jour";
      if (updateData.status === "paid" && previousInvoice?.status !== "paid") {
        action = "paid";
        summary = "Facture marquée comme payée";
      } else if (updateData.status === "cancelled" && previousInvoice?.status !== "cancelled") {
        action = "cancelled";
        summary = "Facture annulée";
      }
      
      // Log audit event
      await logAuditEvent({
        req,
        entityType: "invoice",
        entityId: id,
        action,
        summary,
        previousData: previousInvoice,
        newData: invoice,
      });

      // Auto-generate accounting entry when invoice is paid
      if (updateData.status === "paid" && previousInvoice?.status !== "paid") {
        try {
          const year = new Date().getFullYear();
          const entryNumber = await storage.getNextEntryNumber(year);
          const ttc = parseFloat(invoice.amount || "0");
          const tva = parseFloat(invoice.taxAmount || "0");
          const ht = invoice.priceExcludingTax ? parseFloat(invoice.priceExcludingTax) : (ttc - tva);
          const paymentMethod = invoice.paymentMethod || "wire_transfer";
          const bankAccount = paymentMethod === "cash" ? "530000" : "512000";
          const bankLabel = paymentMethod === "cash" ? "Caisse" : "Banque";

          const entry = await storage.createAccountingEntry({
            garageId: invoice.garageId || null,
            entryNumber,
            date: new Date(),
            journal: "sales",
            sourceType: "invoice",
            sourceId: invoice.id,
            description: `Facture ${invoice.invoiceNumber} payée`,
            totalDebit: String(ttc),
            totalCredit: String(ttc),
          });

          await storage.createAccountingLine({
            entryId: entry.id,
            accountCode: bankAccount,
            accountLabel: bankLabel,
            description: `Encaissement facture ${invoice.invoiceNumber}`,
            debit: String(ttc),
            credit: "0",
          });

          await storage.createAccountingLine({
            entryId: entry.id,
            accountCode: "706000",
            accountLabel: "Prestations de services",
            description: `Vente ${invoice.invoiceNumber}`,
            debit: "0",
            credit: String(ht),
          });

          if (tva > 0) {
            await storage.createAccountingLine({
              entryId: entry.id,
              accountCode: "445710",
              accountLabel: "TVA collectée",
              description: `TVA facture ${invoice.invoiceNumber}`,
              debit: "0",
              credit: String(tva),
            });
          }
        } catch (accError) {
          console.error("Error creating accounting entry for invoice payment:", accError);
        }
      }
      
      // Automatic email for paid status
      if (updateData.status === "paid" && previousInvoice?.status !== "paid") {
        try {
          const client = await storage.getUser(invoice.clientId);
          const quote = invoice.quoteId ? await storage.getQuote(invoice.quoteId) : null;
          const garage = await storage.getGarage(invoice.garageId || "");
          
          if (client && client.email) {
            const baseUrl = getExternalBaseUrl(req);
            
            let reviewUrl = "";
            const crypto = await import("crypto");
            const reviewToken = crypto.randomBytes(32).toString('hex');
            const clientName = `${client.firstName || ""} ${client.lastName || ""}`.trim() || client.email;
            
            const existingReviewsForInvoice = await db.select().from(reviews).where(eq(reviews.invoiceId, invoice.id));
            if (existingReviewsForInvoice.length === 0) {
              await db.insert(reviews).values({
                garageId: invoice.garageId,
                invoiceId: invoice.id,
                clientId: invoice.clientId,
                clientName: clientName,
                rating: 0,
                reviewToken: reviewToken,
              });
              reviewUrl = `${baseUrl}/avis/${reviewToken}`;
            } else if (existingReviewsForInvoice[0].reviewToken) {
              reviewUrl = `${baseUrl}/avis/${existingReviewsForInvoice[0].reviewToken}`;
            }

            const { generateInvoicePaidEmailHtml, sendEmail } = await import("./emailService");
            const emailHtml = generateInvoicePaidEmailHtml({
              clientName: clientName,
              invoiceNumber: invoice.invoiceNumber,
              amount: invoice.amount || "0",
              paymentDate: new Date().toLocaleDateString("fr-FR"),
              companyName: garage?.name || "MY JANTES",
              reviewUrl: reviewUrl || undefined
            });

            await sendEmail({
              to: client.email,
              subject: `Confirmation de paiement - Facture ${invoice.invoiceNumber}`,
              html: emailHtml
            });
            console.log(`[Email] Automatic paid confirmation sent to ${client.email} for invoice ${invoice.invoiceNumber}`);

            // Send SMS to client if consent is given
            if (client.phone && client.smsConsent) {
              await sendEventSms({
                userPhone: client.phone,
                userSmsConsent: client.smsConsent,
                userName: `${client.firstName || ''} ${client.lastName || ''}`.trim(),
                userEmail: client.email,
                eventType: 'invoice_paid',
                eventTitle: invoice.invoiceNumber,
                eventDetails: invoice.amount || '0',
                eventUrl: reviewUrl || undefined,
              });
            }

            // Notify staff
            try {
              const staffMembers = await storage.getUsersByRoles(['admin', 'employee']);
              for (const staff of staffMembers) {
                if (staff.phone && isFrenchMobile(staff.phone)) {
                  await sendSms({
                    to: staff.phone,
                    eventType: 'invoice_paid',
                    eventTitle: `Paiement reçu : ${invoice.invoiceNumber}`,
                    eventDetails: `Client : ${clientName} - ${invoice.amount || '0'} €`,
                    recipientName: `${staff.firstName || ''} ${staff.lastName || ''}`.trim()
                  });
                }
              }
            } catch (err) {
              console.error("[SMS:Staff] Failed to notify staff for payment:", err);
            }
          }
        } catch (emailErr) {
          console.error("[Email] Failed to send automatic paid confirmation:", emailErr);
        }
      }
      
      res.json(invoice);
    } catch (error: any) {
      console.error("Error updating invoice:", error);
      res.status(400).json({ message: error.message || "Failed to update invoice" });
    }
  });

  // Send invoice by email
  app.post("/api/admin/invoices/:id/send-email", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { 
        customRecipient, 
        customSubject, 
        customMessage, 
        additionalRecipients = [], 
        sendCopy = false 
      } = req.body;
      const adminUser = req.user;

      const invoice = await storage.getInvoice(id);
      if (!invoice) {
        return res.status(404).json({ message: "Facture non trouvée" });
      }

      const client = await storage.getUser(invoice.clientId);
      
      // Validation pour les clients professionnels
      if (client?.role === "client_professionnel") {
        const missingInfo = [];
        if (!client.companyName) missingInfo.push("Nom de l'entreprise");
        if (!client.siret) missingInfo.push("SIRET");
        if (!client.companyAddress && !client.address) missingInfo.push("Adresse");
        
        if (missingInfo.length > 0) {
          return res.status(400).json({ 
            message: `Informations professionnelles manquantes : ${missingInfo.join(", ")}. Veuillez compléter le profil du client avant d'envoyer la facture.` 
          });
        }
      }

      if (!client || !client.email) {
        return res.status(400).json({ message: "Email du client non disponible" });
      }

      const items = await storage.getInvoiceItems(id);
      const settings = await storage.getApplicationSettings();
      const companyName = settings?.companyName || "MyJantes";

      const { sendEmail, generateInvoiceEmailHtml } = await import("./emailService");
      
      const formatPrice = (value: string | number | null | undefined): string => {
        if (value === null || value === undefined || value === "") return "0,00 €";
        const num = typeof value === "string" ? parseFloat(value) : value;
        if (isNaN(num)) return "0,00 €";
        return num.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
      };

      const invoiceCreatedAt = invoice.createdAt ? new Date(invoice.createdAt) : new Date();
      const dueDate = invoice.dueDate 
        ? new Date(invoice.dueDate).toLocaleDateString("fr-FR")
        : new Date(invoiceCreatedAt.getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("fr-FR");

      const html = generateInvoiceEmailHtml({
        clientName: `${client.firstName || ""} ${client.lastName || ""}`.trim() || client.email,
        invoiceNumber: invoice.invoiceNumber || invoice.id.slice(0, 8).toUpperCase(),
        invoiceDate: invoiceCreatedAt.toLocaleDateString("fr-FR"),
        dueDate,
        amount: invoice.amount || "0",
        totalHT: invoice.priceExcludingTax || "0",
        taxAmount: invoice.taxAmount || "0",
        companyName: settings?.companyName || "MyJantes",
        items: items.map(item => ({
          description: item.description,
          quantity: parseFloat(item.quantity || "1"),
          unitPrice: item.unitPriceExcludingTax || "0",
          total: item.totalIncludingTax || "0",
        })),
        paymentLink: (() => {
          // Toujours s'assurer qu'un viewToken existe avant d'envoyer l'email
          if (!invoice.viewToken) {
            const newToken = crypto.randomBytes(32).toString('hex');
            db.update(invoices).set({ viewToken: newToken }).where(eq(invoices.id, invoice.id)).catch(() => {});
            return `${getExternalBaseUrl(req)}/facture/${newToken}`;
          }
          return `${getExternalBaseUrl(req)}/facture/${invoice.viewToken}`;
        })()
      });

      const { generateInvoicePDF: genInvoicePdf } = await import("./emailService");
      const invClientDetails: string[] = [];
      if (client.siret) invClientDetails.push(`SIRET: ${client.siret}`);
      if (client.tvaNumber) invClientDetails.push(`TVA: ${client.tvaNumber}`);
      if (client.email) invClientDetails.push(client.email);
      if (client.phone) invClientDetails.push(`Tél: ${client.phone}`);
      const invClientAddr = client.companyAddress || client.address;
      if (invClientAddr) invClientDetails.push(invClientAddr as string);
      const invClientLoc = [client.postalCode, client.city].filter(Boolean).join(' ');
      if (invClientLoc) invClientDetails.push(invClientLoc);

      const sendPdfBuffer = genInvoicePdf({
        invoiceNumber: invoice.invoiceNumber || invoice.id.slice(0, 8).toUpperCase(),
        invoiceDate: invoiceCreatedAt.toLocaleDateString("fr-FR"),
        dueDate,
        clientName: client.companyName || `${client.firstName || ""} ${client.lastName || ""}`.trim() || client.email,
        clientDetails: invClientDetails,
        items: items.map(item => ({
          description: item.description,
          quantity: parseFloat(item.quantity || "1"),
          unitPrice: parseFloat(item.unitPriceExcludingTax || "0").toFixed(2),
          total: parseFloat(item.totalExcludingTax || "0").toFixed(2),
          taxRate: item.taxRate || "20",
        })),
        amount: formatPrice(invoice.amount),
        companyName: settings?.companyName || "MyJantes",
      });

      const invoiceRef = invoice.invoiceNumber || invoice.id.slice(0, 8).toUpperCase();
      const attachments = [{ filename: `Facture-${invoiceRef}.pdf`, content: sendPdfBuffer }];

      console.log(`[Email] Sending invoice ${invoice.invoiceNumber} to ${client.email}`);
      const media = await storage.getInvoiceMedia(id);
      const photoAttachments: { filename: string; content: Buffer }[] = [];
      const fs = await import('fs');
      // Get invoice photos
      for (const item of media) {
        if (item.fileType === 'image') {
          try {
            console.log(`[Email] Attempting to attach: ${item.filePath}`);
            const data = await downloadMediaBuffer(item.filePath);
            if (data) {
              photoAttachments.push({ filename: item.fileName || path.basename(item.filePath), content: data });
              console.log(`[Email] Successfully attached: ${item.fileName}`);
            }
          } catch (err) { console.warn(`[Email] Photo attachment failed: ${item.filePath}`, err); }
        }
      }

      const finalAttachments = [...attachments, ...photoAttachments];

      const to = customRecipient || client.email;
      const cc = [...additionalRecipients];
      if (sendCopy && adminUser.email) cc.push(adminUser.email);

      await sendEmail({
        to,
        cc: cc.join(','),
        subject: customSubject || `Votre Facture ${invoiceRef} - ${companyName}`,
        html,
        attachments: finalAttachments
      });

      // Send SMS to client if consent is given
      if (client.phone && client.smsConsent) {
        await sendEventSms({
          userPhone: client.phone,
          userSmsConsent: client.smsConsent,
          userName: `${client.firstName || ''} ${client.lastName || ''}`.trim(),
          userEmail: client.email,
          eventType: 'invoice_sent',
          eventTitle: invoiceRef,
          eventDetails: formatPrice(invoice.amount),
          eventUrl: invoice.viewToken ? `${getExternalBaseUrl(req)}/facture/${invoice.viewToken}` : `${getExternalBaseUrl(req)}/facture/${invoice.id}`,
        });
      }

      // Notify staff
      try {
        const staffMembers = await storage.getUsersByRoles(['admin', 'employee']);
        for (const staff of staffMembers) {
          if (staff.phone && isFrenchMobile(staff.phone)) {
            await sendSms({
              to: staff.phone,
              eventType: 'invoice_sent',
              eventTitle: `Facture envoyée : ${invoiceRef}`,
              eventDetails: `Client : ${client.firstName || ''} ${client.lastName || ''} - ${formatPrice(invoice.amount)}`,
              recipientName: `${staff.firstName || ''} ${staff.lastName || ''}`.trim()
            });
          }
        }
      } catch (err) {
        console.error("[SMS:Staff] Failed to notify staff for invoice:", err);
      }

      res.json({ success: true, message: "Email envoyé avec succès" });
    } catch (error: any) {
      console.error("Error sending invoice email:", error);
      res.status(500).json({ message: error.message || "Échec de l'envoi de l'email" });
    }
  });

  // Delete quote (permanent)
  app.delete("/api/admin/quotes/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const quote = await storage.getQuote(id);
      if (!quote) return res.status(404).json({ message: "Devis non trouvé" });
      if (!hasGarageAccess(req.user, quote.garageId)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }

      const client = await storage.getUser(quote.clientId);
      const settings = await storage.getApplicationSettings();
      const companyName = settings?.companyName || "MyJantes";

      // Delete related items and media first
      const items = await storage.getQuoteItems(id);
      for (const item of items) {
        await storage.deleteQuoteItem(item.id);
      }
      const media = await storage.getQuoteMedia(id);
      for (const m of media) {
        if (m.filePath) {
          if (m.filePath.startsWith("/gdrive/")) {
            try {
              const { extractFileId, deleteFromGoogleDrive } = await import("./googleDriveStorage");
              const fileId = extractFileId(m.filePath);
              if (fileId) await deleteFromGoogleDrive(fileId);
            } catch (err) { console.error("[Delete] Google Drive cascade delete failed:", err); }
          } else if (m.filePath.startsWith("/objects/")) {
            try {
              const { objectStorage } = await import("./objectStorage");
              const key = m.filePath.replace("/objects/", ".private/");
              await objectStorage.delete(key);
            } catch (err) { console.error("[Delete] Object storage cascade delete failed:", err); }
          } else {
            const fs = await import("fs");
            const localPath = m.filePath.startsWith('/') ? `.${m.filePath}` : m.filePath;
            if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
          }
        }
        await storage.deleteQuoteMedia(m.id);
      }

      await storage.deleteQuote(id);
      await logAuditEvent({
        req,
        entityType: "quote",
        entityId: id,
        action: "deleted",
        summary: `Devis ${quote.reference} supprimé définitivement`,
      });

      // Notify by email (always — including admins and root)
      {
        const { sendEmail } = await import("./emailService");
        await sendEmail({
          to: ["contact@myjantes.com", "rbelmahi90@gmail.com"],
          subject: `[ALERTE] Suppression définitive du Devis ${quote.reference}`,
          html: `
            <h3>Alerte Suppression Définitive</h3>
            <p>Le devis suivant a été supprimé du système par <strong>${(`${req.user.firstName || ''} ${req.user.lastName || ''}`).trim() || req.user.email}</strong> (${req.user.email}).</p>
            <ul>
              <li><strong>Référence :</strong> ${quote.reference}</li>
              <li><strong>Client :</strong> ${client?.firstName || ""} ${client?.lastName || ""} (${client?.email || "N/A"})</li>
              <li><strong>Montant :</strong> ${parseFloat(quote.quoteAmount || "0").toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</li>
              <li><strong>Garage :</strong> ${companyName}</li>
              <li><strong>Date de suppression :</strong> ${new Date().toLocaleString("fr-FR")}</li>
            </ul>
          `
        }).catch(err => console.error("[Delete Notification] Failed to send quote delete email:", err));
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting quote:", error);
      res.status(500).json({ message: error.message || "Erreur lors de la suppression" });
    }
  });

  // Delete invoice (permanent)
  app.delete("/api/admin/invoices/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const invoice = await storage.getInvoice(id);
      if (!invoice) return res.status(404).json({ message: "Facture non trouvée" });
      if (!hasGarageAccess(req.user, invoice.garageId)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }

      const client = await storage.getUser(invoice.clientId);
      const settings = await storage.getApplicationSettings();
      const companyName = settings?.companyName || "MyJantes";

      // Delete related items and media first
      const items = await storage.getInvoiceItems(id);
      for (const item of items) {
        await storage.deleteInvoiceItem(item.id);
      }
      const media = await storage.getInvoiceMedia(id);
      for (const m of media) {
        if (m.filePath) {
          if (m.filePath.startsWith("/gdrive/")) {
            try {
              const { extractFileId, deleteFromGoogleDrive } = await import("./googleDriveStorage");
              const fileId = extractFileId(m.filePath);
              if (fileId) await deleteFromGoogleDrive(fileId);
            } catch (err) { console.error("[Delete] Google Drive cascade delete failed:", err); }
          } else if (m.filePath.startsWith("/objects/")) {
            try {
              const { objectStorage } = await import("./objectStorage");
              const key = m.filePath.replace("/objects/", ".private/");
              await objectStorage.delete(key);
            } catch (err) { console.error("[Delete] Object storage cascade delete failed:", err); }
          } else {
            const fs = await import("fs");
            const localPath = m.filePath.startsWith('/') ? `.${m.filePath}` : m.filePath;
            if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
          }
        }
        await storage.deleteInvoiceMedia(m.id);
      }

      await storage.deleteInvoice(id);
      await logAuditEvent({
        req,
        entityType: "invoice",
        entityId: id,
        action: "deleted",
        summary: `Facture ${invoice.invoiceNumber} supprimée définitivement`,
      });

      // Notify by email (always — including admins and root)
      {
        const { sendEmail } = await import("./emailService");
        await sendEmail({
          to: ["contact@myjantes.com", "rbelmahi90@gmail.com"],
          subject: `[ALERTE] Suppression définitive de la Facture ${invoice.invoiceNumber}`,
          html: `
            <h3>Alerte Suppression Définitive</h3>
            <p>La facture suivante a été supprimée du système par <strong>${(`${req.user.firstName || ''} ${req.user.lastName || ''}`).trim() || req.user.email}</strong> (${req.user.email}).</p>
            <ul>
              <li><strong>N° Facture :</strong> ${invoice.invoiceNumber}</li>
              <li><strong>Client :</strong> ${client?.firstName || ""} ${client?.lastName || ""} (${client?.email || "N/A"})</li>
              <li><strong>Montant :</strong> ${parseFloat(invoice.amount || "0").toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</li>
              <li><strong>Garage :</strong> ${companyName}</li>
              <li><strong>Date de suppression :</strong> ${new Date().toLocaleString("fr-FR")}</li>
            </ul>
          `
        }).catch(err => console.error("[Delete Notification] Failed to send invoice delete email:", err));
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting invoice:", error);
      res.status(500).json({ message: error.message || "Erreur lors de la suppression" });
    }
  });

  // Delete reservation (permanent)
  app.delete("/api/admin/reservations/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const reservation = await storage.getReservation(id);
      if (!reservation) return res.status(404).json({ message: "Réservation non trouvée" });
      if (!hasGarageAccess(req.user, reservation.garageId)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }

      const client = await storage.getUser(reservation.clientId);
      const service = await storage.getService(reservation.serviceId);
      const settings = await storage.getApplicationSettings();
      const companyName = settings?.companyName || "MyJantes";

      await storage.deleteReservation(id);
      await logAuditEvent({
        req,
        entityType: "reservation",
        entityId: id,
        action: "deleted",
        summary: `Réservation supprimée définitivement`,
      });

      // Notify by email (always — including admins and root)
      {
        const { sendEmail } = await import("./emailService");
        await sendEmail({
          to: ["contact@myjantes.com", "rbelmahi90@gmail.com"],
          subject: `[ALERTE] Suppression définitive d'une Réservation`,
          html: `
            <h3>Alerte Suppression Définitive</h3>
            <p>La réservation suivante a été supprimée du système par <strong>${(`${req.user.firstName || ''} ${req.user.lastName || ''}`).trim() || req.user.email}</strong> (${req.user.email}).</p>
            <ul>
              <li><strong>Client :</strong> ${client?.firstName || ""} ${client?.lastName || ""} (${client?.email || "N/A"})</li>
              <li><strong>Prestation :</strong> ${service?.name || "N/A"}</li>
              <li><strong>Date prévue :</strong> ${reservation.scheduledDate ? new Date(reservation.scheduledDate).toLocaleString("fr-FR") : "N/A"}</li>
              <li><strong>Garage :</strong> ${companyName}</li>
              <li><strong>Date de suppression :</strong> ${new Date().toLocaleString("fr-FR")}</li>
            </ul>
          `
        }).catch(err => console.error("[Delete Notification] Failed to send reservation delete email:", err));
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting reservation:", error);
      res.status(500).json({ message: error.message || "Erreur lors de la suppression" });
    }
  });
  app.get("/api/admin/invoices/:id/items", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      // Check garage access for parent invoice
      const invoice = await storage.getInvoice(id);
      if (invoice && !hasGarageAccess(req.user, invoice.garageId)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }
      const items = await storage.getInvoiceItems(id);
      res.json(items);
    } catch (error) {
      console.error("Error fetching invoice items:", error);
      res.status(500).json({ message: "Failed to fetch invoice items" });
    }
  });

  app.post("/api/admin/invoices/:id/items", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      // Check garage access for parent invoice
      const invoice = await storage.getInvoice(id);
      if (invoice && !hasGarageAccess(req.user, invoice.garageId)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }
      const { insertInvoiceItemSchema } = await import("@shared/schema");
      const validatedData = insertInvoiceItemSchema.parse({ ...req.body, invoiceId: id });
      const item = await storage.createInvoiceItem(validatedData);
      // Recalculate invoice totals after creating item
      await storage.recalculateInvoiceTotals(id);
      res.json(item);
    } catch (error: any) {
      console.error("Error creating invoice item:", error);
      res.status(400).json({ message: error.message || "Failed to create invoice item" });
    }
  });

  app.patch("/api/admin/invoice-items/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const item = await storage.updateInvoiceItem(id, req.body);
      // Recalculate invoice totals after updating item
      await storage.recalculateInvoiceTotals(item.invoiceId);
      res.json(item);
    } catch (error: any) {
      console.error("Error updating invoice item:", error);
      res.status(400).json({ message: error.message || "Failed to update invoice item" });
    }
  });

  app.delete("/api/admin/invoice-items/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      // Get item first to know its invoiceId for recalculation
      const itemToDelete = await storage.getInvoiceItem(id);
      if (!itemToDelete) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      await storage.deleteInvoiceItem(id);
      // Recalculate invoice totals after deleting item
      await storage.recalculateInvoiceTotals(itemToDelete.invoiceId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting invoice item:", error);
      res.status(400).json({ message: error.message || "Failed to delete invoice item" });
    }
  });

  // Invoice Media routes
  app.get("/api/admin/invoices/:id/media", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      // Check garage access for parent invoice
      const invoice = await storage.getInvoice(id);
      if (invoice && !hasGarageAccess(req.user, invoice.garageId)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }
      const media = await storage.getInvoiceMedia(id);
      res.json(media);
    } catch (error) {
      console.error("Error fetching invoice media:", error);
      res.status(500).json({ message: "Failed to fetch invoice media" });
    }
  });

  app.post("/api/admin/invoices/:id/media", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const files = req.files;
      
      if (!files || !files.file) {
        return res.status(400).json({ message: "Fichier requis" });
      }

      const file = files.file;
      const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
      
      const invoice = await storage.getInvoice(id);
      const reference = invoice?.invoiceNumber || `FACTURE-${id.slice(0, 8).toUpperCase()}`;
      
      // Get existing media count for incremental naming
      const existingInvMedia = await storage.getInvoiceMedia(id);
      const nextInvIndex = (existingInvMedia?.length || 0) + 1;
      const ext = path.extname(file.name) || '.jpg';
      const newInvFileName = `${reference}_${nextInvIndex}${ext}`;
      
      let fileData: Buffer;
      if (file.tempFilePath) {
        fileData = fs.readFileSync(file.tempFilePath);
      } else if (file.data) {
        fileData = file.data;
      } else {
        return res.status(400).json({ message: "Impossible de lire le fichier" });
      }

      if (isImage) {
        try {
          const { addWatermarkToImage } = await import("./imageWatermark");
          fileData = await addWatermarkToImage(fileData, reference, file.mimetype);
          console.log(`[Watermark] Applied to image for reference: ${reference}`);
        } catch (watermarkError) {
          console.error("[Watermark] Failed to apply to image:", watermarkError);
        }
      }
    
      const filePath = await uploadToStorage(fileData, newInvFileName, "invoices");
      console.log(`[Upload] Invoice media uploaded: ${filePath}`);
      
      const media = await storage.createInvoiceMedia({
        invoiceId: id,
        fileName: newInvFileName,
        filePath,
        fileType: isImage ? "image" : "document",
        fileSize: fileData.length,
      });
      
      if (file.tempFilePath) {
        try { fs.unlinkSync(file.tempFilePath); } catch (_) {}
      }
      
      sendMediaZipByEmail("invoice", id, reference).catch(err =>
        console.error("[ZipEmail] Background invoice ZIP failed:", err)
      );
      
      res.json(media);
    } catch (error: any) {
      console.error("Error uploading invoice media:", error);
      res.status(500).json({ message: error.message || "Failed to upload media" });
    }
  });

  app.post("/api/admin/invoices/:id/media-zip", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const files = req.files;
      if (!files || !files.file) {
        return res.status(400).json({ message: "Fichier ZIP requis" });
      }
      const file = files.file;
      if (!file.name.toLowerCase().endsWith(".zip")) {
        return res.status(400).json({ message: "Seuls les fichiers ZIP sont acceptés" });
      }

      let zipData: Buffer;
      if (file.tempFilePath) {
        zipData = fs.readFileSync(file.tempFilePath);
      } else if (file.data) {
        zipData = file.data;
      } else {
        return res.status(400).json({ message: "Impossible de lire le fichier" });
      }

      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(zipData);

      const invoice = await storage.getInvoice(id);
      const reference = invoice?.invoiceNumber || `FACTURE-${id.slice(0, 8).toUpperCase()}`;
      const existingInvMedia = await storage.getInvoiceMedia(id);
      let nextIndex = (existingInvMedia?.length || 0) + 1;

      const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
      const results: any[] = [];

      for (const [fileName, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) continue;
        const ext = path.extname(fileName).toLowerCase();
        if (!imageExts.includes(ext)) continue;

        const baseName = path.basename(fileName);
        if (baseName.startsWith(".") || baseName.startsWith("__MACOSX")) continue;

        let fileData = Buffer.from(await zipEntry.async("arraybuffer"));
        const newFileName = `${reference}_${nextIndex}${ext}`;
        nextIndex++;

        try {
          const { addWatermarkToImage } = await import("./imageWatermark");
          const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
          fileData = await addWatermarkToImage(fileData, reference, mimeType);
        } catch (_) {}

        const filePath = await uploadToStorage(fileData, newFileName, "invoices");
        const media = await storage.createInvoiceMedia({
          invoiceId: id,
          fileName: newFileName,
          filePath,
          fileType: "image",
          fileSize: fileData.length,
        });
        results.push(media);
        console.log(`[ZIP] Invoice extracted and uploaded: ${baseName} -> ${newFileName}`);
      }

      if (file.tempFilePath) {
        try { fs.unlinkSync(file.tempFilePath); } catch (_) {}
      }

      if (results.length === 0) {
        return res.status(400).json({ message: "Aucune image trouvée dans le fichier ZIP" });
      }

      sendMediaZipByEmail("invoice", id, reference).catch(err =>
        console.error("[ZipEmail] Background invoice ZIP failed:", err)
      );

      res.json({ success: true, count: results.length, media: results });
    } catch (error: any) {
      console.error("Error uploading invoice ZIP:", error);
      res.status(500).json({ message: error.message || "Erreur lors de l'extraction du ZIP" });
    }
  });

  app.delete("/api/admin/invoice-media/:mediaId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { mediaId } = req.params;
      
      const media = await storage.getInvoiceMediaById(mediaId);
      if (!media) {
        return res.status(404).json({ message: "Media not found" });
      }
      
      if (media.filePath) {
        if (media.filePath.startsWith("/gdrive/")) {
          try {
            const { extractFileId, deleteFromGoogleDrive } = await import("./googleDriveStorage");
            const fileId = extractFileId(media.filePath);
            if (fileId) await deleteFromGoogleDrive(fileId);
          } catch (err) { console.error("[Delete] Google Drive delete failed:", err); }
        } else if (media.filePath.startsWith("/objects/")) {
          try {
            await deleteMedia(media.filePath);
          } catch (err) { console.error("[Delete] Object Storage delete failed:", err); }
        } else if (media.filePath.startsWith("https://storage.googleapis.com/")) {
          try {
            const { deleteFromFirebaseStorage } = await import("./firebase");
            await deleteFromFirebaseStorage(media.filePath);
          } catch (err) { console.error("[Delete] Firebase delete failed:", err); }
        } else {
          const fs = await import("fs");
          const localPath = media.filePath.startsWith('/') ? `.${media.filePath}` : media.filePath;
          if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
        }
      }
      
      await storage.deleteInvoiceMedia(mediaId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting invoice media:", error);
      res.status(500).json({ message: error.message || "Failed to delete media" });
    }
  });

  app.get("/api/admin/invoices/:id/media/download-zip", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const invoice = await storage.getInvoice(id);
      if (invoice && !hasGarageAccess(req.user, invoice.garageId)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }
      const mediaList = await storage.getInvoiceMedia(id);
      if (!mediaList || mediaList.length === 0) {
        return res.status(404).json({ message: "Aucune photo à télécharger" });
      }

      const reference = invoice?.invoiceNumber || `FACTURE-${id.slice(0, 8).toUpperCase()}`;
      const archiver = (await import("archiver")).default;
      const archive = archiver("zip", { zlib: { level: 5 } });

      res.set({
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="photos_${reference}.zip"`,
      });
      archive.pipe(res);

      for (let i = 0; i < mediaList.length; i++) {
        const m = mediaList[i];
        try {
          const buffer = await downloadMediaBuffer(m.filePath);
          if (buffer) {
            const ext = path.extname(m.fileName || ".jpg");
            const cleanName = `facture_${reference}_${i + 1}${ext}`;
            archive.append(buffer, { name: cleanName });
          }
        } catch (fileErr) {
          console.error(`[ZIP] Error reading file ${m.filePath}:`, fileErr);
        }
      }

      await archive.finalize();
    } catch (error: any) {
      console.error("Error creating invoice media ZIP:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: error.message || "Erreur lors de la création du ZIP" });
      }
    }
  });

  // Bulk ZIP import: auto-match media to quotes/invoices by reference in filename
  app.post("/api/admin/bulk-media-zip", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const files = req.files;
      if (!files || !files.file) {
        return res.status(400).json({ message: "Fichier ZIP requis" });
      }
      const file = files.file;
      if (!file.name.toLowerCase().endsWith(".zip")) {
        return res.status(400).json({ message: "Seuls les fichiers ZIP sont acceptés" });
      }

      let zipData: Buffer;
      if (file.tempFilePath) {
        zipData = fs.readFileSync(file.tempFilePath);
      } else if (file.data) {
        zipData = file.data;
      } else {
        return res.status(400).json({ message: "Impossible de lire le fichier" });
      }

      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(zipData);
      const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

      const allQuotes = await db.select({ id: quotes.id, reference: quotes.reference }).from(quotes);
      const allInvoices = await db.select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber }).from(invoices);

      const quoteMap = new Map<string, string>();
      for (const q of allQuotes) {
        if (q.reference) quoteMap.set(q.reference.toUpperCase(), q.id);
      }
      const invoiceMap = new Map<string, string>();
      for (const inv of allInvoices) {
        if (inv.invoiceNumber) invoiceMap.set(inv.invoiceNumber.toUpperCase(), inv.id);
      }

      const results: Array<{ fileName: string; matched: boolean; type?: string; reference?: string; error?: string }> = [];
      const matchCounters: Record<string, number> = {};

      for (const [fileName, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) continue;
        const ext = path.extname(fileName).toLowerCase();
        if (!imageExts.includes(ext)) continue;

        const baseName = path.basename(fileName);
        if (baseName.startsWith(".") || baseName.startsWith("__MACOSX")) continue;

        const upperName = baseName.toUpperCase();

        let matchedType: "quote" | "invoice" | null = null;
        let matchedId: string | null = null;
        let matchedRef: string | null = null;

        let bestMatchLen = 0;
        for (const [ref, id] of Array.from(quoteMap.entries())) {
          if (ref.length >= 3 && upperName.includes(ref) && ref.length > bestMatchLen) {
            const idx = upperName.indexOf(ref);
            const before = idx > 0 ? upperName[idx - 1] : "_";
            const after = idx + ref.length < upperName.length ? upperName[idx + ref.length] : "_";
            if (/[^A-Z0-9]/.test(before) && /[^A-Z0-9]/.test(after)) {
              matchedType = "quote";
              matchedId = id;
              matchedRef = ref;
              bestMatchLen = ref.length;
            }
          }
        }

        if (!matchedType) {
          bestMatchLen = 0;
          for (const [ref, id] of Array.from(invoiceMap.entries())) {
            if (ref.length >= 3 && upperName.includes(ref) && ref.length > bestMatchLen) {
              const idx = upperName.indexOf(ref);
              const before = idx > 0 ? upperName[idx - 1] : "_";
              const after = idx + ref.length < upperName.length ? upperName[idx + ref.length] : "_";
              if (/[^A-Z0-9]/.test(before) && /[^A-Z0-9]/.test(after)) {
                matchedType = "invoice";
                matchedId = id;
                matchedRef = ref;
                bestMatchLen = ref.length;
              }
            }
          }
        }

        if (!matchedType || !matchedId || !matchedRef) {
          results.push({ fileName: baseName, matched: false, error: "Aucune référence trouvée dans le nom du fichier" });
          continue;
        }

        try {
          let fileData = Buffer.from(await zipEntry.async("arraybuffer"));

          const counterKey = `${matchedType}_${matchedId}`;
          if (!matchCounters[counterKey]) {
            const existing = matchedType === "quote" 
              ? await storage.getQuoteMedia(matchedId)
              : await storage.getInvoiceMedia(matchedId);
            matchCounters[counterKey] = (existing?.length || 0) + 1;
          }
          const idx = matchCounters[counterKey]++;
          const newFileName = `${matchedRef}_${idx}${ext}`;

          try {
            const { addWatermarkToImage } = await import("./imageWatermark");
            const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
            fileData = await addWatermarkToImage(fileData, matchedRef, mimeType);
          } catch (_) {}

          const folder = matchedType === "quote" ? "quotes" : "invoices";
          const filePath = await uploadToStorage(fileData, newFileName, folder);

          if (matchedType === "quote") {
            await storage.createQuoteMedia({
              quoteId: matchedId,
              fileName: newFileName,
              filePath,
              fileType: "image",
              fileSize: fileData.length,
            });
          } else {
            await storage.createInvoiceMedia({
              invoiceId: matchedId,
              fileName: newFileName,
              filePath,
              fileType: "image",
              fileSize: fileData.length,
            });
          }

          results.push({ fileName: baseName, matched: true, type: matchedType, reference: matchedRef });
          console.log(`[BulkZIP] ${baseName} -> ${matchedType} ${matchedRef} (${newFileName})`);
        } catch (err: any) {
          results.push({ fileName: baseName, matched: false, error: err.message });
        }
      }

      if (file.tempFilePath) {
        try { fs.unlinkSync(file.tempFilePath); } catch (_) {}
      }

      const matched = results.filter(r => r.matched).length;
      const unmatched = results.filter(r => !r.matched).length;
      res.json({ success: true, total: results.length, matched, unmatched, details: results });
    } catch (error: any) {
      console.error("Error processing bulk ZIP:", error);
      res.status(500).json({ message: error.message || "Erreur lors de l'import ZIP" });
    }
  });

  // Manual media backup trigger
  app.post("/api/admin/media-backup-now", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { performMediaBackup } = await import("./backupScheduler");
      const result = await performMediaBackup();
      res.json(result);
    } catch (error: any) {
      console.error("Error triggering media backup:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==================== MEDIA SCAN & CLEANUP ====================

  app.get("/api/admin/media/scan-broken", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const { sql: sqlTag } = await import("drizzle-orm");

      const quoteMediaRows = await db.execute(sqlTag`SELECT id, file_path, file_name FROM quote_media`);
      const invoiceMediaRows = await db.execute(sqlTag`SELECT id, file_path, file_name FROM invoice_media`);

      const allMedia = [
        ...quoteMediaRows.rows.map((r: any) => ({ ...r, table: "quote_media" })),
        ...invoiceMediaRows.rows.map((r: any) => ({ ...r, table: "invoice_media" })),
      ];

      let uploadsBroken = 0;
      let objectsAccessible = 0;
      let objectsBroken = 0;

      const svc = new ObjectStorageService();
      const fileList = await svc.listFiles(undefined, 1000);
      const bucketFiles = new Set<string>(fileList);

      const brokenItems: any[] = [];

      for (const m of allMedia) {
        const fp = m.file_path as string;
        if (!fp) continue;

        if (fp.startsWith("/uploads/")) {
          uploadsBroken++;
          brokenItems.push({ id: m.id, table: m.table, file_path: fp, file_name: m.file_name, reason: "local_disk" });
        } else if (fp.startsWith("/objects/")) {
          const bucketKey = fp.replace(/^\/objects\//, "");
          if (bucketFiles.has(bucketKey)) {
            objectsAccessible++;
          } else {
            objectsBroken++;
            brokenItems.push({ id: m.id, table: m.table, file_path: fp, file_name: m.file_name, reason: "old_bucket" });
          }
        }
      }

      res.json({
        total: allMedia.length,
        accessible: objectsAccessible,
        broken: uploadsBroken + objectsBroken,
        uploadsBroken,
        objectsBroken,
        brokenItems: brokenItems.slice(0, 200),
      });
    } catch (error: any) {
      console.error("[MediaScan] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/admin/media/cleanup-broken", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const { sql: sqlTag } = await import("drizzle-orm");

      const svc = new ObjectStorageService();
      const fileList2 = await svc.listFiles(undefined, 1000);
      const bucketFiles = new Set<string>(fileList2);

      const quoteMediaRows = await db.execute(sqlTag`SELECT id, file_path FROM quote_media`);
      const invoiceMediaRows = await db.execute(sqlTag`SELECT id, file_path FROM invoice_media`);

      const quoteMediaBrokenIds: string[] = [];
      const invoiceMediaBrokenIds: string[] = [];

      for (const m of quoteMediaRows.rows as any[]) {
        const fp = m.file_path as string;
        if (!fp) continue;
        const isBroken = fp.startsWith("/uploads/") || (fp.startsWith("/objects/") && !bucketFiles.has(fp.replace(/^\/objects\//, "")));
        if (isBroken) quoteMediaBrokenIds.push(m.id);
      }

      for (const m of invoiceMediaRows.rows as any[]) {
        const fp = m.file_path as string;
        if (!fp) continue;
        const isBroken = fp.startsWith("/uploads/") || (fp.startsWith("/objects/") && !bucketFiles.has(fp.replace(/^\/objects\//, "")));
        if (isBroken) invoiceMediaBrokenIds.push(m.id);
      }

      let deletedCount = 0;

      if (quoteMediaBrokenIds.length > 0) {
        await db.execute(sqlTag`DELETE FROM quote_media WHERE id = ANY(${quoteMediaBrokenIds}::text[])`);
        deletedCount += quoteMediaBrokenIds.length;
      }

      if (invoiceMediaBrokenIds.length > 0) {
        await db.execute(sqlTag`DELETE FROM invoice_media WHERE id = ANY(${invoiceMediaBrokenIds}::text[])`);
        deletedCount += invoiceMediaBrokenIds.length;
      }

      console.log(`[MediaCleanup] Deleted ${deletedCount} broken media records (${quoteMediaBrokenIds.length} quote + ${invoiceMediaBrokenIds.length} invoice)`);

      res.json({
        success: true,
        deletedCount,
        quoteMediaDeleted: quoteMediaBrokenIds.length,
        invoiceMediaDeleted: invoiceMediaBrokenIds.length,
      });
    } catch (error: any) {
      console.error("[MediaCleanup] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Reservation routes
  app.get("/api/reservations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const reservations = await storage.getReservations(userId);
      res.json(reservations);
    } catch (error) {
      console.error("Error fetching reservations:", error);
      res.status(500).json({ message: "Failed to fetch reservations" });
    }
  });

  // ==================== DELIVERY NOTES (Bons de Livraison) ====================
  
  app.get("/api/admin/delivery-notes", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageId = getGarageScope(req.user);
      const notes = await storage.getDeliveryNotes(undefined, garageId);
      const notesWithClient = await Promise.all(notes.map(async (note) => {
        const client = await storage.getUser(note.clientId);
        const dnInvoices = await storage.getDeliveryNoteInvoices(note.id);
        return { ...note, client, invoices: dnInvoices.map(dni => dni.invoice) };
      }));
      res.json(notesWithClient);
    } catch (error) {
      console.error("Error fetching delivery notes:", error);
      res.status(500).json({ message: "Failed to fetch delivery notes" });
    }
  });

  app.get("/api/admin/delivery-notes/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const note = await storage.getDeliveryNote(req.params.id);
      if (!note) {
        return res.status(404).json({ message: "Delivery note not found" });
      }
      if (!hasGarageAccess(req.user, note.garageId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const client = await storage.getUser(note.clientId);
      const dnInvoices = await storage.getDeliveryNoteInvoices(note.id);
      const invoicesWithDetails = await Promise.all(dnInvoices.map(async (dni) => {
        const items = await storage.getInvoiceItems(dni.invoice.id);
        const media = await storage.getInvoiceMedia(dni.invoice.id);
        return { ...dni.invoice, items, media };
      }));
      res.json({ ...note, client, invoices: invoicesWithDetails });
    } catch (error) {
      console.error("Error fetching delivery note:", error);
      res.status(500).json({ message: "Failed to fetch delivery note" });
    }
  });

  app.post("/api/admin/delivery-notes", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { clientId, invoiceIds, notes } = req.body;
      
      if (!clientId || typeof clientId !== 'string') {
        return res.status(400).json({ message: "Client ID is required" });
      }
      if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
        return res.status(400).json({ message: "At least one invoice is required" });
      }

      const garageId = req.user?.garageId || null;

      for (const invoiceId of invoiceIds) {
        const invoice = await storage.getInvoice(invoiceId);
        if (!invoice) {
          return res.status(400).json({ message: `Invoice ${invoiceId} not found` });
        }
        if (!hasGarageAccess(req.user, invoice.garageId)) {
          return res.status(403).json({ message: `Access denied for invoice ${invoiceId}` });
        }
        if (invoice.clientId !== clientId) {
          return res.status(400).json({ message: `Invoice ${invoice.invoiceNumber} does not belong to the selected client` });
        }
      }

      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      const mm = String(month).padStart(2, '0');

      const counter = await storage.incrementDeliveryNoteCounter(month, year);
      const deliveryNoteNumber = `BLV-${mm}-${String(counter.currentNumber).padStart(4, '0')}`;

      let totalHT = 0;
      let totalTVA = 0;
      let totalAmount = 0;

      for (const invoiceId of invoiceIds) {
        const invoice = await storage.getInvoice(invoiceId);
        if (invoice) {
          const items = await storage.getInvoiceItems(invoiceId);
          if (items.length > 0) {
            totalHT += items.reduce((sum, item) => sum + parseFloat(item.totalExcludingTax || '0'), 0);
            totalTVA += items.reduce((sum, item) => sum + parseFloat(item.taxAmount || '0'), 0);
            totalAmount += items.reduce((sum, item) => sum + parseFloat(item.totalIncludingTax || '0'), 0);
          } else {
            totalHT += parseFloat(invoice.priceExcludingTax || '0');
            totalTVA += parseFloat(invoice.taxAmount || '0');
            totalAmount += parseFloat(invoice.amount || '0');
          }
        }
      }

      const note = await storage.createDeliveryNote({
        clientId,
        garageId,
        month,
        year,
        deliveryNoteNumber,
        totalAmount: String(totalAmount.toFixed(2)),
        totalHT: String(totalHT.toFixed(2)),
        totalTVA: String(totalTVA.toFixed(2)),
        status: "draft",
        notes: notes || null,
      } as any);

      await storage.setDeliveryNoteInvoices(note.id, invoiceIds);

      res.json(note);
    } catch (error) {
      console.error("Error creating delivery note:", error);
      res.status(500).json({ message: "Failed to create delivery note" });
    }
  });

  app.patch("/api/admin/delivery-notes/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const existingNote = await storage.getDeliveryNote(req.params.id);
      if (!existingNote) {
        return res.status(404).json({ message: "Delivery note not found" });
      }
      if (!hasGarageAccess(req.user, existingNote.garageId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { status, showPrices } = req.body;
      const validStatuses = ["draft", "finalized", "paid"];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const updateData: any = {};
      if (status) updateData.status = status;
      if (showPrices !== undefined) updateData.showPrices = showPrices;
      if (req.body.notes !== undefined) updateData.notes = req.body.notes;

      const updated = await storage.updateDeliveryNote(req.params.id, updateData);
      res.json(updated);
    } catch (error) {
      console.error("Error updating delivery note:", error);
      res.status(500).json({ message: "Failed to update delivery note" });
    }
  });

  app.delete("/api/admin/delivery-notes/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const existingNote = await storage.getDeliveryNote(req.params.id);
      if (!existingNote) {
        return res.status(404).json({ message: "Delivery note not found" });
      }
      if (!hasGarageAccess(req.user, existingNote.garageId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (existingNote.status !== "draft") {
        return res.status(400).json({ message: "Only draft delivery notes can be deleted" });
      }
      await storage.deleteDeliveryNote(req.params.id);
      res.json({ message: "Delivery note deleted" });
    } catch (error) {
      console.error("Error deleting delivery note:", error);
      res.status(500).json({ message: "Failed to delete delivery note" });
    }
  });

  app.get("/api/admin/clients/:clientId/invoices", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageId = getGarageScope(req.user);
      const invoiceList = await storage.getInvoices(req.params.clientId, garageId);
      res.json(invoiceList);
    } catch (error) {
      console.error("Error fetching client invoices:", error);
      res.status(500).json({ message: "Failed to fetch client invoices" });
    }
  });

  // ========== CLIENT DOSSIER ROUTE ==========

  app.get("/api/admin/clients/:clientId/dossier", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { clientId } = req.params;
      const garageId = getGarageScope(req.user);
      const [clientQuotes, clientInvoices, clientReservations, clientEngagements] = await Promise.all([
        storage.getQuotes(clientId, garageId),
        storage.getInvoices(clientId, garageId),
        storage.getReservations(clientId, garageId),
        storage.getEngagements(clientId),
      ]);
      const totalRevenue = clientInvoices.reduce((sum: number, inv: any) => sum + (parseFloat(inv.totalTTC) || 0), 0);
      const paidRevenue = clientInvoices.filter((i: any) => i.status === "paid" || i.status === "completed").reduce((sum: number, inv: any) => sum + (parseFloat(inv.totalTTC) || 0), 0);
      const paidInvoices = clientInvoices.filter((i: any) => i.status === "paid" || i.status === "completed");
      const pendingInvoices = clientInvoices.filter((i: any) => i.status === "pending" || i.status === "sent");

      const quotesAccepted = clientQuotes.filter((q: any) => q.status === "accepted" || q.status === "converted").length;
      const quotesPending = clientQuotes.filter((q: any) => q.status === "pending" || q.status === "sent" || q.status === "draft").length;
      const quotesRefused = clientQuotes.filter((q: any) => q.status === "refused" || q.status === "rejected").length;
      const conversionRate = clientQuotes.length > 0 ? Math.round((clientInvoices.length / clientQuotes.length) * 100) : 0;

      const quotesWithAmount = clientQuotes.filter((q: any) => parseFloat(q.totalTTC || q.amount || "0") > 0);
      const avgQuoteAmount = quotesWithAmount.length > 0
        ? quotesWithAmount.reduce((sum: number, q: any) => sum + parseFloat(q.totalTTC || q.amount || "0"), 0) / quotesWithAmount.length
        : 0;
      const avgInvoiceAmount = clientInvoices.length > 0 ? totalRevenue / clientInvoices.length : 0;

      const allDates = [
        ...clientReservations.map((r: any) => r.createdAt),
        ...clientQuotes.map((q: any) => q.createdAt),
        ...clientInvoices.map((i: any) => i.createdAt),
      ].filter(Boolean).sort();
      const firstVisit = allDates.length > 0 ? allDates[0] : null;
      const lastVisit = allDates.length > 0 ? allDates[allDates.length - 1] : null;

      const invoicesByQuote: Record<string, any> = {};
      for (const inv of clientInvoices) {
        if (inv.quoteId) invoicesByQuote[inv.quoteId] = inv;
      }
      let totalDelay = 0;
      let delayCount = 0;
      for (const q of clientQuotes) {
        const inv = invoicesByQuote[q.id];
        if (inv && q.createdAt && inv.createdAt) {
          const diff = new Date(inv.createdAt).getTime() - new Date(q.createdAt).getTime();
          if (diff >= 0) {
            totalDelay += diff / (1000 * 60 * 60 * 24);
            delayCount++;
          }
        }
      }
      const avgDelayDays = delayCount > 0 ? Math.round(totalDelay / delayCount) : null;

      let loyaltyTier = "Bronze";
      if (paidRevenue >= 5000 || paidInvoices.length >= 10) loyaltyTier = "Platine";
      else if (paidRevenue >= 2000 || paidInvoices.length >= 5) loyaltyTier = "Or";
      else if (paidRevenue >= 500 || paidInvoices.length >= 2) loyaltyTier = "Argent";
      res.json({
        quotes: clientQuotes,
        invoices: clientInvoices,
        reservations: clientReservations,
        engagements: clientEngagements,
        stats: {
          totalRevenue,
          paidRevenue,
          quotesCount: clientQuotes.length,
          invoicesCount: clientInvoices.length,
          reservationsCount: clientReservations.length,
          engagementsCount: clientEngagements.length,
          paidCount: paidInvoices.length,
          pendingInvoicesCount: pendingInvoices.length,
          quotesAccepted,
          quotesPending,
          quotesRefused,
          conversionRate,
          avgQuoteAmount: Math.round(avgQuoteAmount * 100) / 100,
          avgInvoiceAmount: Math.round(avgInvoiceAmount * 100) / 100,
          firstVisit,
          lastVisit,
          avgDelayDays,
          loyaltyTier,
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== MEDIA PROXY ROUTE (serves media from all backends) ==========

  app.get("/api/media/serve", isAuthenticated, async (req: any, res) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) return res.status(400).json({ error: "path is required" });

      const ext = filePath.split('.').pop()?.toLowerCase() || '';
      const mimeMap: Record<string, string> = {
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
        gif: "image/gif", webp: "image/webp", pdf: "application/pdf",
        mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
      };
      const contentType = mimeMap[ext] || "application/octet-stream";

      res.set("Cache-Control", "private, max-age=3600");
      res.set("Content-Type", contentType);

      if (filePath.startsWith("/objects/")) {
        const data = await downloadFileFromPath(filePath);
        if (data) return res.send(data);
        return res.status(404).end();
      } else if (filePath.startsWith("/gdrive/")) {
        const { extractFileId, downloadFromGoogleDrive } = await import("./googleDriveStorage");
        const fileId = extractFileId(filePath);
        if (!fileId) return res.status(404).end();
        const result = await downloadFromGoogleDrive(fileId);
        return res.send(result.data);
      } else if (filePath.startsWith("/r2/") || filePath.startsWith("https://")) {
        const { downloadFromR2, extractR2Key } = await import("./cloudflareR2Service");
        const key = extractR2Key(filePath);
        if (!key) return res.status(404).end();
        const { data } = await downloadFromR2(key);
        return res.send(data);
      } else if (filePath.startsWith("/uploads/")) {
        const localPath = path.join(process.cwd(), filePath);
        if (fs.existsSync(localPath)) return res.sendFile(localPath);
        return res.status(404).end();
      }
      return res.status(404).json({ error: "Unknown storage backend" });
    } catch (err: any) {
      console.error("[MediaProxy] Error:", err.message);
      if (!res.headersSent) res.status(404).end();
    }
  });

  // ========== ICS CALENDAR ROUTES ==========

  function escapeICS(text: string): string {
    return (text || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n').replace(/\r/g, '');
  }

  function formatICSDate(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  function foldICSLine(line: string): string {
    if (line.length <= 75) return line;
    const parts: string[] = [];
    let pos = 0;
    while (pos < line.length) {
      if (pos === 0) { parts.push(line.slice(0, 75)); pos = 75; }
      else { parts.push(' ' + line.slice(pos, pos + 74)); pos += 74; }
    }
    return parts.join('\r\n');
  }

  function buildICSEvent(reservation: any, clientName: string, serviceName: string, companyAddress: string): string[] {
    const start = new Date(reservation.scheduledDate);
    const end = reservation.estimatedEndDate ? new Date(reservation.estimatedEndDate) : new Date(start.getTime() + 60 * 60 * 1000);
    const statusMap: Record<string, string> = { confirmed: 'CONFIRMED', pending: 'TENTATIVE', completed: 'CONFIRMED', cancelled: 'CANCELLED' };
    const icsStatus = statusMap[reservation.status] || 'TENTATIVE';
    const summary = `${escapeICS(serviceName)} - ${escapeICS(clientName)}`;
    const description = [
      `Référence: ${reservation.reference || reservation.id.slice(0, 8).toUpperCase()}`,
      `Client: ${clientName}`,
      `Service: ${serviceName}`,
      `Statut: ${reservation.status}`,
      reservation.notes ? `Notes: ${reservation.notes}` : '',
    ].filter(Boolean).join('\\n');
    return [
      'BEGIN:VEVENT',
      `UID:${reservation.id}@myjantes.fr`,
      `DTSTART:${formatICSDate(start)}`,
      `DTEND:${formatICSDate(end)}`,
      `DTSTAMP:${formatICSDate(new Date())}`,
      `SUMMARY:${escapeICS(summary)}`,
      `DESCRIPTION:${escapeICS(description)}`,
      companyAddress ? `LOCATION:${escapeICS(companyAddress)}` : '',
      `STATUS:${icsStatus}`,
      `SEQUENCE:0`,
      'END:VEVENT',
    ].filter(Boolean);
  }

  // Generate or get the calendar token (admin)
  app.post("/api/admin/calendar/regenerate-token", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const token = crypto.randomBytes(32).toString('hex');
      await storage.createOrUpdateApplicationSettings({ calendarToken: token });
      res.json({ token });
    } catch (error) {
      res.status(500).json({ message: "Erreur génération token" });
    }
  });

  // ICS Feed - public URL (uses calendarToken from settings)
  app.get("/api/calendar/:token/feed.ics", async (req, res) => {
    try {
      const { token } = req.params;
      const settings = await storage.getApplicationSettings();
      if (!settings?.calendarToken || settings.calendarToken !== token) {
        return res.status(403).send('Token invalide');
      }
      const allReservations = await storage.getReservations();
      const [allUsers, allServices] = await Promise.all([
        db.select().from(users),
        db.select().from(services),
      ]);
      const userMap = Object.fromEntries(allUsers.map(u => [u.id, `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email]));
      const serviceMap = Object.fromEntries(allServices.map(s => [s.id, s.name]));
      const address = [settings.companyAddress, settings.companyPostalCode, settings.companyCity].filter(Boolean).join(', ');
      const events: string[] = [];
      for (const r of allReservations) {
        const clientName = userMap[r.clientId] || 'Client';
        const serviceName = serviceMap[r.serviceId] || 'Service';
        events.push(...buildICSEvent(r, clientName, serviceName, address));
      }
      const companyName = settings.companyName || 'MyJantes';
      const icsLines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        `PRODID:-//${escapeICS(companyName)}//Calendrier Réservations//FR`,
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${escapeICS(companyName)} - Planning`,
        'X-WR-TIMEZONE:Europe/Paris',
        'X-WR-CALDESC:Toutes les réservations',
        ...events,
        'END:VCALENDAR',
      ];
      const icsContent = icsLines.map(line => foldICSLine(line)).join('\r\n');
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="myjantes-planning.ics"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(icsContent);
    } catch (error) {
      console.error('[ICS Feed] Error:', error);
      res.status(500).send('Erreur serveur');
    }
  });

  // Single reservation ICS (public - by reservation ID, accessible from public booking page)
  app.get("/api/public/reservations/:id/ics", async (req, res) => {
    try {
      const { id } = req.params;
      const reservation = await storage.getReservation(id);
      if (!reservation) return res.status(404).send('Réservation non trouvée');
      const settings = await storage.getApplicationSettings();
      const [clientUser, service] = await Promise.all([
        storage.getUser(reservation.clientId),
        storage.getService(reservation.serviceId),
      ]);
      const clientName = clientUser ? `${clientUser.firstName || ''} ${clientUser.lastName || ''}`.trim() || clientUser.email : 'Client';
      const serviceName = service?.name || 'Service';
      const address = settings ? [settings.companyAddress, settings.companyPostalCode, settings.companyCity].filter(Boolean).join(', ') : '';
      const companyName = settings?.companyName || 'MyJantes';
      const eventLines = buildICSEvent(reservation, clientName, serviceName, address);
      const icsLines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        `PRODID:-//${escapeICS(companyName)}//Reservation//FR`,
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        ...eventLines,
        'END:VCALENDAR',
      ];
      const icsContent = icsLines.map(line => foldICSLine(line)).join('\r\n');
      const ref = reservation.reference || reservation.id.slice(0, 8).toUpperCase();
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="reservation-${ref}.ics"`);
      res.send(icsContent);
    } catch (error) {
      console.error('[ICS Single] Error:', error);
      res.status(500).send('Erreur serveur');
    }
  });

  app.get("/api/admin/reservations", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      if (req.tenantSchema) {
        const ts = createTenantStorage(req.tenantGarageSlug);
        const reservationList = await ts.getReservations();
        return res.json(reservationList);
      }
      const garageId = (req.user?.role === "superadmin" || req.user?.role === "root") ? undefined : req.user?.garageId;
      const reservationList = await storage.getReservations(undefined, garageId);
      res.json(reservationList);
    } catch (error) {
      console.error("Error fetching reservations:", error);
      res.status(500).json({ message: "Failed to fetch reservations" });
    }
  });

  // Get additional services for a specific reservation
  app.get("/api/admin/reservations/:id/services", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const services = await storage.getReservationServices(id);
      res.json(services);
    } catch (error) {
      console.error("Error fetching reservation services:", error);
      res.status(500).json({ message: "Failed to fetch reservation services" });
    }
  });

  app.post("/api/admin/reservations", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { additionalServiceIds, ...reservationData } = req.body;
      const validatedData = insertReservationSchema.parse(reservationData);

      const scheduledDate = new Date(validatedData.scheduledDate);
      const mm = String(scheduledDate.getMonth() + 1).padStart(2, '0');
      const jj = String(scheduledDate.getDate()).padStart(2, '0');
      const prefix = `RES-${mm}-${jj}-`;

      let reservation: any = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const existing = await db.execute(sql`SELECT reference FROM reservations WHERE reference LIKE ${prefix + '%'} ORDER BY reference DESC LIMIT 1`);
          let seq = 1;
          if (existing.rows && existing.rows.length > 0) {
            const lastRef = (existing.rows[0] as any).reference as string;
            const lastSeq = parseInt(lastRef.split('-').pop() || '0', 10);
            seq = lastSeq + 1;
          }
          (validatedData as any).reference = `${prefix}${String(seq).padStart(2, '0')}`;
          reservation = await storage.createReservation(validatedData);
          break;
        } catch (err: any) {
          if (err.message?.includes('unique') && attempt < 4) {
            continue;
          }
          throw err;
        }
      }

      // Add additional services if provided
      if (additionalServiceIds && Array.isArray(additionalServiceIds) && additionalServiceIds.length > 0) {
        await storage.setReservationServices(reservation.id, additionalServiceIds);
      }

      // Initialize workflow tasks for this reservation if service has workflows
      try {
        const serviceWorkflows = await storage.getServiceWorkflows(reservation.serviceId);
        for (const workflow of serviceWorkflows) {
          const workflowSteps = await storage.getWorkflowSteps(workflow.id);
          await storage.initializeReservationWorkflow(reservation.id, workflowSteps);
        }
      } catch (error) {
        console.log("No workflows for this service or error initializing tasks:", error);
      }

      // Send SMS notification to client
      if (reservation.clientId) {
        try {
          const clientUser = await storage.getUser(reservation.clientId);
          if (clientUser?.phone && clientUser.smsConsent) {
            await sendEventSms({
              userPhone: clientUser.phone,
              userSmsConsent: clientUser.smsConsent,
              userName: `${clientUser.firstName || ''} ${clientUser.lastName || ''}`.trim(),
              eventType: "reservation_confirmed",
              eventTitle: (reservation as any).reference || 'votre rendez-vous',
              eventDetails: reservation.date ? new Date(reservation.date).toLocaleString('fr-FR') : undefined
            });
          }

          // Notify staff
          const staffMembers = await storage.getUsersByRoles(['admin', 'employee']);
          for (const staff of staffMembers) {
            if (staff.phone && isFrenchMobile(staff.phone)) {
              await sendSms({
                to: staff.phone,
                eventType: 'reservation_confirmed',
                eventTitle: `Nouveau RDV : ${(reservation as any).reference || ''}`,
                eventDetails: `Client : ${clientUser ? (clientUser.firstName + ' ' + clientUser.lastName) : 'Client'} - ${reservation.date ? new Date(reservation.date).toLocaleString('fr-FR') : ''}`,
                recipientName: `${staff.firstName || ''} ${staff.lastName || ''}`.trim()
              });
            }
          }
        } catch (smsErr) {
          console.error("[SMS] Failed to send reservation confirmation SMS:", smsErr);
        }
      }

      // Send WebSocket notification
      const client = wsClients.get(reservation.clientId);
      if (client && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: "reservation_confirmed",
          reservationId: reservation.id,
        }));
      }
      
      // Notify rootadmin immediately (fire-and-forget)
      notifyRootAdmin("reservation", reservation).catch(() => {});

      // Return reservation with additional services
      const additionalServices = await storage.getReservationServices(reservation.id);
      res.json({ ...reservation, additionalServices });
    } catch (error: any) {
      console.error("Error creating reservation:", error);
      res.status(400).json({ message: error.message || "Failed to create reservation" });
    }
  });
  
  // Get additional services for a reservation
  app.get("/api/admin/reservations/:id/services", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const services = await storage.getReservationServices(id);
      res.json(services);
    } catch (error) {
      console.error("Error fetching reservation services:", error);
      res.status(500).json({ message: "Failed to fetch reservation services" });
    }
  });

  // Notification routes
  app.get("/api/notifications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      if (req.tenantSchema) {
        const ts = createTenantStorage(req.tenantGarageSlug);
        const notifications = await ts.getNotifications(userId);
        return res.json(notifications);
      }
      const notifications = await storage.getNotifications(userId);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.patch("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.markNotificationAsRead(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  app.get("/api/invoices/:id/pdf", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const invoice = await storage.getInvoice(id);
      if (!invoice) return res.status(404).json({ message: "Facture non trouvée" });
      
      const items = await storage.getInvoiceItems(id);
      const client = await storage.getUser(invoice.clientId);
      const settings = await storage.getApplicationSettings();
      
      // Also fetch quote and service if linked
      let quote = null;
      let service = null;
      if (invoice.quoteId) {
        quote = await storage.getQuote(invoice.quoteId);
        if (quote) {
          service = await storage.getService(quote.serviceId);
        }
      }
      
      res.json({ invoice, items, client, settings, quote, service });
    } catch (error) {
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  app.get("/api/quotes/:id/pdf", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const quote = await storage.getQuote(id);
      if (!quote) return res.status(404).json({ message: "Devis non trouvé" });
      
      const items = await storage.getQuoteItems(id);
      const client = await storage.getUser(quote.clientId);
      const settings = await storage.getApplicationSettings();
      const service = await storage.getService(quote.serviceId);
      
      res.json({ quote, items, client, settings, service });
    } catch (error) {
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  app.get("/api/invoices/:id/facturx", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const isUserAdmin = req.user.role === "admin" || req.user.role === "superadmin" || req.user.role === "root";

      const invoice = await storage.getInvoice(id);
      if (!invoice) {
        return res.status(404).json({ message: "Facture introuvable" });
      }

      if (!isUserAdmin && invoice.clientId !== userId) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }

      const client = await storage.getUser(invoice.clientId);
      const items = await storage.getInvoiceItems(invoice.id);
      const settings = await storage.getApplicationSettings();
      const garageId = invoice.garageId || req.user?.garageId;
      const garage = garageId ? await storage.getGarage(garageId) : null;

      const sellerName = garage?.name || settings?.companyName || "MyJantes";
      const sellerAddress = garage?.address || settings?.companyAddress || "";
      const sellerPostalCode = garage?.postalCode || "";
      const sellerCity = garage?.city || settings?.companyCity || "";
      const sellerSiren = (garage as any)?.siren || "";
      const sellerSiret = garage?.siret || settings?.companySiret || "";
      const sellerTva = garage?.tvaNumber || settings?.companyTvaNumber || "";
      const sellerEmail = garage?.email || settings?.companyEmail || "";
      const sellerPhone = garage?.phone || settings?.companyPhone || "";
      const sellerIban = garage?.iban || settings?.companyIban || "";
      const sellerSwift = garage?.swift || settings?.companySwift || "";
      const sellerCountry = (garage as any)?.country || "FR";
      const sellerLegalForm = (garage as any)?.legalForm || "";
      const sellerCapitalSocial = (garage as any)?.capitalSocial || "";
      const sellerNafCode = (garage as any)?.nafCode || "";
      const sellerRcsCity = (garage as any)?.rcsCity || "";
      const sellerBankName = garage?.bankName || "";

      const buyerName = client?.companyName || `${client?.firstName || ""} ${client?.lastName || ""}`.trim() || client?.email || "Client";
      const buyerSiret = client?.siret || "";
      const buyerTva = client?.tvaNumber || "";
      const buyerAddress = client?.companyAddress || client?.address || "";
      const buyerPostalCode = (client as any)?.companyPostalCode || client?.postalCode || "";
      const buyerCity = (client as any)?.companyCity || client?.city || "";
      const buyerCountry = (client as any)?.companyCountry || "FR";
      const buyerEmail = client?.email || "";
      const isBuyerPro = !!(buyerSiret || buyerTva);

      const invoiceDate = invoice.createdAt ? new Date(invoice.createdAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      const dueDate = invoice.dueDate ? new Date(invoice.dueDate).toISOString().slice(0, 10) : invoiceDate;

      const ht = parseFloat(invoice.priceExcludingTax || "0");
      const tva = parseFloat(invoice.taxAmount || "0");
      const ttc = parseFloat(invoice.amount || "0");
      const taxRate = parseFloat(invoice.taxRate || "20");

      const itemLines = items.length > 0 ? items.map((item: any, idx: number) => `
        <ram:IncludedSupplyChainTradeLineItem>
          <ram:AssociatedDocumentLineDocument>
            <ram:LineID>${idx + 1}</ram:LineID>
          </ram:AssociatedDocumentLineDocument>
          <ram:SpecifiedTradeProduct>
            <ram:Name>${escapeXml(item.description || "Prestation")}</ram:Name>
          </ram:SpecifiedTradeProduct>
          <ram:SpecifiedLineTradeAgreement>
            <ram:NetPriceProductTradePrice>
              <ram:ChargeAmount>${parseFloat(item.unitPrice || item.unitPriceExcludingTax || "0").toFixed(2)}</ram:ChargeAmount>
            </ram:NetPriceProductTradePrice>
          </ram:SpecifiedLineTradeAgreement>
          <ram:SpecifiedLineTradeDelivery>
            <ram:BilledQuantity unitCode="C62">${item.quantity || 1}</ram:BilledQuantity>
          </ram:SpecifiedLineTradeDelivery>
          <ram:SpecifiedLineTradeSettlement>
            <ram:ApplicableTradeTax>
              <ram:TypeCode>VAT</ram:TypeCode>
              <ram:CategoryCode>S</ram:CategoryCode>
              <ram:RateApplicablePercent>${parseFloat(item.taxRate || String(taxRate)).toFixed(2)}</ram:RateApplicablePercent>
            </ram:ApplicableTradeTax>
            <ram:SpecifiedTradeSettlementLineMonetarySummation>
              <ram:LineTotalAmount>${(parseFloat(item.unitPriceExcludingTax || item.unitPrice || "0") * (item.quantity || 1)).toFixed(2)}</ram:LineTotalAmount>
            </ram:SpecifiedTradeSettlementLineMonetarySummation>
          </ram:SpecifiedLineTradeSettlement>
        </ram:IncludedSupplyChainTradeLineItem>`).join("") : `
        <ram:IncludedSupplyChainTradeLineItem>
          <ram:AssociatedDocumentLineDocument>
            <ram:LineID>1</ram:LineID>
          </ram:AssociatedDocumentLineDocument>
          <ram:SpecifiedTradeProduct>
            <ram:Name>${escapeXml(invoice.productDetails || "Prestation de service")}</ram:Name>
          </ram:SpecifiedTradeProduct>
          <ram:SpecifiedLineTradeAgreement>
            <ram:NetPriceProductTradePrice>
              <ram:ChargeAmount>${ht.toFixed(2)}</ram:ChargeAmount>
            </ram:NetPriceProductTradePrice>
          </ram:SpecifiedLineTradeAgreement>
          <ram:SpecifiedLineTradeDelivery>
            <ram:BilledQuantity unitCode="C62">1</ram:BilledQuantity>
          </ram:SpecifiedLineTradeDelivery>
          <ram:SpecifiedLineTradeSettlement>
            <ram:ApplicableTradeTax>
              <ram:TypeCode>VAT</ram:TypeCode>
              <ram:CategoryCode>S</ram:CategoryCode>
              <ram:RateApplicablePercent>${taxRate.toFixed(2)}</ram:RateApplicablePercent>
            </ram:ApplicableTradeTax>
            <ram:SpecifiedTradeSettlementLineMonetarySummation>
              <ram:LineTotalAmount>${ht.toFixed(2)}</ram:LineTotalAmount>
            </ram:SpecifiedTradeSettlementLineMonetarySummation>
          </ram:SpecifiedLineTradeSettlement>
        </ram:IncludedSupplyChainTradeLineItem>`;

      const paymentMethodCode = invoice.paymentMethod === "card" ? "48" : invoice.paymentMethod === "stripe" ? "48" : invoice.paymentMethod === "wire_transfer" ? "30" : invoice.paymentMethod === "cash" ? "10" : "30";
      const invoiceTypeCode = (invoice as any).type === "credit_note" ? "381" : "380";

      const sellerDescription = [
        sellerLegalForm,
        sellerCapitalSocial ? `Capital ${sellerCapitalSocial} EUR` : "",
        sellerRcsCity ? `RCS ${sellerRcsCity}` : "",
        sellerNafCode ? `NAF ${sellerNafCode}` : "",
      ].filter(Boolean).join(" - ");

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"
  xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:BusinessProcessSpecifiedDocumentContextParameter>
      <ram:ID>A1</ram:ID>
    </ram:BusinessProcessSpecifiedDocumentContextParameter>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:factur-x.eu:1p0:extended</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${escapeXml(invoice.invoiceNumber)}</ram:ID>
    <ram:TypeCode>${invoiceTypeCode}</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${invoiceDate.replace(/-/g, "")}</udt:DateTimeString>
    </ram:IssueDateTime>
    <ram:IncludedNote>
      <ram:Content>${escapeXml(sellerDescription)}</ram:Content>
      <ram:SubjectCode>REG</ram:SubjectCode>
    </ram:IncludedNote>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${escapeXml(sellerName)}</ram:Name>
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0002">${escapeXml(sellerSiret)}</ram:ID>
          <ram:TradingBusinessName>${escapeXml(sellerName)}</ram:TradingBusinessName>
        </ram:SpecifiedLegalOrganization>
        <ram:DefinedTradeContact>
          <ram:PersonName>${escapeXml(sellerName)}</ram:PersonName>${sellerPhone ? `
          <ram:TelephoneUniversalCommunication>
            <ram:CompleteNumber>${escapeXml(sellerPhone)}</ram:CompleteNumber>
          </ram:TelephoneUniversalCommunication>` : ""}${sellerEmail ? `
          <ram:EmailURIUniversalCommunication>
            <ram:URIID>${escapeXml(sellerEmail)}</ram:URIID>
          </ram:EmailURIUniversalCommunication>` : ""}
        </ram:DefinedTradeContact>
        <ram:PostalTradeAddress>
          <ram:LineOne>${escapeXml(sellerAddress)}</ram:LineOne>
          <ram:PostcodeCode>${escapeXml(sellerPostalCode)}</ram:PostcodeCode>
          <ram:CityName>${escapeXml(sellerCity)}</ram:CityName>
          <ram:CountryID>${escapeXml(sellerCountry)}</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:URIUniversalCommunication>
          <ram:URIID schemeID="EM">${escapeXml(sellerEmail)}</ram:URIID>
        </ram:URIUniversalCommunication>
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${escapeXml(sellerTva)}</ram:ID>
        </ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${escapeXml(buyerName)}</ram:Name>${isBuyerPro && buyerSiret ? `
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0002">${escapeXml(buyerSiret)}</ram:ID>
        </ram:SpecifiedLegalOrganization>` : ""}
        <ram:PostalTradeAddress>
          <ram:LineOne>${escapeXml(buyerAddress)}</ram:LineOne>
          <ram:PostcodeCode>${escapeXml(buyerPostalCode)}</ram:PostcodeCode>
          <ram:CityName>${escapeXml(buyerCity)}</ram:CityName>
          <ram:CountryID>${escapeXml(buyerCountry)}</ram:CountryID>
        </ram:PostalTradeAddress>${buyerEmail ? `
        <ram:URIUniversalCommunication>
          <ram:URIID schemeID="EM">${escapeXml(buyerEmail)}</ram:URIID>
        </ram:URIUniversalCommunication>` : ""}${buyerTva ? `
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${escapeXml(buyerTva)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ""}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime>
          <udt:DateTimeString format="102">${invoiceDate.replace(/-/g, "")}</udt:DateTimeString>
        </ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>${paymentMethodCode}</ram:TypeCode>${sellerIban ? `
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${escapeXml(sellerIban)}</ram:IBANID>${sellerBankName ? `
          <ram:AccountName>${escapeXml(sellerBankName)}</ram:AccountName>` : ""}
        </ram:PayeePartyCreditorFinancialAccount>` : ""}${sellerSwift ? `
        <ram:PayeeSpecifiedCreditorFinancialInstitution>
          <ram:BICID>${escapeXml(sellerSwift)}</ram:BICID>
        </ram:PayeeSpecifiedCreditorFinancialInstitution>` : ""}
      </ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${tva.toFixed(2)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${ht.toFixed(2)}</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>${taxRate.toFixed(2)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${dueDate.replace(/-/g, "")}</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${ht.toFixed(2)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${ht.toFixed(2)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${tva.toFixed(2)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${ttc.toFixed(2)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${ttc.toFixed(2)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>${itemLines}
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="facturx-${invoice.invoiceNumber}.xml"`);
      res.send(xml);
    } catch (error: any) {
      console.error("Error generating client Factur-X XML:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Reservation CRUD routes for admin
  app.patch("/api/admin/reservations/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { additionalServiceIds, ...bodyData } = req.body;
      
      // Get previous state for audit logging
      const previousReservation = await storage.getReservation(id);
      
      const validatedData = insertReservationSchema.partial().parse(bodyData);
      const reservation = await storage.updateReservation(id, validatedData);
      
      // Update additional services if provided
      if (additionalServiceIds !== undefined && Array.isArray(additionalServiceIds)) {
        await storage.setReservationServices(id, additionalServiceIds);
      }

      // Determine action type based on status change
      let action: ActionType = "updated";
      let summary = "Réservation mise à jour";
      if (validatedData.status === "confirmed" && previousReservation?.status !== "confirmed") {
        action = "confirmed";
        summary = "Réservation confirmée";
      } else if (validatedData.status === "cancelled" && previousReservation?.status !== "cancelled") {
        action = "cancelled";
        summary = "Réservation annulée";
      } else if (validatedData.status === "completed" && previousReservation?.status !== "completed") {
        action = "completed";
        summary = "Réservation terminée";
      }

      // Log audit event
      await logAuditEvent({
        req,
        entityType: "reservation",
        entityId: id,
        action,
        summary,
        previousData: previousReservation,
        newData: reservation,
      });

      // Create notification for client if status changed
      if (validatedData.status) {
        await storage.createNotification({
          userId: reservation.clientId,
          type: "reservation",
          title: "Réservation mise à jour",
          message: `Votre réservation a été mise à jour - Statut: ${validatedData.status}`,
          relatedId: reservation.id,
        });

        // Send WebSocket notification
        const wsClient = wsClients.get(reservation.clientId);
        if (wsClient && wsClient.readyState === WebSocket.OPEN) {
          wsClient.send(JSON.stringify({
            type: "reservation_updated",
            reservationId: reservation.id,
            status: validatedData.status,
          }));
        }
      }
      
      // Automatic email disabled - use manual sending if needed
      // if (validatedData.status === "confirmed" && previousReservation?.status !== "confirmed") { ... }

      // Return reservation with additional services
      const additionalServices = await storage.getReservationServices(id);
      res.json({ ...reservation, additionalServices });
    } catch (error: any) {
      console.error("Error updating reservation:", error);
      res.status(400).json({ message: error.message || "Failed to update reservation" });
    }
  });

  // Admin users route
  app.get("/api/admin/users", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      // Superadmin sees all users, other admins see only their garage's users
      const garageId = getGarageScope(req.user);
      let userList;
      if (garageId) {
        userList = await storage.getUsersByGarage(garageId);
      } else {
        userList = await storage.getAllUsers();
      }
      // Sanitize all users - remove passwords
      res.json(sanitizeUsers(userList));
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Get single user by ID
  app.get("/api/admin/users/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(id);
      // Check garage access
      if (user && !hasGarageAccess(req.user, user.garageId)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }
      if (!user) {
        return res.status(404).json({ message: "Utilisateur non trouvé" });
      }
      // Sanitize - remove password
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Erreur lors de la récupération de l'utilisateur" });
    }
  });

  app.patch("/api/admin/users/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUser = req.user;
      
      // Get target user to check their current role
      const targetUser = await storage.getUser(id);
      if (!targetUser) {
        return res.status(404).json({ message: "Utilisateur non trouvé" });
      }
      
      const updateSchema = z.object({
        role: z.enum(["client", "client_professionnel", "employe", "admin", "superadmin", "root"]).optional(),
        email: z.string().email().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        phone: z.string().optional().nullable(),
        address: z.string().optional().nullable(),
        postalCode: z.string().optional().nullable(),
        city: z.string().optional().nullable(),
        companyName: z.string().optional().nullable(),
        siret: z.string().optional().nullable(),
        tvaNumber: z.string().optional().nullable(),
        companyAddress: z.string().optional().nullable(),
        smsConsent: z.boolean().optional(),
      });
      const validatedData = updateSchema.parse(req.body);

      // Special protection for superadmin and root roles
      if (validatedData.role === "root" && currentUser.role !== "root") {
        return res.status(403).json({ message: "Seul un Root Admin peut nommer un autre Root Admin" });
      }
      if (validatedData.role === "superadmin" && currentUser.role !== "superadmin" && currentUser.role !== "root") {
        return res.status(403).json({ message: "Seul un Super Admin ou Root Admin peut nommer un Super Admin" });
      }

      // Employees cannot demote admin users
      if (currentUser.role === "employe" && targetUser.role === "admin") {
        if (validatedData.role && validatedData.role !== "admin") {
          return res.status(403).json({ 
            message: "Vous n'avez pas la permission de modifier le rôle d'un administrateur" 
          });
        }
      }
      
      // Employees cannot promote non-admins to admin
      if (currentUser.role === "employe" && validatedData.role === "admin" && targetUser.role !== "admin") {
        return res.status(403).json({ 
          message: "Vous n'avez pas la permission de promouvoir un utilisateur au rôle administrateur" 
        });
      }
      
      const user = await storage.updateUser(id, validatedData);
      res.json(sanitizeUser(user));
    } catch (error: any) {
      console.error("Error updating user:", error);
      res.status(400).json({ message: error.message || "Failed to update user" });
    }
  });

  // Self-profile update route
  app.patch("/api/user/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      const updateSchema = z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        phone: z.string().optional().nullable(),
        address: z.string().optional().nullable(),
        postalCode: z.string().optional().nullable(),
        city: z.string().optional().nullable(),
        companyName: z.string().optional().nullable(),
        siret: z.string().optional().nullable(),
        tvaNumber: z.string().optional().nullable(),
        companyAddress: z.string().optional().nullable(),
        smsConsent: z.boolean().optional(),
      });

      const validatedData = updateSchema.parse(req.body);
      
      const user = await storage.updateUser(userId, validatedData);
      res.json(sanitizeUser(user));
    } catch (error: any) {
      console.error("Error updating profile:", error);
      res.status(400).json({ message: error.message || "Erreur lors de la mise à jour du profil" });
    }
  });

  // Admin route to change user password
  app.patch("/api/admin/users/:id/password", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUser = req.user;
      const passwordSchema = z.object({
        newPassword: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
      });
      const { newPassword } = passwordSchema.parse(req.body);
      
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "Utilisateur non trouvé" });
      }
      
      // Employees cannot change admin passwords
      if (currentUser.role === "employe" && user.role === "admin") {
        return res.status(403).json({ 
          message: "Vous n'avez pas la permission de modifier le mot de passe d'un administrateur" 
        });
      }
      
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(id, { password: hashedPassword });
      
      res.json({ message: "Mot de passe modifié avec succès" });
    } catch (error: any) {
      console.error("Error changing user password:", error);
      res.status(400).json({ message: error.message || "Échec de la modification du mot de passe" });
    }
  });

  // User route to change own password
  app.patch("/api/user/password", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const passwordSchema = z.object({
        currentPassword: z.string().min(1, "Le mot de passe actuel est requis"),
        newPassword: z.string().min(6, "Le nouveau mot de passe doit contenir au moins 6 caractères"),
      });
      const { currentPassword, newPassword } = passwordSchema.parse(req.body);
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "Utilisateur non trouvé" });
      }
      
      // Verify current password
      if (!user.password) {
        return res.status(400).json({ message: "Ce compte utilise une authentification externe" });
      }
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(400).json({ message: "Mot de passe actuel incorrect" });
      }
      
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(userId, { password: hashedPassword });
      
      res.json({ message: "Mot de passe modifié avec succès" });
    } catch (error: any) {
      console.error("Error changing password:", error);
      res.status(400).json({ message: error.message || "Échec de la modification du mot de passe" });
    }
  });

  app.post("/api/user/delete-request", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "Utilisateur non trouvé" });
      }
      const { reason } = req.body;
      const { sendEmail } = await import("./emailService");
      const settings = await storage.getApplicationSettings();
      const clientName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || userId;
      const adminEmail = settings?.companyEmail || "contact@myjantes.com";

      await sendEmail({
        to: adminEmail,
        subject: `[RGPD] Demande de suppression de compte - ${clientName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #dc2626;">Demande de suppression de compte</h2>
            <p><strong>Client :</strong> ${clientName}</p>
            <p><strong>Email :</strong> ${user.email || "N/A"}</p>
            <p><strong>ID :</strong> ${userId}</p>
            <p><strong>Date :</strong> ${new Date().toLocaleString("fr-FR")}</p>
            ${reason ? `<p><strong>Motif :</strong> ${reason}</p>` : ""}
            <hr />
            <p style="color: #6b7280; font-size: 14px;">
              Conformément au RGPD, cette demande doit être traitée dans un délai de 72 heures.
              Veuillez supprimer manuellement le compte et toutes les données associées depuis l'interface d'administration.
            </p>
          </div>
        `,
      });

      res.json({ message: "Demande de suppression envoyée avec succès" });
    } catch (error: any) {
      console.error("Error sending delete request:", error);
      res.status(500).json({ message: "Impossible d'envoyer la demande de suppression" });
    }
  });

  // Admin route to create a new client (professionnel or particulier) without password
  app.post("/api/admin/clients", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const createClientSchema = z.object({
        email: z.string().email(),
        firstName: z.string().min(1, "Le prénom est requis"),
        lastName: z.string().min(1, "Le nom est requis"),
        phone: z.string().optional(),
        address: z.string().optional(),
        postalCode: z.string().optional(),
        city: z.string().optional(),
        role: z.enum(["client", "client_professionnel"]),
        companyName: z.string().optional(),
        siret: z.string().optional(),
        tvaNumber: z.string().optional(),
        companyAddress: z.string().optional(),
      });

      const validatedData = createClientSchema.parse(req.body);

      // Check if email already exists
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ message: "Cet email est déjà utilisé" });
      }

      // Generate a default password that can be changed later
      const { hashPassword } = await import("./localAuth");
      const defaultPassword = await hashPassword("123user");

      const userData: any = {
        email: validatedData.email,
        password: defaultPassword,
        firstName: validatedData.firstName || null,
        lastName: validatedData.lastName || null,
        phone: validatedData.phone || null,
        address: validatedData.address || null,
        postalCode: validatedData.postalCode || null,
        city: validatedData.city || null,
        role: validatedData.role,
      };

      // Add company fields if professional client
      if (validatedData.role === "client_professionnel") {
        userData.companyName = validatedData.companyName || null;
        userData.siret = validatedData.siret || null;
        userData.tvaNumber = validatedData.tvaNumber || null;
        userData.companyAddress = validatedData.companyAddress || null;
      }

      const newClient = await storage.createUser(userData);

      res.json(sanitizeUser(newClient));
    } catch (error: any) {
      console.error("Error creating client:", error);
      res.status(400).json({ message: error.message || "Échec de la création du client" });
    }
  });

  app.post("/api/admin/users", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const createSchema = z.object({
        email: z.string().email(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        postalCode: z.string().optional(),
        city: z.string().optional(),
        role: z.enum(["client", "client_professionnel", "employe", "admin"]).optional(),
        companyName: z.string().optional(),
        siret: z.string().optional(),
        tvaNumber: z.string().optional(),
        companyAddress: z.string().optional(),
      });
      const validatedData = createSchema.parse(req.body);
      
      // Generate a default password
      const { hashPassword } = await import("./localAuth");
      const defaultPassword = await hashPassword("123user");
      
      const user = await storage.createUser({
        ...validatedData,
        password: defaultPassword,
      });
      res.json(sanitizeUser(user));
    } catch (error: any) {
      console.error("Error creating user:", error);
      res.status(400).json({ message: error.message || "Failed to create user" });
    }
  });

  app.delete("/api/admin/users/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUser = req.user;
      
      // Check if target user is an admin
      const targetUser = await storage.getUser(id);
      if (!targetUser) {
        return res.status(404).json({ message: "Utilisateur non trouvé" });
      }
      
      // Employees cannot delete admin users
      if (currentUser.role === "employe" && targetUser.role === "admin") {
        return res.status(403).json({ 
          message: "Vous n'avez pas la permission de supprimer un administrateur" 
        });
      }
      
      await storage.deleteUser(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting user:", error);
      res.status(400).json({ message: error.message || "Failed to delete user" });
    }
  });

  // Application Settings routes
  app.get("/api/admin/settings", isAuthenticated, isAdmin, async (req, res) => {
    try {
      let settings = await storage.getApplicationSettings();
      
      // If no settings exist, create default settings
      if (!settings) {
        settings = await storage.createOrUpdateApplicationSettings({});
      }
      
      res.json(settings);
    } catch (error) {
      console.error("Error fetching application settings:", error);
      res.status(500).json({ message: "Failed to fetch application settings" });
    }
  });

  app.patch("/api/admin/settings", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const settings = await storage.createOrUpdateApplicationSettings(req.body);
      
      const { updateDailyReportSchedule } = await import('./dailyReportScheduler');
      updateDailyReportSchedule({
        enabled: (settings as any).dailyReportEnabled ?? false,
        time: (settings as any).dailyReportTime || '21:00',
        recipients: (settings as any).dailyReportRecipients || 'contact@myjantes.com',
      });
      
      res.json(settings);
    } catch (error: any) {
      console.error("Error updating application settings:", error);
      res.status(400).json({ message: error.message || "Failed to update application settings" });
    }
  });

  app.post("/api/admin/daily-report/test", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { triggerDailyReport } = await import('./dailyReportScheduler');
      await triggerDailyReport();
      res.json({ success: true, message: "Rapport test envoyé" });
    } catch (error: any) {
      console.error("Error sending test daily report:", error);
      res.status(500).json({ message: error.message || "Erreur lors de l'envoi du rapport test" });
    }
  });

  app.get("/api/admin/garage-legal", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const settings = await storage.getApplicationSettings();
      if (!settings) {
        return res.status(404).json({ message: "Paramètres non trouvés" });
      }
      res.json({
        id: settings.id,
        name: settings.companyName || "MyJantes",
        address: settings.companyAddress || "",
        city: settings.companyCity || "",
        postalCode: (settings as any).companyPostalCode || "",
        phone: settings.companyPhone || "",
        email: settings.companyEmail || "",
        website: settings.companyWebsite || "",
        siren: (settings as any).companySiren || "",
        siret: settings.companySiret || "",
        tvaNumber: settings.companyTvaNumber || "",
        iban: settings.companyIban || "",
        swift: settings.companySwift || "",
        bankName: (settings as any).companyBankName || "",
        legalForm: (settings as any).companyLegalForm || "",
        capitalSocial: (settings as any).companyCapitalSocial || "",
        nafCode: (settings as any).companyNafCode || "",
        rcsCity: (settings as any).companyRcsCity || "",
        country: (settings as any).companyCountry || "FR",
      });
    } catch (error: any) {
      console.error("Error fetching legal info:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/garage-legal", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const fieldMapping: Record<string, string> = {
        name: "companyName",
        address: "companyAddress",
        city: "companyCity",
        postalCode: "companyPostalCode",
        phone: "companyPhone",
        email: "companyEmail",
        website: "companyWebsite",
        siren: "companySiren",
        siret: "companySiret",
        tvaNumber: "companyTvaNumber",
        iban: "companyIban",
        swift: "companySwift",
        bankName: "companyBankName",
        legalForm: "companyLegalForm",
        capitalSocial: "companyCapitalSocial",
        nafCode: "companyNafCode",
        rcsCity: "companyRcsCity",
        country: "companyCountry",
      };
      const updateData: Record<string, any> = {};
      for (const [frontendField, dbField] of Object.entries(fieldMapping)) {
        if (req.body[frontendField] !== undefined) {
          updateData[dbField] = req.body[frontendField];
        }
      }
      const updated = await storage.createOrUpdateApplicationSettings(updateData as any);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating legal info:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Engagement (Prestation) routes
  app.get("/api/admin/engagements", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { clientId } = req.query;
      const garageId = (req.user.role !== 'superadmin' && req.user.role !== 'root') ? req.user.garageId : null;
      
      const engagementsList = await storage.getEngagements(clientId as string | undefined);
      
      // Filter by garage access if not superadmin
      const filteredEngagements = garageId 
        ? engagementsList.filter(e => {
            // Since engagements table doesn't have garageId, we should check related quotes/invoices
            // or we might need to add garageId to engagements table.
            // For now, if engagements table is empty, we show empty.
            return true; 
          })
        : engagementsList;

      res.json(filteredEngagements);
    } catch (error: any) {
      console.error("Error fetching engagements:", error);
      res.status(500).json({ message: "Failed to fetch engagements" });
    }
  });

  app.get("/api/admin/engagements/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const engagement = await storage.getEngagement(req.params.id);
      if (!engagement) {
        return res.status(404).json({ message: "Engagement not found" });
      }
      res.json(engagement);
    } catch (error: any) {
      console.error("Error fetching engagement:", error);
      res.status(500).json({ message: "Failed to fetch engagement" });
    }
  });

  app.post("/api/admin/engagements", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const engagement = await storage.createEngagement({
        clientId: req.body.clientId,
        title: req.body.title,
        description: req.body.description,
        status: req.body.status || "active",
      });
      res.json(engagement);
    } catch (error: any) {
      console.error("Error creating engagement:", error);
      res.status(400).json({ message: error.message || "Failed to create engagement" });
    }
  });

  app.patch("/api/admin/engagements/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const engagement = await storage.updateEngagement(req.params.id, req.body);
      res.json(engagement);
    } catch (error: any) {
      console.error("Error updating engagement:", error);
      res.status(400).json({ message: error.message || "Failed to update engagement" });
    }
  });

  app.delete("/api/admin/engagements/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      await storage.updateEngagement(req.params.id, { status: "cancelled" });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting engagement:", error);
      res.status(400).json({ message: error.message || "Failed to delete engagement" });
    }
  });

  app.get("/api/admin/engagements/summary/:clientId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const summary = await storage.getEngagementSummary(req.params.clientId);
      res.json(summary);
    } catch (error: any) {
      console.error("Error fetching engagement summary:", error);
      res.status(500).json({ message: "Failed to fetch engagement summary" });
    }
  });

  app.get("/api/admin/engagements/clients-summary", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageId = (req.user.role !== 'superadmin' && req.user.role !== 'root') ? req.user.garageId : null;
      const allUsers = await storage.getAllUsers();
      const clients = allUsers.filter(u => u.role === 'client' || u.role === 'client_professionnel');
      
      const allQuotes = await storage.getQuotes();
      const allInvoices = await storage.getInvoices();
      const allReservations = await storage.getReservations();

      const filteredQuotes = garageId ? allQuotes.filter(q => q.garageId === garageId) : allQuotes;
      const filteredInvoices = garageId ? allInvoices.filter(i => i.garageId === garageId) : allInvoices;
      const filteredReservations = garageId ? allReservations.filter(r => r.garageId === garageId) : allReservations;

      const clientSummaries = clients
        .map(client => {
          const clientQuotes = filteredQuotes.filter(q => q.clientId === client.id);
          const clientInvoices = filteredInvoices.filter(i => i.clientId === client.id);
          const clientReservations = filteredReservations.filter(r => r.clientId === client.id);
          
          if (clientQuotes.length === 0 && clientInvoices.length === 0 && clientReservations.length === 0) {
            return null;
          }

          const totalCA = clientInvoices
            .filter(i => i.status === 'paid')
            .reduce((sum, i) => sum + parseFloat(i.amount || '0'), 0);

          const lastActivity = [...clientQuotes, ...clientInvoices, ...clientReservations]
            .map(item => item.createdAt ? new Date(item.createdAt).getTime() : 0)
            .sort((a, b) => b - a)[0] || 0;

          return {
            clientId: client.id,
            firstName: client.firstName,
            lastName: client.lastName,
            email: client.email,
            phone: client.phone,
            quotesCount: clientQuotes.length,
            invoicesCount: clientInvoices.length,
            reservationsCount: clientReservations.length,
            totalCA,
            lastActivity: lastActivity ? new Date(lastActivity).toISOString() : null,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => {
          const dateA = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
          const dateB = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
          return dateB - dateA;
        });

      res.json(clientSummaries);
    } catch (error: any) {
      console.error("Error fetching clients summary:", error);
      res.status(500).json({ message: "Failed to fetch clients summary" });
    }
  });

  // Workflow routes
  app.get("/api/admin/workflows", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const workflows = await storage.getWorkflows();
      res.json(workflows);
    } catch (error: any) {
      console.error("Error fetching workflows:", error);
      res.status(500).json({ message: "Failed to fetch workflows" });
    }
  });

  app.get("/api/admin/workflows/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const workflow = await storage.getWorkflow(req.params.id);
      if (!workflow) {
        return res.status(404).json({ message: "Workflow not found" });
      }
      res.json(workflow);
    } catch (error: any) {
      console.error("Error fetching workflow:", error);
      res.status(500).json({ message: "Failed to fetch workflow" });
    }
  });

  // Get workflow by service ID (for employee view)
  app.get("/api/services/:serviceId/workflow", isAuthenticated, async (req, res) => {
    try {
      const workflow = await storage.getWorkflowByServiceId(req.params.serviceId);
      if (!workflow) {
        return res.status(404).json({ message: "No workflow found for this service" });
      }
      const steps = await storage.getWorkflowSteps(workflow.id);
      res.json({ ...workflow, steps });
    } catch (error: any) {
      console.error("Error fetching service workflow:", error);
      res.status(500).json({ message: "Failed to fetch service workflow" });
    }
  });

  // Get all services with their workflows (for employee/admin)
  app.get("/api/services-with-workflows", isAuthenticated, async (req, res) => {
    try {
      const allServices = await storage.getServices();
      const servicesWithWorkflows = await Promise.all(
        allServices.map(async (service) => {
          const workflow = await storage.getWorkflowByServiceId(service.id);
          let steps: any[] = [];
          if (workflow) {
            steps = await storage.getWorkflowSteps(workflow.id);
          }
          return { ...service, workflow: workflow ? { ...workflow, steps } : null };
        })
      );
      res.json(servicesWithWorkflows);
    } catch (error: any) {
      console.error("Error fetching services with workflows:", error);
      res.status(500).json({ message: "Failed to fetch services with workflows" });
    }
  });

  app.post("/api/admin/workflows", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const workflow = await storage.createWorkflow({
        name: req.body.name,
        description: req.body.description,
      });
      res.json(workflow);
    } catch (error: any) {
      console.error("Error creating workflow:", error);
      res.status(400).json({ message: error.message || "Failed to create workflow" });
    }
  });

  app.post("/api/admin/workflow-steps", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const step = await storage.createWorkflowStep({
        workflowId: req.body.workflowId,
        stepNumber: req.body.stepNumber,
        title: req.body.title,
        description: req.body.description,
      });
      res.json(step);
    } catch (error: any) {
      console.error("Error creating workflow step:", error);
      res.status(400).json({ message: error.message || "Failed to create workflow step" });
    }
  });

  app.get("/api/admin/workflows/:workflowId/steps", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const steps = await storage.getWorkflowSteps(req.params.workflowId);
      res.json(steps);
    } catch (error: any) {
      console.error("Error fetching workflow steps:", error);
      res.status(500).json({ message: "Failed to fetch workflow steps" });
    }
  });

  app.post("/api/admin/services/:serviceId/workflows", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const serviceWorkflow = await storage.assignWorkflowToService({
        serviceId: req.params.serviceId,
        workflowId: req.body.workflowId,
      });
      res.json(serviceWorkflow);
    } catch (error: any) {
      console.error("Error assigning workflow to service:", error);
      res.status(400).json({ message: error.message || "Failed to assign workflow" });
    }
  });

  app.get("/api/admin/services/:serviceId/workflows", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const workflows = await storage.getServiceWorkflows(req.params.serviceId);
      res.json(workflows);
    } catch (error: any) {
      console.error("Error fetching service workflows:", error);
      res.status(500).json({ message: "Failed to fetch service workflows" });
    }
  });

  app.delete("/api/admin/workflows/:workflowId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      await storage.deleteWorkflow(req.params.workflowId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting workflow:", error);
      res.status(400).json({ message: error.message || "Failed to delete workflow" });
    }
  });

  app.patch("/api/admin/workflows/:workflowId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const workflow = await storage.updateWorkflow(req.params.workflowId, {
        name: req.body.name,
        description: req.body.description,
      });
      res.json(workflow);
    } catch (error: any) {
      console.error("Error updating workflow:", error);
      res.status(400).json({ message: error.message || "Failed to update workflow" });
    }
  });

  app.delete("/api/admin/workflow-steps/:stepId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      await storage.deleteWorkflowStep(req.params.stepId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting workflow step:", error);
      res.status(400).json({ message: error.message || "Failed to delete workflow step" });
    }
  });

  app.patch("/api/admin/workflow-steps/:stepId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const step = await storage.updateWorkflowStep(req.params.stepId, {
        title: req.body.title,
        description: req.body.description,
        stepNumber: req.body.stepNumber,
      });
      res.json(step);
    } catch (error: any) {
      console.error("Error updating workflow step:", error);
      res.status(400).json({ message: error.message || "Failed to update workflow step" });
    }
  });

  app.delete("/api/admin/services/:serviceId/workflows/:workflowId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      await storage.deleteServiceWorkflow(req.params.serviceId, req.params.workflowId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error unassigning workflow:", error);
      res.status(400).json({ message: error.message || "Failed to unassign workflow" });
    }
  });

  // Workshop task routes
  app.get("/api/workshop/reservations/:reservationId/tasks", isAuthenticated, async (req, res) => {
    try {
      const tasks = await storage.getReservationTasks(req.params.reservationId);
      res.json(tasks);
    } catch (error: any) {
      console.error("Error fetching workshop tasks:", error);
      res.status(500).json({ message: "Failed to fetch workshop tasks" });
    }
  });

  app.patch("/api/workshop/tasks/:taskId", isAuthenticated, async (req: any, res) => {
    try {
      const task = await storage.updateWorkshopTask(req.params.taskId, {
        isCompleted: req.body.isCompleted,
        comment: req.body.comment,
        completedByUserId: req.body.isCompleted ? req.user.id : undefined,
        completedAt: req.body.isCompleted ? new Date() : undefined,
      });
      
      // Log audit event for workshop task update
      await logAuditEvent({
        req,
        entityType: "workshop_task",
        entityId: task.id,
        action: req.body.isCompleted ? "completed" : "updated",
        summary: `Étape ${req.body.isCompleted ? "validée" : "mise à jour"}`,
        newData: task,
      });
      
      res.json(task);
    } catch (error: any) {
      console.error("Error updating workshop task:", error);
      res.status(400).json({ message: error.message || "Failed to update workshop task" });
    }
  });

  // ========== REPAIR ORDER ROUTES ==========
  app.get("/api/admin/repair-orders", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const orders = await storage.getRepairOrders();
      res.json(orders);
    } catch (error: any) {
      console.error("Error fetching repair orders:", error);
      res.status(500).json({ message: "Failed to fetch repair orders" });
    }
  });

  app.get("/api/admin/repair-orders/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const order = await storage.getRepairOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "Repair order not found" });
      res.json(order);
    } catch (error: any) {
      console.error("Error fetching repair order:", error);
      res.status(500).json({ message: "Failed to fetch repair order" });
    }
  });

  app.get("/api/admin/repair-orders/reservation/:reservationId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const order = await storage.getRepairOrderByReservation(req.params.reservationId);
      res.json(order || null);
    } catch (error: any) {
      console.error("Error fetching repair order by reservation:", error);
      res.status(500).json({ message: "Failed to fetch repair order" });
    }
  });

  app.post("/api/admin/repair-orders", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const prefix = `OR-${mm}-${dd}-`;
      let order: any;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          let seq = 1;
          const existing = await db.select().from(repairOrders)
            .where(sql`reference LIKE ${prefix + '%'}`)
            .orderBy(desc(repairOrders.reference));
          if (existing.length > 0) {
            const lastRef = existing[0].reference || '';
            const lastSeq = parseInt(lastRef.split('-').pop() || '0', 10);
            seq = lastSeq + 1;
          }
          const reference = `${prefix}${String(seq).padStart(2, '0')}`;
          order = await storage.createRepairOrder({
            ...req.body,
            reference,
            createdById: req.user.id,
          });
          break;
        } catch (err: any) {
          if (err.message?.includes('unique') && attempt < 4) continue;
          throw err;
        }
      }
      res.json(order);
    } catch (error: any) {
      console.error("Error creating repair order:", error);
      res.status(400).json({ message: error.message || "Failed to create repair order" });
    }
  });

  app.patch("/api/admin/repair-orders/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const order = await storage.updateRepairOrder(req.params.id, req.body);
      res.json(order);
    } catch (error: any) {
      console.error("Error updating repair order:", error);
      res.status(400).json({ message: error.message || "Failed to update repair order" });
    }
  });

  app.delete("/api/admin/repair-orders/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      await storage.deleteRepairOrder(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting repair order:", error);
      res.status(500).json({ message: "Failed to delete repair order" });
    }
  });

  // ========== WORKSHOP DASHBOARD ROUTES ==========
  app.get("/api/workshop/active-reservations", isAuthenticated, async (req, res) => {
    try {
      const allReservations = await storage.getReservations();
      const active = allReservations.filter(r => 
        r.status === "confirmed" || r.status === "pending"
      );
      const result = await Promise.all(active.map(async (reservation) => {
        const tasks = await storage.getReservationTasks(reservation.id);
        const repairOrder = await storage.getRepairOrderByReservation(reservation.id);
        const completedTasks = tasks.filter(t => t.isCompleted).length;
        const totalTasks = tasks.length;
        return {
          ...reservation,
          tasks,
          repairOrder,
          progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
          completedTasks,
          totalTasks,
        };
      }));
      res.json(result);
    } catch (error: any) {
      console.error("Error fetching active reservations:", error);
      res.status(500).json({ message: "Failed to fetch active reservations" });
    }
  });

  // Initialize default workflow steps for a service
  app.post("/api/admin/services/:serviceId/init-default-workflow", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { serviceId } = req.params;
      const service = await storage.getService(serviceId);
      if (!service) return res.status(404).json({ message: "Service not found" });
      
      let workflow = await storage.getWorkflowByServiceId(serviceId);
      if (!workflow) {
        workflow = await storage.createWorkflow({
          name: `Workflow - ${service.name}`,
          description: `Workflow pour le service ${service.name}`,
          serviceId,
        });
      }
      
      const existingSteps = await storage.getWorkflowSteps(workflow.id);
      if (existingSteps.length > 0) {
        return res.json({ workflow, steps: existingSteps, message: "Workflow already has steps" });
      }
      
      const defaultSteps = [
        { stepNumber: 1, title: "Réception du véhicule", description: "Accueil client, vérification du rendez-vous, prise en charge du véhicule" },
        { stepNumber: 2, title: "Ordre de réparation", description: "État des lieux complet du véhicule avant intervention (extérieur, intérieur, kilométrage, carburant)" },
        { stepNumber: 3, title: "Diagnostic", description: "Inspection technique et diagnostic des travaux à réaliser" },
        { stepNumber: 4, title: "Préparation pièces", description: "Vérification et préparation des pièces et outils nécessaires" },
        { stepNumber: 5, title: "Intervention", description: "Réalisation des travaux selon le devis validé" },
        { stepNumber: 6, title: "Contrôle qualité", description: "Vérification de la qualité des travaux réalisés" },
        { stepNumber: 7, title: "Nettoyage", description: "Nettoyage du véhicule et de la zone de travail" },
        { stepNumber: 8, title: "Restitution", description: "Remise du véhicule au client avec explications des travaux effectués" },
      ];
      
      const steps = [];
      for (const step of defaultSteps) {
        const created = await storage.createWorkflowStep({
          workflowId: workflow.id,
          ...step,
        });
        steps.push(created);
      }
      
      res.json({ workflow, steps });
    } catch (error: any) {
      console.error("Error initializing default workflow:", error);
      res.status(400).json({ message: error.message || "Failed to initialize workflow" });
    }
  });

  // Bulk init default workflows for all services without steps
  app.post("/api/admin/init-all-default-workflows", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const allServices = await storage.getServices();
      const results = [];
      
      for (const service of allServices) {
        let workflow = await storage.getWorkflowByServiceId(service.id);
        if (!workflow) {
          workflow = await storage.createWorkflow({
            name: `Workflow - ${service.name}`,
            description: `Workflow pour le service ${service.name}`,
            serviceId: service.id,
          });
        }
        
        const existingSteps = await storage.getWorkflowSteps(workflow.id);
        if (existingSteps.length > 0) {
          results.push({ service: service.name, status: "already_configured", stepsCount: existingSteps.length });
          continue;
        }
        
        const defaultSteps = [
          { stepNumber: 1, title: "Réception du véhicule", description: "Accueil client et prise en charge du véhicule" },
          { stepNumber: 2, title: "Ordre de réparation", description: "État des lieux du véhicule avant intervention" },
          { stepNumber: 3, title: "Diagnostic", description: "Inspection technique et diagnostic" },
          { stepNumber: 4, title: "Préparation", description: "Préparation des pièces et outils" },
          { stepNumber: 5, title: "Intervention", description: "Réalisation des travaux" },
          { stepNumber: 6, title: "Contrôle qualité", description: "Vérification de la qualité" },
          { stepNumber: 7, title: "Nettoyage", description: "Nettoyage du véhicule" },
          { stepNumber: 8, title: "Restitution", description: "Remise du véhicule au client" },
        ];
        
        for (const step of defaultSteps) {
          await storage.createWorkflowStep({ workflowId: workflow.id, ...step });
        }
        
        results.push({ service: service.name, status: "initialized", stepsCount: defaultSteps.length });
      }
      
      res.json({ results });
    } catch (error: any) {
      console.error("Error initializing all default workflows:", error);
      res.status(400).json({ message: error.message || "Failed to initialize workflows" });
    }
  });

  // Audit Log routes
  app.get("/api/admin/audit-logs", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const filters: any = {};
      
      if (req.query.entityType) filters.entityType = req.query.entityType as string;
      if (req.query.entityId) filters.entityId = req.query.entityId as string;
      if (req.query.actorId) filters.actorId = req.query.actorId as string;
      if (req.query.action) filters.action = req.query.action as string;
      if (req.query.startDate) filters.startDate = new Date(req.query.startDate as string);
      if (req.query.endDate) filters.endDate = new Date(req.query.endDate as string);
      if (req.query.limit) filters.limit = parseInt(req.query.limit as string);
      if (req.query.offset) filters.offset = parseInt(req.query.offset as string);
      
      const result = await storage.getAuditLogs(filters);
      res.json(result);
    } catch (error: any) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  app.get("/api/admin/audit-logs/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const log = await storage.getAuditLog(req.params.id);
      if (!log) {
        return res.status(404).json({ message: "Audit log not found" });
      }
      res.json(log);
    } catch (error: any) {
      console.error("Error fetching audit log:", error);
      res.status(500).json({ message: "Failed to fetch audit log" });
    }
  });

  app.get("/api/admin/entity-history/:entityType/:entityId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const history = await storage.getEntityAuditHistory(req.params.entityType, req.params.entityId);
      res.json(history);
    } catch (error: any) {
      console.error("Error fetching entity history:", error);
      res.status(500).json({ message: "Failed to fetch entity history" });
    }
  });

  // Cache clearing route
  app.post("/api/admin/cache/clear", isAuthenticated, isAdmin, async (req, res) => {
    try {
      // Clear any server-side caches here
      // For now, we'll just return success
      // In the future, you could add Redis cache clearing, etc.
      
      res.json({ success: true, message: "Cache cleared successfully" });
    } catch (error: any) {
      console.error("Error clearing cache:", error);
      res.status(500).json({ message: error.message || "Failed to clear cache" });
    }
  });

  // Object Storage routes are registered via registerObjectStorageRoutes() above

  // Google Drive proxy route - serves files stored on Google Drive
  app.get("/gdrive/:fileId/:filename", isAuthenticated, async (req: any, res) => {
    try {
      const { downloadFromGoogleDrive } = await import("./googleDriveStorage");
      const { fileId } = req.params;
      const { data, mimeType } = await downloadFromGoogleDrive(fileId);
      
      res.set({
        "Content-Type": mimeType,
        "Content-Length": data.length,
        "Cache-Control": "private, max-age=86400",
      });
      res.send(data);
    } catch (error: any) {
      console.error("[GoogleDrive] Error serving file:", error.message);
      if (!res.headersSent) {
        res.status(404).json({ error: "File not found" });
      }
    }
  });

  app.get("/api/admin/gdrive/status", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { isGoogleDriveConfigured } = await import("./googleDriveStorage");
      const configured = isGoogleDriveConfigured();
      res.json({ configured, hasClientId: !!process.env.GOOGLE_CLIENT_ID, hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET, hasRefreshToken: !!process.env.GOOGLE_REFRESH_TOKEN });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/gdrive/auth-url", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { getGoogleAuthUrl } = await import("./googleDriveStorage");
      const url = getGoogleAuthUrl();
      res.redirect(url);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/gdrive/callback", async (req: any, res) => {
    try {
      const { code } = req.query;
      if (!code) {
        return res.status(400).send("Code manquant");
      }
      const { exchangeCodeForTokens } = await import("./googleDriveStorage");
      const { refreshToken } = await exchangeCodeForTokens(code as string);
      
      res.send(`
        <!DOCTYPE html>
        <html><head><title>Google Drive - Connexion réussie</title>
        <style>body{font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px;text-align:center;}
        .token{background:#f0f0f0;padding:15px;border-radius:8px;word-break:break-all;font-family:monospace;font-size:12px;margin:20px 0;}
        .success{color:#16a34a;font-size:24px;}</style></head>
        <body>
        <h1 class="success">Connexion Google Drive réussie !</h1>
        <p>Copiez le token ci-dessous et ajoutez-le comme secret <strong>GOOGLE_REFRESH_TOKEN</strong> dans Replit :</p>
        <div class="token" id="token">${refreshToken}</div>
        <button onclick="navigator.clipboard.writeText(document.getElementById('token').textContent).then(()=>alert('Copié !'))">Copier le token</button>
        <p style="margin-top:30px;color:#666;">Après avoir ajouté le secret, redémarrez l'application.</p>
        </body></html>
      `);
    } catch (error: any) {
      console.error("[GoogleDrive OAuth] Callback error:", error.message);
      res.status(500).send(`<h1>Erreur</h1><p>${error.message}</p><p><a href="javascript:history.back()">Retour</a></p>`);
    }
  });

  app.get("/api/admin/gdrive/test", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { isGoogleDriveConfigured, uploadToGoogleDrive } = await import("./googleDriveStorage");
      if (!isGoogleDriveConfigured()) {
        return res.status(400).json({ error: "Google Drive non configuré" });
      }
      const testBuffer = Buffer.from("Test upload MyJantes " + new Date().toISOString());
      const result = await uploadToGoogleDrive(testBuffer, "test_connexion.txt", "tests");
      const { deleteFromGoogleDrive, extractFileId } = await import("./googleDriveStorage");
      const fileId = extractFileId(result.filePath);
      if (fileId) await deleteFromGoogleDrive(fileId);
      res.json({ success: true, message: "Upload Google Drive fonctionne !" });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/upload", isAuthenticated, async (req: any, res) => {
    try {
      if (!req.files || !req.files.media) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      const file = req.files.media;
      const mimetype = file.mimetype || '';
      const reference = req.query.reference as string;
      const folder = (req.query.folder as string) || "uploads";
      
      // Validate file type
      if (!mimetype.startsWith('image/') && !mimetype.startsWith('video/') && !mimetype.startsWith('application/pdf')) {
        return res.status(400).json({ error: "Only images, videos and PDFs are allowed" });
      }
      
      let fileData: Buffer;
      if (file.tempFilePath) {
        const fsModule = await import('fs');
        fileData = fsModule.readFileSync(file.tempFilePath);
      } else if (file.data) {
        fileData = file.data;
      } else {
        return res.status(400).json({ error: "Cannot read file data" });
      }

      if (mimetype.startsWith('image/') && mimetype !== 'image/gif') {
        try {
          const { optimizeImageBuffer } = await import("./imageOptimizer");
          fileData = await optimizeImageBuffer(fileData, mimetype);
        } catch (optErr) {
          console.warn("[Upload] Image optimization skipped:", optErr);
        }
      }

      // Apply watermark if reference is provided and it's an image
      if (reference && mimetype.startsWith('image/')) {
        try {
          const { addWatermarkToImage } = await import("./imageWatermark");
          fileData = await addWatermarkToImage(fileData, reference, mimetype);
          console.log(`[Upload] Applied watermark for reference: ${reference}`);
        } catch (wmErr) {
          console.error("[Upload] Watermark failed:", wmErr);
        }
      }

      const objectPath = await uploadToStorage(fileData, file.name, folder);

      if (file.tempFilePath) {
        try { const fsModule = await import('fs'); fsModule.unlinkSync(file.tempFilePath); } catch (_) {}
      }
      
      res.json({ 
        success: true,
        message: "Upload OK",
        objectPath,
        filename: objectPath.split('/').pop() || file.name,
        originalName: file.name,
        size: file.size,
        mimetype: file.mimetype
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ 
        error: "Failed to upload file",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.post("/api/upload-base64", isAuthenticated, async (req: any, res) => {
    try {
      const { base64, mimeType, fileName } = req.body;
      if (!base64 || !mimeType) {
        return res.status(400).json({ error: "base64 and mimeType are required" });
      }

      if (!mimeType.startsWith("image/")) {
        return res.status(400).json({ error: "Only image files are allowed" });
      }

      let fileData = Buffer.from(base64, "base64");

      const maxSize = 15 * 1024 * 1024;
      if (fileData.length > maxSize) {
        return res.status(400).json({ error: "File too large (max 15MB)" });
      }
      const ext = mimeType.split("/")[1] || "jpg";
      const finalName = fileName || `simu-${Date.now()}.${ext}`;
      const folder = "simulator";

      if (mimeType.startsWith("image/") && mimeType !== "image/gif") {
        try {
          const { optimizeImageBuffer } = await import("./imageOptimizer");
          fileData = await optimizeImageBuffer(fileData, mimeType);
        } catch (_) {}
      }

      const objectPath = await uploadToStorage(fileData, finalName, folder);
      res.json({
        success: true,
        objectPath,
        filename: objectPath.split("/").pop() || finalName,
        originalName: finalName,
        size: fileData.length,
        mimetype: mimeType,
      });
    } catch (error) {
      console.error("Error uploading base64:", error);
      res.status(500).json({ error: "Failed to upload", details: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Serve uploaded files (static middleware added in index.ts)

  app.put("/api/quote-media", isAuthenticated, async (req, res) => {
    if (!req.body.mediaURL) {
      return res.status(400).json({ error: "mediaURL is required" });
    }

    const userId = (req as any).user.id;

    try {
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        req.body.mediaURL,
        {
          owner: userId,
          visibility: "private",
        },
      );

      res.status(200).json({ objectPath });
    } catch (error) {
      console.error("Error setting media ACL:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/invoice-media", isAuthenticated, async (req, res) => {
    if (!req.body.mediaURL) {
      return res.status(400).json({ error: "mediaURL is required" });
    }

    const userId = (req as any).user.id;

    try {
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        req.body.mediaURL,
        {
          owner: userId,
          visibility: "private",
        },
      );

      res.status(200).json({ objectPath });
    } catch (error) {
      console.error("Error setting media ACL:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });


  app.post("/api/voice-dictation/send-email", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { to, subject, body, documentType, documentNumber, documentId, clientName } = req.body;

      if (!to || !subject || !body) {
        return res.status(400).json({ message: "Destinataire, sujet et corps de l'email requis" });
      }

      const fs = await import('fs');
      const { generateQuotePDF, generateInvoicePDF } = await import("./emailService");
      const attachments: { filename: string; content: Buffer }[] = [];
      const attachmentNames: string[] = [];

      // Generate and attach PDF document
      if (documentId) {
        try {
          if (documentType === 'quote') {
            const quote = await storage.getQuote(documentId);
            if (quote) {
              const items = await storage.getQuoteItems(documentId);
              const settings = await storage.getApplicationSettings();
              const formatPrice = (val: any) => `${parseFloat(val || "0").toFixed(2)} €`;
              const vdQuoteTTC = parseFloat(quote.quoteAmount || "0");
              const vdQuoteTax = parseFloat(quote.taxAmount || "0");
              const vdQuoteHT = vdQuoteTax > 0 ? (vdQuoteTTC - vdQuoteTax) : (vdQuoteTTC / 1.2);
              const pdfBuffer = generateQuotePDF({
                quoteNumber: quote.reference || quote.id,
                quoteDate: quote.createdAt ? new Date(quote.createdAt).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR'),
                clientName: clientName || 'Client',
                status: quote.status,
                items: items.map(i => ({
                  description: i.description || '',
                  quantity: Number(i.quantity) || 1,
                  unitPrice: parseFloat(i.unitPriceExcludingTax || "0").toFixed(2),
                  total: parseFloat(i.totalExcludingTax || "0").toFixed(2),
                })),
                amount: formatPrice(quote.quoteAmount),
                totalHT: vdQuoteHT.toFixed(2),
                totalTTC: vdQuoteTTC.toFixed(2),
                companyName: settings?.companyName || 'MY JANTES',
              });
              const pdfFilename = `Devis-${quote.reference || quote.id}.pdf`;
              attachments.push({ filename: pdfFilename, content: pdfBuffer });
              attachmentNames.push(pdfFilename);
            }
          } else if (documentType === 'invoice') {
            const invoice = await storage.getInvoice(documentId);
            if (invoice) {
              const items = await storage.getInvoiceItems(documentId);
              const settings = await storage.getApplicationSettings();
              const formatPrice = (val: any) => `${parseFloat(val || "0").toFixed(2)} €`;
              const pdfBuffer = generateInvoicePDF({
                invoiceNumber: invoice.invoiceNumber || invoice.id,
                invoiceDate: invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR'),
                dueDate: invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('fr-FR') : '',
                clientName: clientName || 'Client',
                status: invoice.status,
                items: items.map(i => ({
                  description: i.description || '',
                  quantity: Number(i.quantity) || 1,
                  unitPrice: parseFloat(i.unitPriceExcludingTax || "0").toFixed(2),
                  total: parseFloat(i.totalExcludingTax || "0").toFixed(2),
                })),
                amount: formatPrice(invoice.amount),
                companyName: settings?.companyName || 'MY JANTES',
              });
              const pdfFilename = `Facture-${invoice.invoiceNumber || invoice.id}.pdf`;
              attachments.push({ filename: pdfFilename, content: pdfBuffer });
              attachmentNames.push(pdfFilename);
            }
          }
        } catch (err) {
          console.error("Error generating PDF:", err);
        }

        // Fetch media attachments (photos/videos) from quote or invoice
        try {
          let media: any[] = [];
          if (documentType === 'quote') {
            media = await storage.getQuoteMedia(documentId);
          } else if (documentType === 'invoice') {
            media = await storage.getInvoiceMedia(documentId);
          }

          for (const item of media) {
            try {
              let data: Buffer | null = null;
              if (item.filePath.startsWith("/gdrive/")) {
                try {
                  const { extractFileId, downloadFromGoogleDrive } = await import("./googleDriveStorage");
                  const fileId = extractFileId(item.filePath);
                  if (fileId) {
                    const result = await downloadFromGoogleDrive(fileId);
                    data = result.data;
                  }
                } catch (err) { console.warn(`[Email] Google Drive attachment not found: ${item.filePath}`); }
              } else if (item.filePath.startsWith("/objects/")) {
                try {
                  const result = await objectStorageService.getObject(item.filePath);
                  data = result.data;
                } catch (err) { console.warn(`[Email] Object Storage attachment not found: ${item.filePath}`); }
              } else if (item.filePath.startsWith("https://")) {
                try {
                  const resp = await fetch(item.filePath);
                  if (resp.ok) data = Buffer.from(await resp.arrayBuffer());
                } catch (err) { console.warn(`[Email] Remote attachment fetch failed: ${item.filePath}`); }
              } else {
                const localPath = item.filePath.startsWith('/') ? `.${item.filePath}` : item.filePath;
                if (fs.existsSync(localPath)) {
                  data = fs.readFileSync(localPath);
                } else {
                  try {
                    const result = await objectStorageService.getObject(item.filePath);
                    data = result.data;
                  } catch (storageErr) {
                    console.warn(`[Email] Attachment not found in storage: ${item.filePath}`);
                  }
                }
              }
              if (data) {
                const ext = item.fileType === 'image' ? 'jpg' : 'mp4';
                const filename = item.fileName || `${item.fileType}-${item.id.slice(0, 4)}.${ext}`;
                attachments.push({ filename, content: data });
                attachmentNames.push(filename);
              }
            } catch (err) {
              console.error("Error fetching attachment:", err);
            }
          }
        } catch (err) {
          console.error("Error fetching document media:", err);
        }
      }

      // Generate HTML email with professional template
      const htmlEmail = generateVoiceDictationEmailHtml({
        technicianName: clientName || 'Client',
        date: new Date().toLocaleDateString('fr-FR'),
        content: body,
        companyName: 'MY JANTES',
      });

      const result = await sendEmail({
        to,
        subject,
        html: htmlEmail,
        text: body,
        attachments: attachments.length > 0 ? attachments : undefined,
      });

      if (result.success) {
        // Log audit event
        await logAuditEvent({
          req,
          entityType: documentType === 'quote' ? 'quote' : 'invoice',
          entityId: documentId || documentNumber,
          action: 'updated',
          summary: `Email envoyé via dictée vocale à ${to}`,
          metadata: { emailTo: to, emailSubject: subject, attachmentCount: attachments.length },
        });

        res.json({ success: true, message: "Email envoyé avec succès" });
      } else {
        res.status(500).json({ message: result.error || "Erreur lors de l'envoi de l'email" });
      }
    } catch (error: any) {
      console.error("Error sending voice dictation email:", error);
      res.status(500).json({ message: error.message || "Erreur lors de l'envoi de l'email" });
    }
  });

  // ==================== CHAT API ROUTES ====================
  
  const isStaffUser = (user: any): boolean => {
    return user.role === 'employe' || user.role === 'admin' || user.role === 'superadmin' || user.role === 'root';
  };
  
  // Helper: Check if user is a participant in a conversation
  const isConversationParticipant = async (conversationId: string, userId: string): Promise<boolean> => {
    const participants = await storage.getChatParticipants(conversationId);
    return participants.some(p => p.userId === userId);
  };

  // Get all conversations for the current user
  app.get("/api/chat/conversations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const conversations = await storage.getChatConversations(userId);
      res.json(conversations);
    } catch (error: any) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Create a new conversation
  app.post("/api/chat/conversations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { title, participantIds, type } = req.body;
      
      if (!title) {
        return res.status(400).json({ message: "Le titre est requis" });
      }
      
      if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
        return res.status(400).json({ message: "Au moins un participant est requis" });
      }
      
      const allUsers = await storage.getAllUsers();
      const validParticipantIds: string[] = [];
      const isClientAdminChat = type === "client_admin";
      
      if (isClientAdminChat) {
        // Allow both staff and clients to initiate client_admin conversations
      } else {
        if (!isStaffUser(req.user)) {
          return res.status(403).json({ message: "Accès réservé aux employés et administrateurs" });
        }
      }
      
      for (const participantId of participantIds) {
        const participant = allUsers.find(u => u.id === participantId);
        if (!participant) {
          return res.status(400).json({ message: `Participant ${participantId} introuvable` });
        }
        if (!isClientAdminChat && participant.role === 'client') {
          return res.status(400).json({ message: "Utilisez le type 'client_admin' pour les discussions avec des clients" });
        }
        if (participantId !== userId) {
          validParticipantIds.push(participantId);
        }
      }
      
      const conversation = await storage.createChatConversation({
        title,
        createdById: userId,
        type: isClientAdminChat ? "client_admin" : "internal",
      });
      
      await storage.addChatParticipant({ conversationId: conversation.id, userId });
      
      for (const participantId of validParticipantIds) {
        await storage.addChatParticipant({ conversationId: conversation.id, userId: participantId });
      }
      
      const fullConversation = await storage.getChatConversations(userId);
      const created = fullConversation.find(c => c.id === conversation.id);
      
      res.json(created || conversation);
    } catch (error: any) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get messages for a conversation
  app.get("/api/chat/conversations/:conversationId/messages", isAuthenticated, async (req: any, res) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user.id;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      if (!await isConversationParticipant(conversationId, userId)) {
        return res.status(403).json({ message: "Vous n'êtes pas membre de cette conversation" });
      }
      
      const messages = await storage.getChatMessages(conversationId, limit, offset);
      await storage.updateLastRead(conversationId, userId);
      
      res.json(messages);
    } catch (error: any) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Send a message
  app.post("/api/chat/conversations/:conversationId/messages", isAuthenticated, async (req: any, res) => {
    try {
      const { conversationId } = req.params;
      const { content } = req.body;
      const userId = req.user.id;
      
      if (!await isConversationParticipant(conversationId, userId)) {
        return res.status(403).json({ message: "Vous n'êtes pas membre de cette conversation" });
      }
      
      if (!content || content.trim().length === 0) {
        return res.status(400).json({ message: "Le message ne peut pas être vide" });
      }
      
      const message = await storage.createChatMessage({
        conversationId,
        senderId: userId,
        content: content.trim(),
      });
      
      const participants = await storage.getChatParticipants(conversationId);
      const senderName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email;
      
      for (const participant of participants) {
        if (participant.userId !== userId) {
          await storage.createNotification({
            userId: participant.userId,
            type: "chat",
            title: `Nouveau message de ${senderName}`,
            message: content.length > 50 ? content.substring(0, 50) + "..." : content,
            relatedId: conversationId,
          });
          
          const wsClient = wsClients.get(participant.userId);
          if (wsClient && wsClient.readyState === WebSocket.OPEN) {
            wsClient.send(JSON.stringify({
              type: 'chat_message',
              conversationId,
              message: {
                ...message,
                sender: {
                  id: req.user.id,
                  firstName: req.user.firstName,
                  lastName: req.user.lastName,
                  email: req.user.email,
                  profileImageUrl: req.user.profileImageUrl,
                },
                attachments: [],
              },
            }));
          }
        }
      }
      
      const sender = await storage.getUser(userId);
      res.json({ ...message, sender, attachments: [] });
    } catch (error: any) {
      console.error("Error sending message:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Upload attachment for a message (removed - handled differently)

  // Get participants of a conversation
  app.get("/api/chat/conversations/:conversationId/participants", isAuthenticated, async (req: any, res) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user.id;
      
      if (!await isConversationParticipant(conversationId, userId)) {
        return res.status(403).json({ message: "Vous n'êtes pas membre de cette conversation" });
      }
      
      const participants = await storage.getChatParticipants(conversationId);
      res.json(participants);
    } catch (error: any) {
      console.error("Error fetching participants:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Add participant to a conversation (admin only)
  app.post("/api/chat/conversations/:conversationId/participants", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { conversationId } = req.params;
      const { userId } = req.body;
      
      const userToAdd = await storage.getUser(userId);
      if (!userToAdd) {
        return res.status(400).json({ message: "Utilisateur introuvable" });
      }
      
      const participant = await storage.addChatParticipant({ conversationId, userId });
      res.json(participant);
    } catch (error: any) {
      console.error("Error adding participant:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get eligible users for chat (employees and admins only)
  app.get("/api/chat/users", isAuthenticated, async (req: any, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      if (isStaffUser(req.user)) {
        res.json(sanitizeUsers(allUsers));
      } else {
        const staffUsers = allUsers.filter(u => u.role === 'employe' || u.role === 'admin' || u.role === 'superadmin');
        res.json(sanitizeUsers(staffUsers));
      }
    } catch (error: any) {
      console.error("Error fetching chat users:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Mark conversation as read
  app.post("/api/chat/conversations/:conversationId/read", isAuthenticated, async (req: any, res) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user.id;
      
      if (!await isConversationParticipant(conversationId, userId)) {
        return res.status(403).json({ message: "Vous n'êtes pas membre de cette conversation" });
      }
      
      await storage.updateLastRead(conversationId, userId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error marking conversation as read:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== EXPORT API ====================
  app.get("/api/admin/export/quotes", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { startDate, endDate, clientId, status } = req.query;
      const garageScope = getGarageScope(req.user);
      let allQuotes = await storage.getQuotes();
      
      if (garageScope) allQuotes = allQuotes.filter(q => q.garageId === garageScope);
      if (startDate) allQuotes = allQuotes.filter(q => q.createdAt && new Date(q.createdAt) >= new Date(startDate as string));
      if (endDate) allQuotes = allQuotes.filter(q => q.createdAt && new Date(q.createdAt) <= new Date(endDate as string));
      if (clientId) allQuotes = allQuotes.filter(q => q.clientId === clientId);
      if (status) allQuotes = allQuotes.filter(q => q.status === status);

      const allUsers = await storage.getAllUsers();
      const allServices = await storage.getServices();
      
      const csvRows = [
        ["Référence", "Client", "Email", "Service", "Montant TTC", "Montant HT", "TVA %", "Statut", "Date création", "Détails"].join(";")
      ];
      
      for (const q of allQuotes) {
        const client = allUsers.find(u => u.id === q.clientId);
        const service = allServices.find(s => s.id === q.serviceId);
        const clientName = client ? `${client.firstName || ""} ${client.lastName || ""}`.trim() || client.email : "";
        const clientEmail = client?.email || "";
        
        csvRows.push([
          q.reference || q.id.slice(0, 8),
          `"${clientName}"`,
          clientEmail,
          service ? `"${service.name}"` : "",
          q.quoteAmount || "0",
          q.priceExcludingTax || "",
          q.taxRate || "20",
          q.status,
          q.createdAt ? new Date(q.createdAt).toLocaleDateString("fr-FR") : "",
          `"${(q.productDetails || "").replace(/"/g, '""')}"`,
        ].join(";"));
      }
      
      const csv = "\uFEFF" + csvRows.join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=export_devis_${new Date().toISOString().slice(0, 10)}.csv`);
      res.send(csv);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/export/invoices", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { startDate, endDate, clientId, status } = req.query;
      const garageScope = getGarageScope(req.user);
      let allInvoices = await storage.getInvoices();
      
      if (garageScope) allInvoices = allInvoices.filter(i => i.garageId === garageScope);
      if (startDate) allInvoices = allInvoices.filter(i => i.createdAt && new Date(i.createdAt) >= new Date(startDate as string));
      if (endDate) allInvoices = allInvoices.filter(i => i.createdAt && new Date(i.createdAt) <= new Date(endDate as string));
      if (clientId) allInvoices = allInvoices.filter(i => i.clientId === clientId);
      if (status) allInvoices = allInvoices.filter(i => i.status === status);

      const allUsers = await storage.getAllUsers();
      
      const csvRows = [
        ["N° Facture", "Client", "Email", "Montant TTC", "Montant HT", "TVA %", "Statut", "Date création", "Date échéance", "Méthode paiement", "Notes"].join(";")
      ];
      
      for (const inv of allInvoices) {
        const client = allUsers.find(u => u.id === inv.clientId);
        const clientName = client ? `${client.firstName || ""} ${client.lastName || ""}`.trim() || client.email : "";
        const clientEmail = client?.email || "";
        
        csvRows.push([
          inv.invoiceNumber || inv.id.slice(0, 8),
          `"${clientName}"`,
          clientEmail,
          inv.amount || "0",
          (inv as any).amountExcludingTax || inv.priceExcludingTax || "",
          inv.taxRate || "20",
          inv.status,
          inv.createdAt ? new Date(inv.createdAt).toLocaleDateString("fr-FR") : "",
          inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("fr-FR") : "",
          inv.paymentMethod || "",
          `"${(inv.notes || "").replace(/"/g, '""')}"`,
        ].join(";"));
      }
      
      const csv = "\uFEFF" + csvRows.join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=export_factures_${new Date().toISOString().slice(0, 10)}.csv`);
      res.send(csv);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== WHEEL CONFIGURATOR ====================
  const CONFIGURATOR_PRICES = {
    serviceBase: { renovation: 99, personnalisation: 160, "diamond-cut": 140, reparation: 120 } as Record<string, number>,
    colors: { "noir-mat": 0, "noir-brillant": 20, "gris-anthracite": 0, "gris-argent": 10, "blanc-nacre": 30, "blanc-brillant": 20, bronze: 30, "or-champagne": 40, "rouge-candy": 50, "bleu-nuit": 30, gunmetal: 15, cuivre: 35 } as Record<string, number>,
    finishes: { mat: 0, brillant: 20, satin: 10, metallique: 30, "diamond-cut": 60, hydrographie: 80 } as Record<string, number>,
    sizes: { "16": 0, "17": 0, "18": 10, "19": 20, "20": 35, "21": 50, "22": 70 } as Record<string, number>,
    accessories: { lisere: 15, "centre-logo": 25, "valve-alu": 8, "sticker-perso": 20 } as Record<string, number>,
  };

  function computeConfiguratorPrice(serviceType: string, color: string, finish: string, size: string, wheelCount: number, accessories: string[]) {
    const count = wheelCount || 4;
    const base = CONFIGURATOR_PRICES.serviceBase[serviceType] || 99;
    const perWheel = base + (CONFIGURATOR_PRICES.colors[color] || 0) + (CONFIGURATOR_PRICES.finishes[finish] || 0) + (CONFIGURATOR_PRICES.sizes[size] || 0);
    const accessoriesTotal = (accessories || []).reduce((s: number, a: string) => s + ((CONFIGURATOR_PRICES.accessories[a] || 0) * count), 0);
    const totalHT = (perWheel * count) + accessoriesTotal;
    const tva = Math.round(totalHT * 0.20 * 100) / 100;
    return { totalHT, tva, totalTTC: totalHT + tva, perWheel, count };
  }

  app.post("/api/configurator/quote-request", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { configuration } = req.body;
      if (!configuration) {
        return res.status(400).json({ message: "Configuration requise" });
      }

      const serverPrice = computeConfiguratorPrice(
        configuration.serviceType, configuration.color || "", configuration.finish || "",
        configuration.size || "18", configuration.wheelCount || 4, configuration.accessories || []
      );

      const services = await storage.getServices();
      let matchedService = services.find(s => 
        s.name.toLowerCase().includes("personnalisation") && s.isActive
      );
      if (!matchedService) {
        matchedService = services.find(s => s.isActive);
      }
      if (!matchedService) {
        return res.status(400).json({ message: "Aucun service disponible" });
      }

      const requestDetails = {
        source: "configurateur",
        serviceType: configuration.serviceType,
        color: configuration.colorName,
        finish: configuration.finishName,
        size: configuration.size,
        wheelCount: configuration.wheelCount,
        accessories: configuration.accessories,
        estimatedPriceHT: serverPrice.totalHT,
        estimatedTVA: serverPrice.tva,
        estimatedTotalTTC: serverPrice.totalTTC,
        configSummary: configuration.summary,
      };

      const quote = await storage.createQuote({
        clientId: userId,
        serviceId: matchedService.id,
        status: "pending",
        requestDetails,
        wheelCount: configuration.wheelCount || 4,
        priceExcludingTax: String(serverPrice.totalHT),
        taxRate: "20.00",
        taxAmount: String(serverPrice.tva),
        quoteAmount: String(serverPrice.totalTTC),
        notes: `[Configurateur] ${configuration.summary}`,
      });

      if (configuration.wheelImageUrl) {
        try {
          await storage.createQuoteMedia({
            quoteId: quote.id,
            filePath: configuration.wheelImageUrl,
            fileType: "image",
            fileName: "rendu-3d-configurateur.png",
          });
        } catch (mediaErr) {
          console.error("Error attaching 3D render to quote:", mediaErr);
        }
      }

      if (configuration.bgPhotoUrl) {
        try {
          await storage.createQuoteMedia({
            quoteId: quote.id,
            filePath: configuration.bgPhotoUrl,
            fileType: "image",
            fileName: "photo-client.jpg",
          });
        } catch (mediaErr) {
          console.error("Error attaching client photo to quote:", mediaErr);
        }
      }

      res.json({ success: true, quoteId: quote.id, message: "Demande de devis créée" });
    } catch (error: any) {
      console.error("Configurator quote error:", error);
      res.status(500).json({ message: error.message || "Erreur lors de la création du devis" });
    }
  });

  app.post("/api/configurator/estimate", async (req: any, res) => {
    try {
      const { serviceType, color, finish, size, wheelCount, accessories } = req.body;
      const result = computeConfiguratorPrice(serviceType, color, finish, size, wheelCount, accessories);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== AI ASSISTANT ====================
  app.post("/api/ai/assistant", isAuthenticated, async (req: any, res) => {
    try {
      const { messages } = req.body;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ message: "Messages requis" });
      }
      const { generateAssistantResponse } = await import("./aiAssistant");
      const response = await generateAssistantResponse(messages, req.user.role);
      res.json({ response });
    } catch (error: any) {
      console.error("AI Assistant error:", error.message, error.stack?.substring(0, 300));
      res.status(500).json({ message: "L'assistant est temporairement indisponible. Veuillez réessayer." });
    }
  });

  app.post("/api/ai/analyze-wheel", isAuthenticated, async (req: any, res) => {
    try {
      const { imageBase64, imageMimeType, prompt, conversationHistory } = req.body;
      if (!imageBase64 || !imageMimeType) {
        return res.status(400).json({ message: "Image requise" });
      }
      const maxSize = 10 * 1024 * 1024;
      const imageSize = Buffer.from(imageBase64, 'base64').length;
      if (imageSize > maxSize) {
        return res.status(400).json({ message: "Image trop volumineuse (max 10 MB)" });
      }
      const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!validTypes.includes(imageMimeType)) {
        return res.status(400).json({ message: "Format non supporté. Utilisez JPG, PNG ou WEBP." });
      }
      const { analyzeWheelImage } = await import("./aiAssistant");
      const response = await analyzeWheelImage(
        imageBase64,
        imageMimeType,
        prompt || "Analyse cette jante et propose des options de personnalisation.",
        conversationHistory || []
      );
      res.json({ response });
    } catch (error: any) {
      console.error("AI Wheel Analysis error:", error.message);
      res.status(500).json({ message: "L'analyse est temporairement indisponible. Veuillez réessayer." });
    }
  });

  app.post("/api/ai/analyze-wheel-params", isAuthenticated, async (req: any, res) => {
    try {
      const { imageBase64, imageMimeType } = req.body;
      if (!imageBase64 || !imageMimeType) {
        return res.status(400).json({ message: "Image requise" });
      }
      const { analyzeWheelImage } = await import("./aiAssistant");
      const structuredPrompt = `Analyse cette photo de jante automobile avec une grande précision pour permettre une reconstruction 3D fidèle. Examine attentivement la forme des branches, leur courbure, leur épaisseur, la profondeur du plat (dish/concavité), et le style global.

Réponds UNIQUEMENT avec un objet JSON valide (pas de markdown, pas de texte autour, pas de \`\`\`json), avec exactement ces champs :
{
  "spokeCount": <nombre EXACT de branches principales visibles, entre 3 et 20>,
  "spokeWidth": <largeur relative des branches entre 0.03 et 0.20 (0.03=très fines, 0.15=larges)>,
  "spokePattern": <style géométrique parmi: "straight" (droites simples), "double" (paires parallèles), "ysplit" (branches en Y qui se divisent), "curved" (courbées dans un sens), "turbine" (fortement courbées type turbine), "mesh" (grillage/treillis avec nombreuses fines branches), "split5" (branches larges avec fente centrale), "fan" (éventail s'élargissant vers l'extérieur), "multipiece" (jante multi-pièces avec boulons visibles sur le bord), "classic" (branches organiques/étoile classique)>,
  "dishDepth": <profondeur du plat/concavité entre 0.0 (plat) et 0.35 (très concave). Regarde si les branches sont en retrait par rapport à la lèvre>,
  "spokeCurvature": <courbure des branches entre 0.0 (droites) et 0.8 (très courbées). Important pour "curved" et "turbine">,
  "spokeSplitRatio": <pour "ysplit" uniquement, point de division entre 0.3 et 0.7 (0.5=milieu)>,
  "lipStepCount": <nombre de niveaux sur la lèvre: 1 (simple) ou 2 (lèvre à marche)>,
  "color": <couleur hexadécimale principale ex "#c0c0c0">,
  "colorName": <nom de la couleur en français>,
  "finish": <type de finition parmi: "mat", "brillant", "chrome", "carbone", "forge", "satine">,
  "rimDepth": <profondeur du rebord/lèvre entre 0.15 et 0.40>,
  "hubRadius": <rayon du moyeu central entre 0.12 et 0.30>,
  "lipWidth": <largeur de la lèvre entre 0.03 et 0.10>,
  "description": <description courte de la jante en français, max 80 caractères, incluant le style identifié>
}
Sois TRÈS précis sur le spokePattern : c'est le paramètre le plus important pour la reconstruction. Analyse la forme exacte des branches.`;

      const response = await analyzeWheelImage(imageBase64, imageMimeType, structuredPrompt, []);

      let parsed: any = null;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      } catch (parseErr) {
        console.error("Failed to parse wheel params JSON:", parseErr);
      }

      if (!parsed) {
        return res.json({
          params: null,
          rawResponse: response,
          message: "Impossible d'extraire les paramètres automatiquement"
        });
      }

      const validPatterns = ["straight", "double", "ysplit", "curved", "turbine", "mesh", "split5", "fan", "multipiece", "classic"];
      const safeParams = {
        spokeCount: Math.min(20, Math.max(3, parseInt(parsed.spokeCount) || 5)),
        spokeWidth: Math.min(0.20, Math.max(0.03, parseFloat(parsed.spokeWidth) || 0.12)),
        spokePattern: validPatterns.includes(parsed.spokePattern) ? parsed.spokePattern : "straight",
        dishDepth: Math.min(0.35, Math.max(0.0, parseFloat(parsed.dishDepth) || 0.15)),
        spokeCurvature: Math.min(0.8, Math.max(0.0, parseFloat(parsed.spokeCurvature) || 0.0)),
        spokeSplitRatio: Math.min(0.7, Math.max(0.3, parseFloat(parsed.spokeSplitRatio) || 0.5)),
        lipStepCount: [1, 2].includes(parseInt(parsed.lipStepCount)) ? parseInt(parsed.lipStepCount) : 1,
        color: typeof parsed.color === "string" && /^#[0-9a-fA-F]{6}$/.test(parsed.color) ? parsed.color : "#c0c0c0",
        colorName: parsed.colorName || "Argent",
        finish: ["mat", "brillant", "chrome", "carbone", "forge", "satine"].includes(parsed.finish) ? parsed.finish : "brillant",
        rimDepth: Math.min(0.40, Math.max(0.15, parseFloat(parsed.rimDepth) || 0.25)),
        hubRadius: Math.min(0.30, Math.max(0.12, parseFloat(parsed.hubRadius) || 0.18)),
        lipWidth: Math.min(0.10, Math.max(0.03, parseFloat(parsed.lipWidth) || 0.06)),
        description: parsed.description || "Jante analysée",
      };

      res.json({ params: safeParams });
    } catch (error: any) {
      console.error("Wheel params analysis error:", error.message);
      res.status(500).json({ message: "L'analyse est temporairement indisponible." });
    }
  });

  const hdRenderLimits = new Map<string, { count: number; resetAt: number }>();
  app.post("/api/ai/render-hd", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const now = Date.now();
      const limit = hdRenderLimits.get(userId);
      if (limit && limit.resetAt > now && limit.count >= 5) {
        return res.status(429).json({ message: "Limite de rendus HD atteinte (5/heure). Réessayez plus tard." });
      }
      if (!limit || limit.resetAt <= now) {
        hdRenderLimits.set(userId, { count: 1, resetAt: now + 3600000 });
      } else {
        limit.count++;
      }

      const { imageBase64, params } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ message: "Image requise" });
      }

      const { analyzeWheelImage } = await import("./aiAssistant");
      const prompt = `Tu es un assistant de rendu 3D professionnel. Voici une capture d'un modèle 3D de jante avec ces paramètres : couleur ${params?.color || 'argent'}, finition ${params?.finish || 'standard'}, metalness ${params?.metalness || 0.8}, roughness ${params?.roughness || 0.2}${params?.lisereEnabled ? ', liseré ' + params.lisereColor : ''}${params?.gravureText ? ', gravure "' + params.gravureText + '"' : ''}. Décris cette jante en détail et suggère comment améliorer le rendu pour un résultat photoréaliste. Propose des améliorations de matériaux et d'éclairage.`;

      const callWithTimeout = (retryAttempt = 0): Promise<string> => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            if (retryAttempt === 0) {
              callWithTimeout(1).then(resolve).catch(reject);
            } else {
              reject(new Error("Timeout après 30 secondes"));
            }
          }, 30000);

          analyzeWheelImage(imageBase64, "image/png", prompt, [])
            .then((result: string) => {
              clearTimeout(timer);
              resolve(result);
            })
            .catch((err: any) => {
              clearTimeout(timer);
              if (retryAttempt === 0) {
                callWithTimeout(1).then(resolve).catch(reject);
              } else {
                reject(err);
              }
            });
        });
      };

      const response = await callWithTimeout();
      res.json({ message: response, imageBase64: null });
    } catch (error: any) {
      console.error("HD Render error:", error.message);
      res.status(500).json({ message: "Le rendu HD est temporairement indisponible. Réessayez." });
    }
  });

  app.post("/api/admin/migrate-media-to-cloud", isAuthenticated, isAdmin, async (req: any, res) => {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ message: "Superadmin uniquement" });
    }
    try {
      const { isGoogleDriveConfigured, uploadToGoogleDrive } = await import("./googleDriveStorage");
      const fsLocal = await import("fs");
      const pathLocal = await import("path");
      
      const useGDrive = isGoogleDriveConfigured();
      let objStore: any = null;
      if (!useGDrive) {
        objStore = objectStorageService;
      }
      
      let migratedQuotes = 0, migratedInvoices = 0, skippedQuotes = 0, skippedInvoices = 0, errors = 0;
      const errorDetails: string[] = [];
      
      const allQuoteMedia = await db.select().from(quoteMedia);
      for (const item of allQuoteMedia) {
        if (item.filePath && !item.filePath.startsWith("/objects/") && !item.filePath.startsWith("https://") && !item.filePath.startsWith("/gdrive/")) {
          try {
            const localPath = item.filePath.startsWith('/') ? `.${item.filePath}` : item.filePath;
            if (fsLocal.existsSync(localPath)) {
              const fileData = fsLocal.readFileSync(localPath);
              const fileName = pathLocal.basename(localPath);
              let newPath: string;
              if (useGDrive) {
                const result = await uploadToGoogleDrive(fileData, fileName, "quotes");
                newPath = result.filePath;
              } else {
                newPath = await objStore.uploadFileBuffer(fileData, fileName, "quotes");
              }
              await db.update(quoteMedia).set({ filePath: newPath }).where(eq(quoteMedia.id, item.id));
              migratedQuotes++;
              console.log(`[Migration] Quote media ${item.id}: ${item.filePath} -> ${newPath}`);
            } else {
              skippedQuotes++;
            }
          } catch (err: any) { 
            errors++; 
            errorDetails.push(`Quote ${item.id}: ${err.message}`);
            console.error(`[Migration] Quote media error ${item.id}:`, err.message); 
          }
        }
      }
      
      const allInvoiceMedia = await db.select().from(invoiceMedia);
      for (const item of allInvoiceMedia) {
        if (item.filePath && !item.filePath.startsWith("/objects/") && !item.filePath.startsWith("https://") && !item.filePath.startsWith("/gdrive/")) {
          try {
            const localPath = item.filePath.startsWith('/') ? `.${item.filePath}` : item.filePath;
            if (fsLocal.existsSync(localPath)) {
              const fileData = fsLocal.readFileSync(localPath);
              const fileName = pathLocal.basename(localPath);
              let newPath: string;
              if (useGDrive) {
                const result = await uploadToGoogleDrive(fileData, fileName, "invoices");
                newPath = result.filePath;
              } else {
                newPath = await objStore.uploadFileBuffer(fileData, fileName, "invoices");
              }
              await db.update(invoiceMedia).set({ filePath: newPath }).where(eq(invoiceMedia.id, item.id));
              migratedInvoices++;
              console.log(`[Migration] Invoice media ${item.id}: ${item.filePath} -> ${newPath}`);
            } else {
              skippedInvoices++;
            }
          } catch (err: any) { 
            errors++; 
            errorDetails.push(`Invoice ${item.id}: ${err.message}`);
            console.error(`[Migration] Invoice media error ${item.id}:`, err.message); 
          }
        }
      }
      
      res.json({
        message: `Migration terminée`,
        destination: useGDrive ? "Google Drive" : "Object Storage",
        migratedQuotes,
        migratedInvoices,
        skippedQuotes,
        skippedInvoices,
        errors,
        errorDetails: errorDetails.slice(0, 10),
        total: migratedQuotes + migratedInvoices,
      });
    } catch (error: any) {
      console.error("Error migrating media:", error);
      res.status(500).json({ message: error.message || "Erreur de migration" });
    }
  });

  // JSON Backup endpoint (admin only) - exports all data in JSON format
  app.get("/api/admin/backup", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const backupData = {
        version: "1.1",
        exportedAt: new Date().toISOString(),
        data: {
          users: await storage.getAllUsers(),
          services: await storage.getServices(),
          quotes: await storage.getQuotes(),
          quoteItems: await db.select().from(quoteItems),
          quoteMedia: await db.select().from(quoteMedia),
          invoices: await storage.getInvoices(),
          invoiceItems: await db.select().from(invoiceItems),
          invoiceMedia: await db.select().from(invoiceMedia),
          reservations: await storage.getReservations(),
          reservationServices: await db.select().from(reservationServices),
          notifications: await db.select().from(notifications),
          engagements: await storage.getEngagements(),
          workflows: await storage.getWorkflows(),
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
          chatAttachments: await db.select().from(chatAttachments),
        }
      };
      
      const filename = `myjantes-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.json(backupData);
      
    } catch (error: any) {
      console.error("Backup error:", error);
      res.status(500).json({ message: "Erreur lors de la sauvegarde", error: error.message });
    }
  });

  // Restore endpoint (admin only) - imports data from JSON backup
  app.post("/api/admin/restore", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { data, options = {} } = req.body;
      
      if (!data || !data.version) {
        return res.status(400).json({ message: "Format de backup invalide" });
      }
      
      const { clearExisting = false } = options;
      const results: Record<string, { imported: number; errors: number; skipped?: number }> = {};
      
      // Table mapping for dynamic import
      const tableMap: Record<string, any> = {
        users, services, quotes, quoteItems, quoteMedia,
        invoices, invoiceItems, invoiceMedia, reservations,
        reservationServices, notifications, engagements,
        workflows, workflowSteps, serviceWorkflows, workshopTasks,
        applicationSettings, invoiceCounters, auditLogs, auditLogChanges,
        chatConversations, chatParticipants, chatMessages, chatAttachments
      };
      
      // Import order matters due to foreign keys
      const importOrder = [
        'users', 'services', 'quotes', 'quoteItems', 'quoteMedia',
        'invoices', 'invoiceItems', 'invoiceMedia', 'reservations',
        'reservationServices', 'notifications', 'engagements',
        'workflows', 'workflowSteps', 'serviceWorkflows', 'workshopTasks',
        'applicationSettings', 'invoiceCounters', 'auditLogs', 'auditLogChanges',
        'chatConversations', 'chatParticipants', 'chatMessages', 'chatAttachments'
      ];
      
      for (const tableName of importOrder) {
        const tableData = data.data?.[tableName];
        if (!tableData || !Array.isArray(tableData)) continue;
        
        results[tableName] = { imported: 0, errors: 0, skipped: 0 };
        const table = tableMap[tableName];
        if (!table) continue;
        
        for (const row of tableData) {
          try {
            // For users, check if exists first
            if (tableName === 'users') {
              const existingUser = await storage.getUser(row.id);
              if (existingUser) {
                results[tableName].skipped = (results[tableName].skipped || 0) + 1;
                continue;
              }
            }
            
            await db.insert(table).values(row).onConflictDoNothing();
            results[tableName].imported++;
          } catch (err: any) {
            console.error(`Error importing ${tableName}:`, err.message);
            results[tableName].errors++;
          }
        }
      }
      
      res.json({ 
        success: true, 
        message: "Restauration terminée",
        results 
      });
      
    } catch (error: any) {
      console.error("Restore error:", error);
      res.status(500).json({ message: "Erreur lors de la restauration", error: error.message });
    }
  });

  // Get backup info/stats (admin only)
  app.get("/api/admin/backup-stats", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const stats = {
        users: (await storage.getAllUsers()).length,
        services: (await storage.getServices()).length,
        quotes: (await storage.getQuotes()).length,
        invoices: (await storage.getInvoices()).length,
        reservations: (await storage.getReservations()).length,
        engagements: (await storage.getEngagements()).length,
        workflows: (await storage.getWorkflows()).length,
      };
      
      res.json(stats);
    } catch (error: any) {
      console.error("Backup stats error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Backup scheduler routes
  app.get("/api/admin/backup-scheduler", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { getBackupSettings, listBackups } = await import("./backupScheduler");
      const settings = getBackupSettings();
      const backups = await listBackups();
      res.json({ settings, backups });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/backup-scheduler", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { updateBackupSchedule, getBackupSettings } = await import("./backupScheduler");
      const { enabled, time, emailEnabled, emailRecipient } = req.body;
      updateBackupSchedule({ enabled, time, emailEnabled, emailRecipient });
      res.json({ success: true, settings: getBackupSettings() });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/backup-now", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { triggerManualBackup } = await import("./backupScheduler");
      const result = await triggerManualBackup();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Database export endpoint (admin only)
  app.get("/api/admin/export-database", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { pool } = await import("./db");
      
      const getTableNames = async (): Promise<string[]> => {
        const result = await pool.query(`
          SELECT tablename FROM pg_tables 
          WHERE schemaname = 'public'
          ORDER BY tablename
        `);
        return result.rows.map((row: any) => row.tablename);
      };

      const getTableSchema = async (tableName: string): Promise<string> => {
        const result = await pool.query(`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position
        `, [tableName]);
        
        const columns = result.rows.map((col: any) => {
          let def = `  "${col.column_name}" ${col.data_type.toUpperCase()}`;
          if (col.column_default) def += ` DEFAULT ${col.column_default}`;
          if (col.is_nullable === 'NO') def += ' NOT NULL';
          return def;
        });
        
        return `CREATE TABLE IF NOT EXISTS "${tableName}" (\n${columns.join(',\n')}\n);`;
      };

      const getTableData = async (tableName: string): Promise<string> => {
        const result = await pool.query(`SELECT * FROM "${tableName}"`);
        
        if (result.rows.length === 0) {
          return `-- No data in table ${tableName}`;
        }
        
        const columns = Object.keys(result.rows[0]);
        const inserts: string[] = [];
        
        for (const row of result.rows) {
          const values = columns.map(col => {
            const val = row[col];
            if (val === null) return 'NULL';
            if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
            if (typeof val === 'number') return val.toString();
            if (val instanceof Date) return `'${val.toISOString()}'`;
            if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
            return `'${String(val).replace(/'/g, "''")}'`;
          });
          inserts.push(`INSERT INTO "${tableName}" ("${columns.join('", "')}") VALUES (${values.join(', ')});`);
        }
        
        return inserts.join('\n');
      };

      const tables = await getTableNames();
      let output = `-- Database Export\n-- Generated: ${new Date().toISOString()}\n-- Tables: ${tables.join(', ')}\n\n`;
      output += '\n';
      
      for (const table of tables) {
        output += `-- ==========================================\n`;
        output += `-- Table: ${table}\n`;
        output += `-- ==========================================\n\n`;
        
        const schema = await getTableSchema(table);
        output += schema + '\n\n';
        
        const data = await getTableData(table);
        output += data + '\n\n';
      }
      
      output += '';
      
      const filename = `myjantes-export-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.sql`;
      res.setHeader('Content-Type', 'application/sql');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(output);
      
    } catch (error: any) {
      console.error("Database export error:", error);
      res.status(500).json({ message: "Erreur lors de l'export de la base de données", error: error.message });
    }
  });

  app.get("/api/admin/export-data", isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
      const { generateBackupData } = await import("./backupScheduler");
      const backupData = await generateBackupData();
      
      const garagesList = await db.select().from(garages);
      (backupData.data as any).garages = garagesList;
      
      const filename = `myjantes-data-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(JSON.stringify(backupData, null, 2));
    } catch (error: any) {
      console.error("Data export error:", error);
      res.status(500).json({ message: "Erreur lors de l'export des données", error: error.message });
    }
  });

  app.post("/api/admin/import-data", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      if (!req.files || !req.files.file) {
        return res.status(400).json({ message: "Aucun fichier fourni" });
      }
      
      const file = req.files.file;
      let content: string;
      if (file.tempFilePath) {
        content = fs.readFileSync(file.tempFilePath, 'utf8');
      } else {
        content = file.data.toString('utf8');
      }
      let backupData;
      
      try {
        backupData = JSON.parse(content);
      } catch (e) {
        return res.status(400).json({ message: "Fichier JSON invalide" });
      }
      
      if (!backupData || !backupData.data) {
        return res.status(400).json({ message: "Format de backup invalide. Le fichier doit contenir 'data'." });
      }
      
      const { pool } = await import("./db");

      function camelToSnake(s: string): string {
        return s.replace(/([A-Z])/g, '_$1').toLowerCase();
      }

      const camelToSnakeTableMap: Record<string, string> = {
        garages: 'garages', users: 'users', services: 'services',
        quotes: 'quotes', quoteItems: 'quote_items', quoteMedia: 'quote_media',
        invoices: 'invoices', invoiceItems: 'invoice_items', invoiceMedia: 'invoice_media',
        reservations: 'reservations', reservationServices: 'reservation_services',
        notifications: 'notifications', engagements: 'engagements',
        workflows: 'workflows', workflowSteps: 'workflow_steps',
        serviceWorkflows: 'service_workflows', workshopTasks: 'workshop_tasks',
        applicationSettings: 'application_settings', invoiceCounters: 'invoice_counters',
        auditLogs: 'audit_logs', auditLogChanges: 'audit_log_changes',
        chatConversations: 'chat_conversations', chatParticipants: 'chat_participants',
        chatMessages: 'chat_messages', chatAttachments: 'chat_attachments',
      };

      const importOrder = [
        'garages',
        'users', 'services', 'quotes', 'quoteItems', 'quoteMedia',
        'invoices', 'invoiceItems', 'invoiceMedia', 'reservations',
        'reservationServices', 'notifications', 'engagements',
        'workflows', 'workflowSteps', 'serviceWorkflows', 'workshopTasks',
        'applicationSettings', 'invoiceCounters', 'auditLogs', 'auditLogChanges',
        'chatConversations', 'chatParticipants', 'chatMessages', 'chatAttachments'
      ];
      
      const results: Record<string, { imported: number; errors: number; skipped: number }> = {};

      // Neon doesn't support session_replication_role
      
      for (const tableName of importOrder) {
        const tableData = backupData.data?.[tableName];
        if (!tableData || !Array.isArray(tableData) || tableData.length === 0) continue;
        
        const sqlTable = camelToSnakeTableMap[tableName] || tableName;
        results[tableName] = { imported: 0, errors: 0, skipped: 0 };
        
        for (const row of tableData) {
          try {
            const entries = Object.entries(row).filter(([, v]) => v !== undefined);
            if (entries.length === 0) continue;

            const cols = entries.map(([k]) => `"${camelToSnake(k)}"`);
            const placeholders = entries.map((_, i) => `$${i + 1}`);
            const values = entries.map(([, v]) => {
              if (v === null) return null;
              if (typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) return JSON.stringify(v);
              if (Array.isArray(v)) return JSON.stringify(v);
              return v;
            });

            const insertSQL = `INSERT INTO "${sqlTable}" (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT DO NOTHING`;
            const result = await pool.query(insertSQL, values);
            if (result.rowCount && result.rowCount > 0) {
              results[tableName].imported++;
            } else {
              results[tableName].skipped++;
            }
          } catch (err: any) {
            results[tableName].errors++;
            if (results[tableName].errors <= 3) {
              console.error(`[JSON Import] ${sqlTable}:`, err.message?.slice(0, 200));
            }
          }
        }
        console.log(`[JSON Import] ${sqlTable}: ${results[tableName].imported} imported, ${results[tableName].skipped} skipped, ${results[tableName].errors} errors`);
      }

      // Neon doesn't support session_replication_role
      
      await logAuditEvent({
        req,
        entityType: "service" as EntityType,
        entityId: "import",
        action: "created" as ActionType,
        summary: `Import de données: ${JSON.stringify(results)}`
      });
      
      res.json({ 
        success: true, 
        message: "Import terminé",
        version: backupData.version,
        exportedAt: backupData.exportedAt,
        results 
      });
      
    } catch (error: any) {
      console.error("Data import error:", error);
      const { pool } = await import("./db");
      // Neon doesn't support session_replication_role
      res.status(500).json({ message: "Erreur lors de l'import des données", error: error.message });
    }
  });

  app.post("/api/admin/import-sql", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      if (!req.files || !req.files.file) {
        return res.status(400).json({ message: "Aucun fichier SQL fourni" });
      }

      const replaceExisting = req.body?.replaceExisting === 'true' || req.body?.replaceExisting === true;

      const file = req.files.file;
      let content: string;
      if (file.tempFilePath) {
        content = fs.readFileSync(file.tempFilePath, 'utf8');
      } else {
        content = file.data.toString('utf8');
      }

      const { pool } = await import("./db");
      const results: Record<string, { imported: number; skipped: number; errors: number }> = {};

      // Neon doesn't support session_replication_role

      const extractStatements = (sql: string): string[] => {
        const stmts: string[] = [];
        let buf = "";
        let inStr = false;
        let escaped = false;
        let inBlock = false;

        const lines = sql.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('--')) continue;

          if (inBlock) {
            if (trimmed.endsWith(');') || trimmed === ');') inBlock = false;
            continue;
          }

          if (!buf) {
            if (trimmed.startsWith('SET ')) continue;
            if (/^(CREATE|ALTER|DROP|GRANT|REVOKE|COMMENT)\s/i.test(trimmed)) {
              if (!trimmed.endsWith(';')) inBlock = true;
              continue;
            }
            if (!/^INSERT\s/i.test(trimmed)) continue;
          }

          buf += (buf ? '\n' : '') + trimmed;

          for (let i = 0; i < trimmed.length; i++) {
            const ch = trimmed[i];
            if (escaped) { escaped = false; continue; }
            if (ch === '\\' && inStr) { escaped = true; continue; }
            if (ch === "'") {
              if (inStr && i + 1 < trimmed.length && trimmed[i + 1] === "'") { i++; continue; }
              inStr = !inStr;
              continue;
            }
            if (!inStr && ch === ';') {
              stmts.push(buf.trim());
              buf = "";
              inStr = false;
              break;
            }
          }
        }
        if (buf.trim()) stmts.push(buf.trim());
        return stmts;
      };

      const statements = extractStatements(content);

      if (replaceExisting) {
        const tablesInFile = new Set<string>();
        for (const stmt of statements) {
          const m = stmt.match(/^INSERT\s+INTO\s+(?:public\.)?"?(\w+)"?/i);
          if (m) tablesInFile.add(m[1]);
        }
        const tablesToTruncate = Array.from(tablesInFile)
          .filter(t => t !== 'sessions')
          .map(t => `"${t}"`)
          .join(', ');
        if (tablesToTruncate) {
          try {
            await pool.query(`TRUNCATE TABLE ${tablesToTruncate} CASCADE`);
            console.log(`[SQL Import] Truncated: ${tablesToTruncate}`);
          } catch (truncErr: any) {
            console.error("[SQL Import] Truncate warning:", truncErr.message?.slice(0, 200));
          }
        }
      }

      for (const stmt of statements) {
        const tableMatch = stmt.match(/^INSERT\s+INTO\s+(?:public\.)?"?(\w+)"?/i);
        if (!tableMatch) continue;
        const tableName = tableMatch[1];
        if (tableName === 'sessions') continue;

        if (!results[tableName]) results[tableName] = { imported: 0, skipped: 0, errors: 0 };

        let execStmt = stmt.replace(/;\s*$/, '');
        if (!replaceExisting && !/ON\s+CONFLICT/i.test(execStmt)) {
          execStmt += ' ON CONFLICT DO NOTHING';
        }

        try {
          const result = await pool.query(execStmt);
          if (result.rowCount && result.rowCount > 0) {
            results[tableName].imported += result.rowCount;
          } else {
            results[tableName].skipped++;
          }
        } catch (err: any) {
          results[tableName].errors++;
          if (results[tableName].errors <= 3) {
            console.error(`[SQL Import] Error on ${tableName}:`, err.message?.slice(0, 200));
          }
        }
      }

      // Neon doesn't support session_replication_role

      await logAuditEvent({
        req,
        entityType: "service" as EntityType,
        entityId: "sql-import",
        action: "created" as ActionType,
        summary: `Import SQL: ${JSON.stringify(results)}`
      });

      const summary = Object.entries(results).map(([t, r]) => `${t}: ${r.imported} importés`).join(', ');
      console.log(`[SQL Import] Terminé: ${summary}`);

      res.json({
        success: true,
        message: "Import SQL terminé",
        results
      });

    } catch (error: any) {
      console.error("SQL import error:", error);
      res.status(500).json({ message: "Erreur lors de l'import SQL", error: error.message });
    }
  });

  app.post("/api/admin/import-media", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      if (!req.files || !req.files.file) {
        return res.status(400).json({ message: "Aucun fichier fourni" });
      }
      
      const file = req.files.file;
      const tmpDir = path.join("/tmp", `media-import-${Date.now()}`);
      fs.mkdirSync(tmpDir, { recursive: true });
      
      const archivePath = path.join(tmpDir, file.name);
      if (file.tempFilePath) {
        fs.copyFileSync(file.tempFilePath, archivePath);
      } else {
        await file.mv(archivePath);
      }
      
      if (file.name.endsWith('.tar.gz') || file.name.endsWith('.tgz')) {
        execSync(`tar -xzf "${archivePath}" -C "${tmpDir}"`);
      } else if (file.name.endsWith('.zip')) {
        execSync(`unzip -o "${archivePath}" -d "${tmpDir}"`);
      }
      
      let sourceDir = tmpDir;
      const entries = fs.readdirSync(tmpDir);
      for (const entry of entries) {
        const entryPath = path.join(tmpDir, entry);
        if (fs.statSync(entryPath).isDirectory() && entry.startsWith('media_backup_')) {
          sourceDir = entryPath;
          break;
        }
      }
      
      const uploadsDir = path.join(process.cwd(), "uploads");
      fs.mkdirSync(uploadsDir, { recursive: true });
      
      let copiedCount = 0;
      let skippedCount = 0;
      const copiedFiles: string[] = [];
      const sourceFiles = fs.readdirSync(sourceDir);
      
      for (const fileName of sourceFiles) {
        if (fileName === 'media_mapping.json' || fileName === 'restore-media.sh' || fileName === 'media_tables.sql') {
          continue;
        }
        if (fileName.endsWith('.tar.gz') || fileName.endsWith('.tgz') || fileName.endsWith('.zip')) {
          continue;
        }
        
        if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
          continue;
        }
        
        const srcPath = path.join(sourceDir, fileName);
        if (!fs.statSync(srcPath).isFile()) continue;
        
        const destPath = path.join(uploadsDir, path.basename(fileName));
        if (fs.existsSync(destPath)) {
          skippedCount++;
          continue;
        }
        
        fs.copyFileSync(srcPath, destPath);
        copiedCount++;
        copiedFiles.push(fileName);
      }
      
      let mapping = null;
      const mappingPath = path.join(sourceDir, "media_mapping.json");
      if (fs.existsSync(mappingPath)) {
        try {
          mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
        } catch (e) {}
      }
      
      fs.rmSync(tmpDir, { recursive: true, force: true });
      
      await logAuditEvent({
        req,
        entityType: "service" as EntityType,
        entityId: "import-media",
        action: "created" as ActionType,
        summary: `Import média: ${copiedCount} fichiers importés, ${skippedCount} ignorés`
      });
      
      res.json({
        success: true,
        message: `Import média terminé`,
        copiedCount,
        skippedCount,
        totalInArchive: sourceFiles.length,
        hasMappingFile: !!mapping,
        mappingEntries: Array.isArray(mapping) ? mapping.length : 0
      });
      
    } catch (error: any) {
      console.error("Media import error:", error);
      res.status(500).json({ message: "Erreur lors de l'import des médias", error: error.message });
    }
  });

  // WebSocket authentication tokens (short-lived, single-use)
  const wsAuthTokens = new Map<string, { userId: string; expiresAt: number }>();
  
  // Generate a WebSocket auth token for the current user
  app.post("/api/ws/auth-token", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 30000; // 30 seconds validity
      
      wsAuthTokens.set(token, { userId, expiresAt });
      
      // Cleanup expired tokens
      Array.from(wsAuthTokens.entries()).forEach(([t, data]) => {
        if (data.expiresAt < Date.now()) {
          wsAuthTokens.delete(t);
        }
      });
      
      res.json({ token });
    } catch (error: any) {
      console.error("Error generating WS auth token:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Temporary endpoint for importing quote media from local files using GCS
  app.post("/api/admin/import-quote-media", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const { randomUUID } = await import("crypto");
      const { Storage } = await import("@google-cloud/storage");
      
      const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
      const gcsClient = new Storage({
        credentials: {
          audience: "replit",
          subject_token_type: "access_token",
          token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
          type: "external_account",
          credential_source: {
            url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
            format: { type: "json", subject_token_field_name: "access_token" },
          },
          universe_domain: "googleapis.com",
        },
        projectId: "",
      });
      
      const privateObjectDir = process.env.PRIVATE_OBJECT_DIR || "";
      if (!privateObjectDir) {
        return res.status(500).json({ error: "PRIVATE_OBJECT_DIR not set" });
      }
      
      const pathParts = privateObjectDir.split("/").filter(p => p);
      const bucketName = pathParts[0];
      const basePath = pathParts.slice(1).join("/");
      
      const mediaMappings = [
        {
          quoteRef: "0395C819",
          files: [
            { path: "/tmp/upDb/Devis-0395C819.pdf", type: "pdf" },
            { path: "/tmp/upDb/IMG_0103.jpeg", type: "image" },
            { path: "/tmp/upDb/IMG_0106.jpeg", type: "image" },
          ],
        },
        {
          quoteRef: "DEV-01-00068",
          files: [
            { path: "/tmp/upDb/Devis-DEV-01-00068.pdf", type: "pdf" },
            { path: "/tmp/upDb/IMG_0144.jpeg", type: "image" },
            { path: "/tmp/upDb/IMG_0143.jpeg", type: "image" },
          ],
        },
        {
          quoteRef: "3AFD6186",
          files: [{ path: "/tmp/upDb/Devis-3AFD6186.pdf", type: "pdf" }],
        },
        {
          quoteRef: "6DD863A5",
          files: [
            { path: "/tmp/upDb/Devis-6DD863A5.pdf", type: "pdf" },
            { path: "/tmp/upDb/0181C530-4C5A-4DA5-BB9B-9E83992402DC.jpeg", type: "image" },
          ],
        },
        {
          quoteRef: "C43335ED",
          files: [{ path: "/tmp/upDb/Devis-C43335ED.pdf", type: "pdf" }],
        },
        {
          quoteRef: "DEV-01-00076",
          files: [{ path: "/tmp/upDb/IMG_0219.png", type: "image" }],
        },
      ];
      
      const results: any[] = [];
      const bucket = gcsClient.bucket(bucketName);
      
      for (const mapping of mediaMappings) {
        const quote = await storage.getQuoteByReference(mapping.quoteRef);
        if (!quote) {
          results.push({ quoteRef: mapping.quoteRef, error: "Quote not found" });
          continue;
        }
        
        for (const file of mapping.files) {
          if (!fs.existsSync(file.path)) {
            results.push({ quoteRef: mapping.quoteRef, file: file.path, error: "File not found" });
            continue;
          }
          
          const fileName = path.basename(file.path);
          const buffer = fs.readFileSync(file.path);
          const stats = fs.statSync(file.path);
          
          const ext = path.extname(file.path).toLowerCase();
          let contentType = "application/octet-stream";
          if (ext === ".pdf") contentType = "application/pdf";
          else if (ext === ".jpeg" || ext === ".jpg") contentType = "image/jpeg";
          else if (ext === ".png") contentType = "image/png";
          
          try {
            const objectId = randomUUID();
            const objectName = `${basePath}/uploads/${objectId}`;
            
            const gcsFile = bucket.file(objectName);
            await gcsFile.save(buffer, {
              contentType,
              resumable: false,
            });
            
            const objectPath = `/objects/uploads/${objectId}`;
            
            await storage.createQuoteMedia({
              quoteId: quote.id,
              fileType: "image",
              filePath: objectPath,
              fileName: fileName,
              fileSize: stats.size,
            });
            
            results.push({ quoteRef: mapping.quoteRef, file: fileName, success: true, path: objectPath });
          } catch (error: any) {
            results.push({ quoteRef: mapping.quoteRef, file: fileName, error: error.message });
          }
        }
      }
      
      res.json({ message: "Import completed", results });
    } catch (error: any) {
      console.error("Error importing quote media:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================
  // BACKUP MANAGEMENT API
  // =====================
  
  // DB Sync helper: dump source, restore to target
  async function syncDatabases(sourceUrl: string, targetUrl: string, direction: string): Promise<{ backup: string; tables: number; rows: number }> {
    const backupFileName = `backup-before-sync-${direction}-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.sql`;
    const backupsDir = path.join(process.cwd(), "backups");
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
    const backupPath = path.join(backupsDir, backupFileName);

    execSync(`pg_dump "${targetUrl}" --no-owner --no-privileges --data-only > "${backupPath}"`, { timeout: 60000 });
    console.log(`[DBSync ${direction}] Backup created: ${backupFileName}`);

    const dumpOutput = execSync(`pg_dump "${sourceUrl}" --no-owner --no-privileges --data-only --inserts`, {
      timeout: 120000,
      maxBuffer: 100 * 1024 * 1024,
    }).toString();

    const { Pool } = await import("@neondatabase/serverless");
    const targetPool = new Pool({ connectionString: targetUrl });

    try {
      // Note: session_replication_role not supported on Neon

      const tableNames = new Set<string>();
      const insertRegex = /^INSERT INTO (?:public\.)?"?(\w+)"?/gm;
      let m;
      while ((m = insertRegex.exec(dumpOutput)) !== null) {
        tableNames.add(m[1]);
      }

      const tablesToTruncate = Array.from(tableNames)
        .filter(t => t !== 'sessions' && t !== 'session')
        .map(t => `"${t}"`)
        .join(', ');
      if (tablesToTruncate) {
        await targetPool.query(`TRUNCATE TABLE ${tablesToTruncate} CASCADE`);
      }

      let totalRows = 0;
      const statements = dumpOutput.split('\n').filter(line => {
        return line.startsWith('INSERT INTO') && 
               !line.includes('"sessions"') && 
               !line.includes('"session"');
      });
      for (const stmt of statements) {
        try {
          const safeStmt = stmt.replace(/;?\s*$/, ' ON CONFLICT DO NOTHING');
          await targetPool.query(safeStmt);
          totalRows++;
        } catch (err: any) {
          console.error(`[DBSync ${direction}] Insert error:`, err.message?.slice(0, 150));
        }
      }

      console.log(`[DBSync ${direction}] Synced ${totalRows} rows across ${tableNames.size} tables`);
      return { backup: backupFileName, tables: tableNames.size, rows: totalRows };
    } finally {
      await targetPool.end();
    }
  }

  app.post("/api/admin/db/sync-prod", isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
      const prodDbUrl = process.env.PRODUCTION_DATABASE_URL || process.env.PRODUCTION_DB_URL || process.env.DATABASE_URL_PROD;
      const devDbUrl = process.env.DEV_DATABASE_URL || process.env.DEV_DB_URL || process.env.DATABASE_URL || process.env.DEVELOPPEMENT_DB_URL;

      if (!prodDbUrl) {
        return res.status(400).json({ 
          message: "Variable PRODUCTION_DATABASE_URL non configurée. Pour synchroniser, ajoutez l'URL de la base de données de production dans les secrets de l'environnement (onglet Secrets). Vous pouvez trouver cette URL dans les paramètres de déploiement de votre application." 
        });
      }
      if (!devDbUrl) {
        return res.status(500).json({ message: "URL de base de données de développement non trouvée." });
      }

      console.log("[DBSync] Starting Prod → Dev sync...");
      const result = await syncDatabases(prodDbUrl, devDbUrl, "prod-to-dev");

      await logAuditEvent({
        req: req as any,
        entityType: "user" as EntityType,
        entityId: (req.user as User).id,
        action: "updated" as ActionType,
        summary: `Sync Prod→Dev: ${result.rows} lignes, ${result.tables} tables`,
      });

      res.json({
        message: `Synchronisation Prod → Dev réussie ! ${result.rows} lignes synchronisées dans ${result.tables} tables. Sauvegarde de sécurité créée.`,
        backup: result.backup,
        tables: result.tables,
        rows: result.rows,
      });
    } catch (error: any) {
      console.error("[DBSync Prod→Dev] Error:", error);
      res.status(500).json({ message: `Erreur de synchronisation: ${error.message}. Conseil: utilisez l'export JSON puis l'import pour transférer les données manuellement.` });
    }
  });

  app.post("/api/admin/db/sync-dev-to-prod", isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
      const devDbUrl = process.env.DEV_DATABASE_URL || process.env.DEV_DB_URL || process.env.DATABASE_URL || process.env.DEVELOPPEMENT_DB_URL;
      const prodDbUrl = process.env.PRODUCTION_DATABASE_URL || process.env.PRODUCTION_DB_URL || process.env.DATABASE_URL_PROD;

      if (!prodDbUrl) {
        return res.status(400).json({ 
          message: "Variable PRODUCTION_DATABASE_URL non configurée. Pour synchroniser Dev → Prod, vous pouvez : 1) Ajouter l'URL de la base de données de production dans les secrets, ou 2) Utiliser l'option 'Copier la base de développement' lors de la publication." 
        });
      }
      if (!devDbUrl) {
        return res.status(500).json({ message: "URL de base de données de développement non trouvée." });
      }

      console.log("[DBSync] Starting Dev → Prod sync...");
      const result = await syncDatabases(devDbUrl, prodDbUrl, "dev-to-prod");

      await logAuditEvent({
        req: req as any,
        entityType: "user" as EntityType,
        entityId: (req.user as User).id,
        action: "updated" as ActionType,
        summary: `Sync Dev→Prod: ${result.rows} lignes, ${result.tables} tables`,
      });

      res.json({
        message: `Synchronisation Dev → Prod réussie ! ${result.rows} lignes synchronisées dans ${result.tables} tables. Sauvegarde de sécurité créée.`,
        backup: result.backup,
        tables: result.tables,
        rows: result.rows,
      });
    } catch (error: any) {
      console.error("[DBSync Dev→Prod] Error:", error);
      res.status(500).json({ message: `Erreur de synchronisation: ${error.message}. Conseil: utilisez l'option 'Copier la base de développement' lors de la publication.` });
    }
  });

  app.get("/api/admin/backups/stats", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const uploadsDir = path.join(process.cwd(), "uploads");
      let totalFiles = 0;
      let totalSize = 0;
      
      if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        totalFiles = files.length;
        for (const file of files) {
          const stats = fs.statSync(path.join(uploadsDir, file));
          totalSize += stats.size;
        }
      }
      
      // Get media counts from database
      const quoteMediaCount = await db.select({ count: count() }).from(quoteMedia);
      const invoiceMediaCount = await db.select({ count: count() }).from(invoiceMedia);
      
      res.json({
        filesOnDisk: totalFiles,
        totalSize,
        totalSizeFormatted: formatFileSize(totalSize),
        quoteMediaCount: Number(quoteMediaCount[0]?.count || 0),
        invoiceMediaCount: Number(invoiceMediaCount[0]?.count || 0)
      });
    } catch (error: any) {
      console.error("Error getting backup stats:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get list of backups
  app.get("/api/admin/backups", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const backupsDir = path.join(process.cwd(), "backups");
      
      if (!fs.existsSync(backupsDir)) {
        return res.json({ backups: [] });
      }
      
      const files = fs.readdirSync(backupsDir);
      const backups = files
        .filter(f => f.startsWith("media_backup_") || f.startsWith("backup-"))
        .map(f => {
          const filePath = path.join(backupsDir, f);
          const stats = fs.statSync(filePath);
          const isArchive = f.endsWith(".tar.gz") || f.endsWith(".sql") || f.endsWith(".zip");
          
          // Extract date from filename if possible
          const dateMatch = f.match(/(\d{4}-\d{2}-\d{2})/);
          const date = dateMatch ? dateMatch[0] : null;

          return {
            name: f,
            isArchive,
            isDirectory: stats.isDirectory(),
            size: stats.size,
            sizeFormatted: formatFileSize(stats.size),
            createdAt: stats.mtime.toISOString(),
            date
          };
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      res.json({ backups });
    } catch (error: any) {
      console.error("Error listing backups:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Helper function to format file size
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'Ko', 'Mo', 'Go'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  // Create new backup
  app.post("/api/admin/backups", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const dateStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const backupDir = path.join(process.cwd(), "backups", `media_backup_${dateStr}`);
      const uploadsDir = path.join(process.cwd(), "uploads");
      
      // Create backups directory
      fs.mkdirSync(path.join(process.cwd(), "backups"), { recursive: true });
      fs.mkdirSync(backupDir, { recursive: true });
      
      // Copy uploads folder
      if (fs.existsSync(uploadsDir)) {
        const uploadFiles = fs.readdirSync(uploadsDir);
        for (const file of uploadFiles) {
          fs.copyFileSync(path.join(uploadsDir, file), path.join(backupDir, file));
        }
      }
      
      // Export media mapping as JSON using direct SQL
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
      
      const allMedia = [
        ...quoteMediaResults.map(m => ({ entityType: 'quote', ...m })),
        ...invoiceMediaResults.map(m => ({ entityType: 'invoice', ...m }))
      ];
      fs.writeFileSync(path.join(backupDir, "media_mapping.json"), JSON.stringify(allMedia, null, 2));
      
      // Create restore script
      const restoreScript = `#!/bin/bash
# Script de restauration des médias pour MyJantes
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
echo "=== Restauration des médias MyJantes ==="
mkdir -p uploads
for file in "$SCRIPT_DIR"/*; do
  filename=$(basename "$file")
  if [[ "$filename" != "restore-media.sh" && "$filename" != "media_mapping.json" && "$filename" != "media_tables.sql" ]]; then
    cp "$file" uploads/
  fi
done
echo "Fichiers restaurés dans uploads/"
echo "=== Restauration terminée ==="`;
      fs.writeFileSync(path.join(backupDir, "restore-media.sh"), restoreScript);
      fs.chmodSync(path.join(backupDir, "restore-media.sh"), "755");
      
      // Create tar.gz archive
      const archiveName = `media_backup_${dateStr.slice(0, 10)}.tar.gz`;
      const archivePath = path.join(process.cwd(), "backups", archiveName);
      execSync(`cd "${path.join(process.cwd(), "backups")}" && tar -czf "${archiveName}" "media_backup_${dateStr}"`);
      
      // Get stats
      const files = fs.readdirSync(backupDir);
      const archiveStats = fs.statSync(archivePath);
      
      // Log audit
      await logAuditEvent({
        req,
        entityType: "service" as EntityType,
        entityId: "backup",
        action: "created" as ActionType,
        summary: `Sauvegarde créée: ${archiveName} (${files.length} fichiers, ${formatFileSize(archiveStats.size)})`
      });
      
      res.json({
        success: true,
        backup: {
          name: archiveName,
          fileCount: files.length,
          size: archiveStats.size,
          sizeFormatted: formatFileSize(archiveStats.size),
          createdAt: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error("Error creating backup:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Download backup
  app.get("/api/admin/backups/:name/download", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { name } = req.params;
      const backupsDir = path.join(process.cwd(), "backups");
      const backupPath = path.join(backupsDir, name);

      console.log(`[BackupDownload] Request for: ${name}, path: ${backupPath}`);

      if (!fs.existsSync(backupPath)) {
        console.error(`[BackupDownload] File not found: ${backupPath}`);
        return res.status(404).json({ error: "Sauvegarde non trouvée" });
      }

      const stats = fs.statSync(backupPath);
      
      // Support for directory downloads (as zip) if not already archived
      if (stats.isDirectory()) {
        const archiver = (await import("archiver")).default;
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${name}.zip"`);
        const archive = archiver("zip", { zlib: { level: 5 } });
        
        archive.on('error', (err) => {
          console.error(`[BackupDownload] Archive error:`, err);
          if (!res.headersSent) res.status(500).send({ error: err.message });
        });

        archive.pipe(res);
        archive.directory(backupPath, false);
        await archive.finalize();
        return;
      }

      const contentType = name.endsWith(".tar.gz") ? "application/gzip" : 
                          name.endsWith(".sql") ? "application/sql" : 
                          name.endsWith(".zip") ? "application/zip" : "application/octet-stream";

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
      res.setHeader("Content-Length", stats.size);

      const stream = fs.createReadStream(backupPath);
      stream.on('error', (err) => {
        console.error(`[BackupDownload] Stream error:`, err);
        if (!res.headersSent) res.status(500).send({ error: err.message });
      });
      stream.pipe(res);
    } catch (error: any) {
      console.error("Error downloading backup:", error);
      if (!res.headersSent) res.status(500).json({ error: error.message });
    }
  });
  
  // Delete backup
  app.delete("/api/admin/backups/:name", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      const { name } = req.params;
      const backupsDir = path.join(process.cwd(), "backups");
      
      // Delete archive
      const archivePath = path.join(backupsDir, name);
      if (fs.existsSync(archivePath)) {
        fs.unlinkSync(archivePath);
      }
      
      // Delete folder if exists
      const folderName = name.replace(".tar.gz", "");
      const folderPath = path.join(backupsDir, folderName);
      if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
        fs.rmSync(folderPath, { recursive: true });
      }
      
      // Log audit
      await logAuditEvent({
        req,
        entityType: "service" as EntityType,
        entityId: "backup",
        action: "deleted" as ActionType,
        summary: `Sauvegarde supprimée: ${name}`
      });
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting backup:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================
  // PUBLIC QUOTE REQUEST — reçoit les demandes de s.myjantes.fr
  // ============================================================

  app.options("/api/public/:path(*)", (req, res) => {
    const origin = req.headers.origin || "";
    if (origin.includes("myjantes") || origin.includes("localhost")) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");
    res.status(204).end();
  });

  app.post("/api/public/quote-request", async (req, res) => {
    // Extra CORS header (main CORS middleware already handles it, but belt-and-suspenders)
    const origin = req.headers.origin || "";
    if (origin.includes("myjantes") || origin.includes("localhost")) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    try {
      const {
        firstName = "",
        lastName = "",
        email = "",
        phone = "",
        serviceName = "Réparation jantes",
        vehicleMake = "",
        vehicleModel = "",
        vehicleRegistration = "",
        notes = "",
        requestDetails = null,
        source = "website",
      } = req.body || {};

      if (!firstName || !lastName || !email) {
        return res.status(400).json({ message: "Prénom, nom et email sont requis." });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "Email invalide." });
      }

      // Trouver ou créer l'utilisateur par email
      let user = await storage.getUserByEmail(email.toLowerCase().trim());
      if (!user) {
        user = await storage.upsertUser({
          id: crypto.randomUUID(),
          email: email.toLowerCase().trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone || null,
          role: "client",
        } as any);
      }

      // Trouver le service correspondant ou utiliser le premier disponible
      const allServices = await storage.getServices();
      const service =
        allServices.find(s =>
          s.name.toLowerCase().includes(serviceName.toLowerCase()) ||
          serviceName.toLowerCase().includes(s.name.toLowerCase())
        ) || allServices[0];
      if (!service) {
        return res.status(503).json({ message: "Aucun service disponible pour le moment." });
      }

      // Générer la référence
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const allQuotes = await storage.getQuotes();
      const count =
        allQuotes.filter(q => {
          if (!q.createdAt) return false;
          const d = new Date(q.createdAt as any);
          return !isNaN(d.getTime()) && d >= startOfMonth;
        }).length + 1;
      const reference = `DEV-${mm}-${String(count).padStart(5, "0")}`;

      // Créer le devis
      const quote = await storage.createQuote({
        reference,
        clientId: user.id,
        serviceId: service.id,
        status: "pending" as const,
        vehicleMake: vehicleMake || null,
        vehicleModel: vehicleModel || null,
        vehicleRegistration: vehicleRegistration || null,
        notes: `[Demande web — s.myjantes.fr]\n${notes || ""}`.trim(),
        requestDetails: requestDetails || { source, serviceName, phone },
      } as any);

      // Notification email admin (fire-and-forget)
      (async () => {
        try {
          const { sendEmail } = await import("./emailService");
          const ROOT_EMAIL = "rbelmahi90@gmail.com";
          const dateStr = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
          await sendEmail({
            to: ROOT_EMAIL,
            subject: `📋 Nouvelle demande devis web — ${reference}`,
            html: `
<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;background:#f5f5f5;margin:0;padding:20px;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.12);">
  <div style="background:#dc2626;padding:24px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:22px;">📋 Nouvelle demande devis web</h1>
    <p style="color:#fca5a5;margin:8px 0 0;">${dateStr}</p>
  </div>
  <div style="padding:24px;">
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr><td style="padding:6px 12px;color:#666;">Référence</td><td style="padding:6px 12px;font-weight:600;">${reference}</td></tr>
      <tr style="background:#f9fafb;"><td style="padding:6px 12px;color:#666;">Client</td><td style="padding:6px 12px;">${firstName} ${lastName}</td></tr>
      <tr><td style="padding:6px 12px;color:#666;">Email</td><td style="padding:6px 12px;"><a href="mailto:${email}" style="color:#dc2626;">${email}</a></td></tr>
      <tr style="background:#f9fafb;"><td style="padding:6px 12px;color:#666;">Téléphone</td><td style="padding:6px 12px;">${phone || "—"}</td></tr>
      <tr><td style="padding:6px 12px;color:#666;">Service</td><td style="padding:6px 12px;">${serviceName}</td></tr>
      <tr style="background:#f9fafb;"><td style="padding:6px 12px;color:#666;">Véhicule</td><td style="padding:6px 12px;">${[vehicleMake, vehicleModel, vehicleRegistration].filter(Boolean).join(" · ") || "—"}</td></tr>
      <tr><td style="padding:6px 12px;color:#666;">Notes</td><td style="padding:6px 12px;">${notes || "—"}</td></tr>
      <tr style="background:#f9fafb;"><td style="padding:6px 12px;color:#666;">Source</td><td style="padding:6px 12px;">s.myjantes.fr</td></tr>
    </table>
    <div style="margin-top:20px;text-align:center;">
      <a href="https://apps.myjantes.fr/admin/quotes" style="background:#dc2626;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Voir dans l'admin →</a>
    </div>
    <div style="margin-top:16px;padding:12px;background:#fef2f2;border-radius:8px;border-left:4px solid #dc2626;">
      <p style="margin:0;color:#7f1d1d;font-size:13px;">ID: <code>${quote.id}</code></p>
    </div>
  </div>
  <div style="background:#f9fafb;padding:16px;text-align:center;font-size:12px;color:#9ca3af;">
    MyJantes · Notification automatique · <a href="https://apps.myjantes.fr/admin" style="color:#dc2626;">Admin</a>
  </div>
</div>
</body></html>`,
          });
        } catch (e: any) {
          console.warn("[PublicQuote] Email admin échec:", e.message);
        }
      })();

      // Broadcast WS à tous les clients connectés (les admins reçoivent la notif)
      broadcastToUser("*", {
        type: "quote_created",
        quoteId: quote.id,
        reference,
        source: "website",
        message: `Nouvelle demande de devis depuis s.myjantes.fr — ${firstName} ${lastName}`,
        timestamp: new Date().toISOString(),
      });

      // Email de confirmation au client
      (async () => {
        try {
          const { sendEmail } = await import("./emailService");
          await sendEmail({
            to: email,
            subject: `✅ Votre demande de devis a été reçue — ${reference}`,
            html: `
<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;background:#f5f5f5;margin:0;padding:20px;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.12);">
  <div style="background:#dc2626;padding:24px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:22px;">✅ Demande reçue !</h1>
    <p style="color:#fca5a5;margin:8px 0 0;">Référence : <strong>${reference}</strong></p>
  </div>
  <div style="padding:24px;">
    <p style="font-size:16px;">Bonjour <strong>${firstName}</strong>,</p>
    <p>Nous avons bien reçu votre demande de devis pour <strong>${serviceName}</strong>.</p>
    <p>Notre équipe va étudier votre demande et vous recontactera très prochainement.</p>
    <div style="margin:24px 0;padding:16px;background:#fef2f2;border-radius:8px;border-left:4px solid #dc2626;">
      <p style="margin:0;font-size:15px;color:#7f1d1d;">Votre référence : <strong>${reference}</strong></p>
    </div>
    <p>À bientôt chez MY JANTES !</p>
    <p style="color:#9ca3af;font-size:13px;margin-top:24px;">MY JANTES — Spécialiste jantes et entretien automobile<br>
    <a href="https://myjantes.fr" style="color:#dc2626;">myjantes.fr</a></p>
  </div>
</div>
</body></html>`,
          });
        } catch (e: any) {
          console.warn("[PublicQuote] Email client échec:", e.message);
        }
      })();

      res.json({ success: true, reference, quoteId: quote.id });
    } catch (error: any) {
      console.error("[PublicQuote] Error:", error);
      res.status(500).json({ message: "Erreur serveur lors de la création de la demande." });
    }
  });

  // Widget JavaScript pour s.myjantes.fr
  app.get("/api/public/quote-widget.js", (req, res) => {
    const origin = req.headers.origin || "";
    if (origin.includes("myjantes") || origin.includes("localhost")) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(`/* MyJantes Quote Widget v1.0 */
(function() {
  var API_URL = 'https://apps.myjantes.fr/api/public/quote-request';
  window.MyJantesQuote = {
    submit: function(formData, onSuccess, onError) {
      fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
      .then(function(r) {
        if (r.ok) { onSuccess && onSuccess(r.data); }
        else { onError && onError(r.data.message || 'Erreur lors de l\\'envoi'); }
      })
      .catch(function(e) { onError && onError(e.message); });
    }
  };
})();`);
  });

  const httpServer = createServer(app);

  // WebSocket server setup (Reference: javascript_websocket blueprint)
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req: any) => {
    console.log('WebSocket client connected');
    let authenticatedUserId: string | null = null;

    // Optional JWT auth via query string (?token=...) for mobile clients
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const jwtToken = url.searchParams.get('token');
      if (jwtToken) {
        const payload = verifyToken(jwtToken);
        if (payload?.userId) {
          authenticatedUserId = payload.userId;
          wsClients.set(payload.userId, ws);
          console.log(`User ${payload.userId} authenticated via WebSocket (JWT)`);
          ws.send(JSON.stringify({ type: 'authenticated', success: true }));
        }
      }
    } catch (err) {
      console.error('WebSocket JWT parse error:', err);
    }

    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message.toString());
        
        // Secure authentication with server-issued token (legacy web flow)
        if (data.type === 'authenticate' && data.token) {
          // Try JWT first (mobile)
          const jwtPayload = verifyToken(data.token);
          if (jwtPayload?.userId) {
            authenticatedUserId = jwtPayload.userId;
            wsClients.set(jwtPayload.userId, ws);
            console.log(`User ${jwtPayload.userId} authenticated via WebSocket (JWT message)`);
            ws.send(JSON.stringify({ type: 'authenticated', success: true }));
            return;
          }
          const tokenData = wsAuthTokens.get(data.token);
          
          if (tokenData && tokenData.expiresAt > Date.now()) {
            authenticatedUserId = tokenData.userId;
            wsClients.set(tokenData.userId, ws);
            wsAuthTokens.delete(data.token); // Single-use token
            console.log(`User ${tokenData.userId} authenticated via WebSocket`);
            ws.send(JSON.stringify({ type: 'authenticated', success: true }));
          } else {
            console.log('WebSocket authentication failed: invalid or expired token');
            ws.send(JSON.stringify({ type: 'authenticated', success: false, error: 'Invalid token' }));
          }
        } else if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      // Remove client from map
      for (const [userId, client] of Array.from(wsClients.entries())) {
        if (client === ws) {
          wsClients.delete(userId);
          console.log(`User ${userId} disconnected`);
          break;
        }
      }
    });
  });

  // =====================
  // ADMIN REVIEWS ROUTES
  // =====================
  app.get("/api/admin/reviews", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageScope = getGarageScope(req.user);
      let query = db.select().from(reviews);
      if (garageScope) {
        query = query.where(eq(reviews.garageId, garageScope)) as any;
      }
      const allReviews = await (query as any).orderBy(desc(reviews.createdAt));
      res.json(allReviews);
    } catch (error: any) {
      console.error("Error fetching reviews:", error);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  app.patch("/api/admin/reviews/:id/approve", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const [review] = await db.select().from(reviews).where(eq(reviews.id, id));
      
      if (!review) {
        return res.status(404).json({ message: "Avis non trouvé" });
      }

      const garageScope = getGarageScope(req.user);
      if (garageScope && review.garageId !== garageScope) {
        return res.status(403).json({ message: "Non autorisé" });
      }

      const [updatedReview] = await db.update(reviews)
        .set({ isApproved: true })
        .where(eq(reviews.id, id))
        .returning();

      // If approved and rating is high, we could potentially send a follow-up email
      if (updatedReview.rating >= 4 && updatedReview.clientId) {
        try {
          const user = await storage.getUser(updatedReview.clientId);
          if (user && user.email) {
            await sendEmail({
              to: user.email,
              subject: "Partagez votre expérience sur Google - MY JANTES",
              html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #dc2626;">Merci pour votre confiance !</h2>
                  <p>Bonjour ${user.firstName || 'cher client'},</p>
                  <p>Nous avons bien reçu votre avis positif concernant votre récente prestation chez MY JANTES. Nous sommes ravis que vous soyez satisfait !</p>
                  <p>Pourriez-vous prendre quelques secondes pour partager également votre expérience sur Google ? Cela nous aide énormément à faire connaître notre travail.</p>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="https://share.google/O0VCgqh0z1Ab4qUF9" style="background-color: #dc2626; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                      Laisser un avis sur Google
                    </a>
                  </div>
                  <p>À très bientôt dans notre atelier !</p>
                  <p>L'équipe MY JANTES</p>
                </div>
              `
            });

            sendEventSms({
              userPhone: user.phone,
              userSmsConsent: user.smsConsent,
              userName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
              userEmail: user.email,
              eventType: 'review_request',
              eventTitle: 'Merci pour votre confiance !',
              eventDetails: 'Partagez votre expérience sur Google pour nous aider.',
              eventUrl: 'https://share.google/O0VCgqh0z1Ab4qUF9',
            });
          }
        } catch (emailErr) {
          console.error("Error sending Google review request email:", emailErr);
        }
      }

      res.json(updatedReview);
    } catch (error) {
      console.error("Error approving review:", error);
      res.status(500).json({ message: "Erreur lors de l'approbation de l'avis" });
    }
  });

  app.delete("/api/admin/reviews/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const [review] = await db.select().from(reviews).where(eq(reviews.id, id));
      if (!review) {
        return res.status(404).json({ message: "Avis non trouvé" });
      }
      if (!hasGarageAccess(req.user, review.garageId)) {
        return res.status(403).json({ message: "Accès refusé" });
      }
      await db.delete(reviews).where(eq(reviews.id, id));
      res.json({ message: "Avis supprimé" });
    } catch (error: any) {
      console.error("Error deleting review:", error);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  // =====================
  // DOCUMENT VIEW TRACKING (authenticated clients)
  // =====================

  // Track when a client views their quote
  app.post("/api/quotes/:id/track-view", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const quote = await storage.getQuote(id);
      if (!quote) return res.status(404).json({ message: "Devis non trouvé" });
      if (quote.clientId !== req.user.id && req.user.role !== "admin" && req.user.role !== "superadmin" && req.user.role !== "root") {
        return res.status(403).json({ message: "Accès refusé" });
      }
      // Only set viewedAt if client is viewing (not admin)
      if (req.user.role === "client" && !quote.viewedAt) {
        await storage.updateQuote(id, { viewedAt: new Date() } as any);
        console.log(`[Tracking] Quote ${id} marked as viewed by client ${req.user.id}`);
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error tracking quote view:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Track when a client views their invoice
  app.post("/api/invoices/:id/track-view", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const invoice = await storage.getInvoice(id);
      if (!invoice) return res.status(404).json({ message: "Facture non trouvée" });
      if (invoice.clientId !== req.user.id && req.user.role !== "admin" && req.user.role !== "superadmin" && req.user.role !== "root") {
        return res.status(403).json({ message: "Accès refusé" });
      }
      // Only set viewedAt if client is viewing (not admin)
      if (req.user.role === "client" && !invoice.viewedAt) {
        await storage.updateInvoice(id, { viewedAt: new Date() });
        console.log(`[Tracking] Invoice ${id} marked as viewed by client ${req.user.id}`);
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error tracking invoice view:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // =====================
  // SUPPORT CONTACT ROUTE
  // =====================

  app.post("/api/support/contact", async (req, res) => {
    try {
      const { name, email, category, subject, message } = req.body;

      if (!email || !category || !subject || !message) {
        return res.status(400).json({ success: false, message: "Tous les champs obligatoires doivent être remplis." });
      }

      const escapeHtml = (str: string) => String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const safeName = escapeHtml(name || "");
      const safeEmail = escapeHtml(email);
      const safeSubject = escapeHtml(subject);
      const safeMessage = escapeHtml(message);

      const categoryLabels: Record<string, string> = {
        question: "Question générale",
        devis: "Devis / Facturation",
        reservation: "Réservation",
        technique: "Problème technique",
        reclamation: "Réclamation",
        autre: "Autre",
      };

      const { sendEmail, getEmailHeader, getEmailFooter } = await import("./emailService");

      const htmlContent = `
        ${getEmailHeader('MY JANTES')}
        <div style="padding: 20px;">
          <h2 style="color: #e53e3e; margin-bottom: 20px;">Nouvelle demande de support</h2>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0; background: #f7fafc; font-weight: bold; width: 140px;">Nom</td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0;">${safeName || "Non renseigné"}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0; background: #f7fafc; font-weight: bold;">Email</td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><a href="mailto:${safeEmail}">${safeEmail}</a></td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0; background: #f7fafc; font-weight: bold;">Catégorie</td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0;">${categoryLabels[category] || escapeHtml(category)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0; background: #f7fafc; font-weight: bold;">Sujet</td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0;">${safeSubject}</td>
            </tr>
          </table>
          <div style="background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #4a5568;">Message :</h3>
            <p style="margin: 0; white-space: pre-wrap; color: #2d3748;">${safeMessage}</p>
          </div>
        </div>
      `;

      await sendEmail(
        "contact@myjantes.com",
        `[Support] ${categoryLabels[category] || category} - ${subject}`,
        htmlContent,
        undefined,
        email,
      );

      res.json({ success: true, message: "Message envoyé avec succès." });
    } catch (error: any) {
      console.error("[Support] Error:", error);
      res.status(500).json({ success: false, message: "Une erreur est survenue." });
    }
  });

  // =====================
  // PUBLIC QUOTE ROUTES (no auth required)
  // =====================

  app.get("/api/public/quotes/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const [quote] = await db.select().from(quotes).where(eq(quotes.viewToken, token));
      if (!quote) {
        return res.status(404).json({ message: "Devis non trouvé" });
      }

      // Track view
      await db.update(quotes).set({ viewedAt: new Date() }).where(eq(quotes.id, quote.id));

      const client = await storage.getUser(quote.clientId);
      const items = await storage.getQuoteItems(quote.id);
      const settings = await storage.getApplicationSettings();
      const garage = quote.garageId ? await storage.getGarage(quote.garageId) : null;
      res.json({
        quote: {
          id: quote.id,
          reference: quote.reference,
          status: quote.status,
          quoteAmount: quote.quoteAmount,
          priceExcludingTax: quote.priceExcludingTax,
          taxRate: quote.taxRate,
          taxAmount: quote.taxAmount,
          productDetails: quote.productDetails,
          notes: quote.notes,
          validUntil: quote.validUntil,
          createdAt: quote.createdAt,
          wheelCount: quote.wheelCount,
          diameter: quote.diameter,
          vehicleRegistration: quote.vehicleRegistration,
          vehicleMake: quote.vehicleMake,
          vehicleModel: quote.vehicleModel,
          vehicleVin: quote.vehicleVin,
          vehicleFuelType: quote.vehicleFuelType,
          vehicleFiscalPower: quote.vehicleFiscalPower,
          vehicleFirstRegDate: quote.vehicleFirstRegDate,
          vehicleColor: quote.vehicleColor,
        },
        client: client ? {
          name: `${client.firstName || ""} ${client.lastName || ""}`.trim() || "Client",
        } : null,
        items: items.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unitPriceExcludingTax: item.unitPriceExcludingTax,
          totalExcludingTax: item.totalExcludingTax,
          totalIncludingTax: item.totalIncludingTax,
          taxRate: item.taxRate,
        })),
        garage: {
          name: settings?.companyName || garage?.name || "MY JANTES",
          logo: settings?.companyLogo || garage?.logo || null,
          primaryColor: garage?.primaryColor || "#dc2626",
          phone: settings?.companyPhone || garage?.phone || null,
          email: settings?.companyEmail || garage?.email || null,
          address: settings?.companyAddress || garage?.address || null,
          city: settings?.companyCity || garage?.city || null,
          postalCode: settings?.companyPostalCode || garage?.postalCode || null,
        },
      });
    } catch (error: any) {
      console.error("Error fetching public quote:", error);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  app.post("/api/public/quotes/:token/accept", async (req, res) => {
    try {
      const { token } = req.params;
      const [quote] = await db.select().from(quotes).where(eq(quotes.viewToken, token));
      if (!quote) {
        return res.status(404).json({ message: "Devis non trouvé" });
      }
      if (quote.status === "accepted") {
        return res.json({ message: "Ce devis a déjà été accepté", status: "accepted" });
      }
      if (quote.status === "rejected" || quote.status === "completed") {
        return res.status(400).json({ message: "Ce devis ne peut plus être modifié" });
      }
      await storage.updateQuote(quote.id, { status: "accepted" });
      
      await storage.createNotification({
        userId: quote.clientId,
        type: "quote",
        title: "Devis accepté par le client",
        message: `Le devis ${quote.reference || quote.id.slice(0, 8)} a été accepté par le client`,
      });
      sendWsNotification(quote.clientId, { type: "quote_updated", quoteId: quote.id, status: "accepted" });

      res.json({ message: "Devis accepté avec succès", status: "accepted" });
    } catch (error: any) {
      console.error("Error accepting public quote:", error);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  app.post("/api/public/quotes/:token/reject", async (req, res) => {
    try {
      const { token } = req.params;
      const [quote] = await db.select().from(quotes).where(eq(quotes.viewToken, token));
      if (!quote) {
        return res.status(404).json({ message: "Devis non trouvé" });
      }
      if (quote.status === "rejected") {
        return res.json({ message: "Ce devis a déjà été refusé", status: "rejected" });
      }
      if (quote.status === "accepted" || quote.status === "completed") {
        return res.status(400).json({ message: "Ce devis ne peut plus être modifié" });
      }
      await storage.updateQuote(quote.id, { status: "rejected" });
      
      res.json({ message: "Devis refusé", status: "rejected" });
    } catch (error: any) {
      console.error("Error rejecting public quote:", error);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  // ==========================================
  // PUBLIC BOOKING ROUTES (Smart Reservation)
  // ==========================================

  app.get("/api/public/quotes/:token/available-slots", async (req, res) => {
    try {
      const { token } = req.params;
      const monthStr = req.query.month as string; // YYYY-MM
      const [quote] = await db.select().from(quotes).where(eq(quotes.viewToken, token));
      if (!quote) return res.status(404).json({ message: "Devis non trouvé" });
      if (quote.status !== "accepted") return res.status(400).json({ message: "Le devis doit être accepté pour réserver" });

      const existingRes = await db.select().from(reservations).where(eq(reservations.quoteId, quote.id));
      if (existingRes.length > 0 && existingRes[0].status !== "cancelled") {
        return res.status(400).json({ message: "Une réservation existe déjà pour ce devis", reservation: existingRes[0] });
      }

      const service = await storage.getService(quote.serviceId);
      const durationMinutes = service?.estimatedDuration || 60;

      let year: number, month: number;
      if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
        [year, month] = monthStr.split('-').map(Number);
      } else {
        const now = new Date();
        year = now.getFullYear();
        month = now.getMonth() + 1;
      }

      const garageId = quote.garageId;
      let allReservations: any[] = [];
      if (garageId) {
        allReservations = await db.select().from(reservations)
          .where(sql`${reservations.garageId} = ${garageId} AND ${reservations.status} != 'cancelled' AND EXTRACT(YEAR FROM ${reservations.scheduledDate}) = ${year} AND EXTRACT(MONTH FROM ${reservations.scheduledDate}) = ${month}`);
      } else {
        allReservations = await db.select().from(reservations)
          .where(sql`${reservations.status} != 'cancelled' AND EXTRACT(YEAR FROM ${reservations.scheduledDate}) = ${year} AND EXTRACT(MONTH FROM ${reservations.scheduledDate}) = ${month}`);
      }

      const { getAvailableSlots, getBusinessHoursInfo, getOccupiedRanges, getMonthHolidays } = await import("./frenchBusinessHours");
      const resData = allReservations.map(r => ({
        scheduledDate: r.scheduledDate,
        estimatedEndDate: r.estimatedEndDate,
        durationMinutes: durationMinutes,
      }));
      const availableDays = getAvailableSlots(year, month, durationMinutes, resData);
      const occupiedRanges = getOccupiedRanges(year, month, resData);
      const holidays = getMonthHolidays(year, month);

      res.json({
        service: { name: service?.name || "Service", duration: durationMinutes },
        businessHours: getBusinessHoursInfo(),
        days: availableDays,
        occupiedRanges,
        holidays,
        month: `${year}-${String(month).padStart(2, '0')}`,
      });
    } catch (error: any) {
      console.error("[Booking] Available slots error:", error.message);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  app.post("/api/public/quotes/:token/book", async (req, res) => {
    try {
      const { token } = req.params;
      const { slotStart, slotEnd, clientNotes } = req.body;
      if (!slotStart || !slotEnd) return res.status(400).json({ message: "Créneau requis" });

      const [quote] = await db.select().from(quotes).where(eq(quotes.viewToken, token));
      if (!quote) return res.status(404).json({ message: "Devis non trouvé" });
      if (quote.status !== "accepted") return res.status(400).json({ message: "Le devis doit être accepté pour réserver" });

      const existingRes = await db.select().from(reservations).where(eq(reservations.quoteId, quote.id));
      if (existingRes.length > 0 && existingRes[0].status !== "cancelled") {
        return res.status(400).json({ message: "Une réservation existe déjà pour ce devis" });
      }

      const slotStartDate = new Date(slotStart);
      const slotEndDate = new Date(slotEnd);

      const { validateSlotWithinBusinessHours } = await import("./frenchBusinessHours");
      const validation = validateSlotWithinBusinessHours(slotStartDate, slotEndDate);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.reason });
      }

      const service = await storage.getService(quote.serviceId);
      const expectedDuration = (service?.estimatedDuration || 60) * 60000;
      const actualDuration = slotEndDate.getTime() - slotStartDate.getTime();
      if (Math.abs(actualDuration - expectedDuration) > 60000) {
        return res.status(400).json({ message: "La durée du créneau ne correspond pas au service" });
      }

      const garageId = quote.garageId;
      const conflicting = await db.select().from(reservations)
        .where(sql`${reservations.status} != 'cancelled' AND ${reservations.scheduledDate} < ${slotEndDate} AND COALESCE(${reservations.estimatedEndDate}, ${reservations.scheduledDate} + interval '60 minutes') > ${slotStartDate} ${garageId ? sql`AND ${reservations.garageId} = ${garageId}` : sql``}`);

      if (conflicting.length > 0) {
        return res.status(409).json({ message: "Ce créneau n'est plus disponible" });
      }

      const mm = String(slotStartDate.getMonth() + 1).padStart(2, '0');
      const jj = String(slotStartDate.getDate()).padStart(2, '0');
      const prefix = `RES-${mm}-${jj}-`;
      const existing = await db.execute(sql`SELECT reference FROM reservations WHERE reference LIKE ${prefix + '%'} ORDER BY reference DESC LIMIT 1`);
      let seq = 1;
      if (existing.rows && existing.rows.length > 0) {
        const lastRef = (existing.rows[0] as any).reference as string;
        seq = parseInt(lastRef.split('-').pop() || '0', 10) + 1;
      }
      const reference = `${prefix}${String(seq).padStart(2, '0')}`;

      const reservation = await storage.createReservation({
        reference,
        garageId: garageId || undefined,
        quoteId: quote.id,
        clientId: quote.clientId,
        serviceId: quote.serviceId,
        scheduledDate: slotStartDate,
        estimatedEndDate: slotEndDate,
        wheelCount: quote.wheelCount,
        diameter: quote.diameter,
        wheelPositions: quote.wheelPositions,
        priceExcludingTax: quote.priceExcludingTax,
        taxRate: quote.taxRate,
        taxAmount: quote.taxAmount,
        productDetails: quote.productDetails,
        status: "pending",
        notes: clientNotes || quote.notes,
      } as any);

      try {
        const serviceWorkflowsList = await storage.getServiceWorkflows(quote.serviceId);
        for (const wf of serviceWorkflowsList) {
          const steps = await storage.getWorkflowSteps(wf.id);
          await storage.initializeReservationWorkflow(reservation.id, steps);
        }
      } catch (e) {
        console.log("[Booking] No workflows for service or error:", e);
      }

      const client = await storage.getUser(quote.clientId);
      const bookingService = await storage.getService(quote.serviceId);
      const garage = garageId ? await storage.getGarage(garageId) : null;
      const clientName = client ? `${client.firstName || ''} ${client.lastName || ''}`.trim() : 'Client';
      const serviceName = bookingService?.name || 'Service';

      const dateFormatted = slotStartDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const timeStart = slotStartDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const timeEnd = slotEndDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

      try {
        const garageName = garage?.name || 'MyJantes';
        const garageEmail = garage?.email || 'contact@myjantes.com';
        const garagePhone = garage?.phone || '';

        const staffUsers = await storage.getUsersByRoles(['admin', 'superadmin']);
        for (const staff of staffUsers) {
          if (staff.email) {
            const adminHtml = `${getEmailHeader(garageName, garage?.primaryColor || '#dc2626', garage?.logo || undefined)}
              <h2 style="color: #333; margin-bottom: 16px;">Nouvelle réservation en ligne</h2>
              <p>Le client <strong>${clientName}</strong> a réservé un créneau depuis le lien de son devis.</p>
              <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr><td style="padding: 8px; border: 1px solid #eee; font-weight: bold;">Devis</td><td style="padding: 8px; border: 1px solid #eee;">${quote.reference || quote.id.slice(0, 8)}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #eee; font-weight: bold;">Service</td><td style="padding: 8px; border: 1px solid #eee;">${serviceName}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #eee; font-weight: bold;">Date</td><td style="padding: 8px; border: 1px solid #eee;">${dateFormatted}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #eee; font-weight: bold;">Horaire</td><td style="padding: 8px; border: 1px solid #eee;">${timeStart} - ${timeEnd}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #eee; font-weight: bold;">Réf. réservation</td><td style="padding: 8px; border: 1px solid #eee;">${reference}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #eee; font-weight: bold;">Client</td><td style="padding: 8px; border: 1px solid #eee;">${clientName} ${client?.email ? `(${client.email})` : ''} ${client?.phone ? `- ${client.phone}` : ''}</td></tr>
              </table>
              <p style="color: #666;">Statut actuel : <strong>En attente de validation</strong></p>
              <p>Connectez-vous au tableau de bord pour valider ou modifier cette réservation.</p>
              ${getEmailFooter(garageName)}`;

            await sendEmail({
              to: staff.email,
              subject: `[${garageName}] Nouvelle réservation : ${clientName} - ${dateFormatted}`,
              html: adminHtml,
            });
          }
        }

        if (client?.email) {
          const clientHtml = `${getEmailHeader(garageName, garage?.primaryColor || '#dc2626', garage?.logo || undefined)}
            <h2 style="color: #333; margin-bottom: 16px;">Confirmation de votre réservation</h2>
            <p>Bonjour ${clientName},</p>
            <p>Votre créneau a bien été enregistré. Notre équipe va confirmer la faisabilité rapidement.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr><td style="padding: 8px; border: 1px solid #eee; font-weight: bold;">Service</td><td style="padding: 8px; border: 1px solid #eee;">${serviceName}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #eee; font-weight: bold;">Date</td><td style="padding: 8px; border: 1px solid #eee;">${dateFormatted}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #eee; font-weight: bold;">Horaire</td><td style="padding: 8px; border: 1px solid #eee;">${timeStart} - ${timeEnd}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #eee; font-weight: bold;">Devis</td><td style="padding: 8px; border: 1px solid #eee;">${quote.reference || '-'}</td></tr>
            </table>
            <p style="color: #666;">Vous recevrez un email de confirmation dès que votre rendez-vous sera validé.</p>
            ${garagePhone ? `<p>Pour toute question : <a href="tel:${garagePhone}">${garagePhone}</a></p>` : ''}
            ${getEmailFooter(garageName)}`;

          await sendEmail({
            to: client.email,
            subject: `[${garageName}] Votre réservation du ${dateFormatted}`,
            html: clientHtml,
          });
        }
      } catch (emailErr: any) {
        console.error("[Booking] Email error:", emailErr.message);
      }

      await storage.createNotification({
        userId: quote.clientId,
        type: "reservation",
        title: "Réservation enregistrée",
        message: `Votre créneau du ${dateFormatted} (${timeStart} - ${timeEnd}) est en attente de confirmation`,
      });

      sendWsNotification(quote.clientId, { type: "reservation_created", reservationId: reservation.id });

      res.json({
        message: "Réservation enregistrée avec succès",
        reservation: {
          id: reservation.id,
          reference,
          scheduledDate: slotStartDate,
          estimatedEndDate: slotEndDate,
          status: "pending",
        },
      });
    } catch (error: any) {
      console.error("[Booking] Error:", error.message);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  app.get("/api/public/quotes/:token/reservation", async (req, res) => {
    try {
      const { token } = req.params;
      const [quote] = await db.select().from(quotes).where(eq(quotes.viewToken, token));
      if (!quote) return res.status(404).json({ message: "Devis non trouvé" });

      const existingRes = await db.select().from(reservations).where(eq(reservations.quoteId, quote.id));
      const activeRes = existingRes.find(r => r.status !== "cancelled");
      if (!activeRes) return res.json({ reservation: null });

      const service = await storage.getService(quote.serviceId);
      res.json({
        reservation: {
          id: activeRes.id,
          reference: activeRes.reference,
          scheduledDate: activeRes.scheduledDate,
          estimatedEndDate: activeRes.estimatedEndDate,
          status: activeRes.status,
          service: service?.name || "Service",
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  // Admin: validate or reject a public booking
  app.post("/api/admin/reservations/:id/validate-booking", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const reservation = await storage.getReservation(id);
      if (!reservation) return res.status(404).json({ message: "Réservation non trouvée" });

      await storage.updateReservation(id, { status: "confirmed" });

      const client = await storage.getUser(reservation.clientId);
      const service = await storage.getService(reservation.serviceId);
      const garage = reservation.garageId ? await storage.getGarage(reservation.garageId) : null;
      const garageName = garage?.name || 'MyJantes';
      const clientName = client ? `${client.firstName || ''} ${client.lastName || ''}`.trim() : 'Client';
      const dateFormatted = new Date(reservation.scheduledDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const timeStart = new Date(reservation.scheduledDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const timeEnd = reservation.estimatedEndDate ? new Date(reservation.estimatedEndDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';

      if (client?.email) {
        const html = `${getEmailHeader(garageName, garage?.primaryColor || '#dc2626', garage?.logo || undefined)}
          <h2 style="color: #333;">Rendez-vous confirmé</h2>
          <p>Bonjour ${clientName},</p>
          <p>Votre rendez-vous a été confirmé par notre équipe.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="padding: 8px; border: 1px solid #eee; font-weight: bold;">Service</td><td style="padding: 8px; border: 1px solid #eee;">${service?.name || 'Service'}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #eee; font-weight: bold;">Date</td><td style="padding: 8px; border: 1px solid #eee;">${dateFormatted}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #eee; font-weight: bold;">Horaire</td><td style="padding: 8px; border: 1px solid #eee;">${timeStart}${timeEnd ? ` - ${timeEnd}` : ''}</td></tr>
          </table>
          <p>Nous vous attendons !</p>
          ${garage?.address ? `<p><strong>Adresse :</strong> ${garage.address}${garage.postalCode ? ', ' + garage.postalCode : ''}${garage.city ? ' ' + garage.city : ''}</p>` : ''}
          ${getEmailFooter(garageName)}`;

        await sendEmail({
          to: client.email,
          subject: `[${garageName}] Rendez-vous confirmé - ${dateFormatted}`,
          html,
        });
      }

      await storage.createNotification({
        userId: reservation.clientId,
        type: "reservation",
        title: "Rendez-vous confirmé",
        message: `Votre rendez-vous du ${dateFormatted} est confirmé`,
      });

      res.json({ success: true, message: "Réservation confirmée" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/reservations/:id/reject-booking", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const reservation = await storage.getReservation(id);
      if (!reservation) return res.status(404).json({ message: "Réservation non trouvée" });

      await storage.updateReservation(id, { status: "cancelled" });

      const client = await storage.getUser(reservation.clientId);
      const garage = reservation.garageId ? await storage.getGarage(reservation.garageId) : null;
      const garageName = garage?.name || 'MyJantes';
      const clientName = client ? `${client.firstName || ''} ${client.lastName || ''}`.trim() : 'Client';
      const dateFormatted = new Date(reservation.scheduledDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

      if (client?.email) {
        const html = `${getEmailHeader(garageName, garage?.primaryColor || '#dc2626', garage?.logo || undefined)}
          <h2 style="color: #333;">Modification de rendez-vous</h2>
          <p>Bonjour ${clientName},</p>
          <p>Malheureusement, le créneau du <strong>${dateFormatted}</strong> n'est pas disponible.</p>
          ${reason ? `<p><strong>Motif :</strong> ${reason}</p>` : ''}
          <p>Vous pouvez réserver un nouveau créneau directement depuis votre lien de devis.</p>
          ${getEmailFooter(garageName)}`;

        await sendEmail({
          to: client.email,
          subject: `[${garageName}] Modification de votre rendez-vous`,
          html,
        });
      }

      res.json({ success: true, message: "Réservation annulée" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Accept quote + book slot + create invoice + engagement in one operation
  app.post("/api/admin/quotes/:id/accept-and-book", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { slotStart, slotEnd, notes } = req.body;
      if (!slotStart || !slotEnd) return res.status(400).json({ message: "Créneau requis" });

      const quote = await storage.getQuote(id);
      if (!quote) return res.status(404).json({ message: "Devis non trouvé" });

      const slotStartDate = new Date(slotStart);
      const slotEndDate = new Date(slotEnd);

      const { validateSlotWithinBusinessHours } = await import("./frenchBusinessHours");
      const validation = validateSlotWithinBusinessHours(slotStartDate, slotEndDate);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.reason });
      }

      const garageId = quote.garageId;
      const conflicting = await db.select().from(reservations)
        .where(sql`${reservations.status} != 'cancelled' AND ${reservations.scheduledDate} < ${slotEndDate} AND COALESCE(${reservations.estimatedEndDate}, ${reservations.scheduledDate} + interval '60 minutes') > ${slotStartDate} ${garageId ? sql`AND ${reservations.garageId} = ${garageId}` : sql``}`);
      if (conflicting.length > 0) {
        return res.status(409).json({ message: "Ce créneau est déjà occupé" });
      }

      // 1. Accept the quote
      await storage.updateQuote(id, { status: "accepted" });

      // 2. Create reservation
      const mm = String(slotStartDate.getMonth() + 1).padStart(2, '0');
      const jj = String(slotStartDate.getDate()).padStart(2, '0');
      const prefix = `RES-${mm}-${jj}-`;
      const existingRef = await db.execute(sql`SELECT reference FROM reservations WHERE reference LIKE ${prefix + '%'} ORDER BY reference DESC LIMIT 1`);
      let seq = 1;
      if (existingRef.rows && existingRef.rows.length > 0) {
        seq = parseInt((existingRef.rows[0] as any).reference.split('-').pop() || '0', 10) + 1;
      }
      const resReference = `${prefix}${String(seq).padStart(2, '0')}`;

      const reservation = await storage.createReservation({
        reference: resReference,
        garageId: quote.garageId || undefined,
        quoteId: quote.id,
        clientId: quote.clientId,
        serviceId: quote.serviceId,
        scheduledDate: slotStartDate,
        estimatedEndDate: slotEndDate,
        wheelCount: quote.wheelCount,
        diameter: quote.diameter,
        wheelPositions: quote.wheelPositions,
        priceExcludingTax: quote.priceExcludingTax,
        taxRate: quote.taxRate,
        taxAmount: quote.taxAmount,
        productDetails: quote.productDetails,
        status: "confirmed",
        notes: notes || quote.notes,
      } as any);

      // Init workflows
      try {
        const swfs = await storage.getServiceWorkflows(quote.serviceId);
        for (const wf of swfs) {
          const steps = await storage.getWorkflowSteps(wf.id);
          await storage.initializeReservationWorkflow(reservation.id, steps);
        }
      } catch (e) { console.log("[AcceptAndBook] Workflow init:", e); }

      // 3. Create invoice from quote
      const quoteItems = await storage.getQuoteItems(quote.id);
      const now = new Date();
      const invMonth = String(now.getMonth() + 1).padStart(2, '0');
      const invYear = now.getFullYear();
      const invPrefix = `FAC-${invMonth}-`;
      const existingInv = await db.execute(sql`SELECT invoice_number FROM invoices WHERE invoice_number LIKE ${invPrefix + '%'} ORDER BY invoice_number DESC LIMIT 1`);
      let invSeq = 1;
      if (existingInv.rows && existingInv.rows.length > 0) {
        invSeq = parseInt((existingInv.rows[0] as any).invoice_number.replace(invPrefix, '').split('-')[0] || '0', 10) + 1;
      }
      const invoiceNumber = `${invPrefix}${String(invSeq).padStart(5, '0')}`;

      const invoice = await storage.createInvoice({
        garageId: quote.garageId || undefined,
        invoiceNumber,
        quoteId: quote.id,
        clientId: quote.clientId,
        serviceId: quote.serviceId,
        totalAmount: quote.quoteAmount,
        priceExcludingTax: quote.priceExcludingTax,
        taxRate: quote.taxRate,
        taxAmount: quote.taxAmount,
        wheelCount: quote.wheelCount,
        diameter: quote.diameter,
        wheelPositions: quote.wheelPositions,
        productDetails: quote.productDetails,
        paymentMethod: quote.paymentMethod || "wire_transfer",
        status: "pending",
        notes: notes || quote.notes,
      } as any);

      // Copy quote items to invoice items
      for (const item of quoteItems) {
        const itemTaxAmount = item.taxAmount || 
          String((parseFloat(item.totalIncludingTax || "0") - parseFloat(item.totalExcludingTax || "0")).toFixed(2));
        await storage.createInvoiceItem({
          invoiceId: invoice.id,
          description: item.description,
          quantity: item.quantity,
          unitPriceExcludingTax: item.unitPriceExcludingTax,
          totalExcludingTax: item.totalExcludingTax,
          totalIncludingTax: item.totalIncludingTax,
          taxRate: item.taxRate,
          taxAmount: itemTaxAmount,
        });
      }

      // 4. Create engagement
      const service = await storage.getService(quote.serviceId);
      const engagement = await storage.createEngagement({
        clientId: quote.clientId,
        title: service?.name || `Prestation ${quote.reference}`,
        description: `Devis ${quote.reference} - Réservation ${resReference} - Facture ${invoiceNumber}`,
        status: "active",
      });

      // 5. Send recap email to client
      const client = await storage.getUser(quote.clientId);
      const garage = quote.garageId ? await storage.getGarage(quote.garageId) : null;
      const garageName = garage?.name || 'MyJantes';
      const clientName = client ? `${client.firstName || ''} ${client.lastName || ''}`.trim() : 'Client';
      const dateFormatted = slotStartDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const timeStart = slotStartDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const timeEnd = slotEndDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const totalTTC = parseFloat(quote.quoteAmount || '0');

      if (client?.email) {
        const recapHtml = `${getEmailHeader(garageName, garage?.primaryColor || '#dc2626', garage?.logo || undefined)}
          <h2 style="color: #333; margin-bottom: 16px;">Récapitulatif de votre prestation</h2>
          <p>Bonjour ${clientName},</p>
          <p>Votre prestation a été créée avec succès. Voici le récapitulatif complet :</p>

          <h3 style="color: ${garage?.primaryColor || '#dc2626'}; border-bottom: 2px solid ${garage?.primaryColor || '#dc2626'}; padding-bottom: 4px;">Devis ${quote.reference || ''}</h3>
          <table style="width: 100%; border-collapse: collapse; margin: 8px 0 16px;">
            <tr><td style="padding: 6px 8px; border: 1px solid #eee; font-weight: bold;">Service</td><td style="padding: 6px 8px; border: 1px solid #eee;">${service?.name || '-'}</td></tr>
            <tr><td style="padding: 6px 8px; border: 1px solid #eee; font-weight: bold;">Montant TTC</td><td style="padding: 6px 8px; border: 1px solid #eee;">${totalTTC.toFixed(2)} EUR</td></tr>
            <tr><td style="padding: 6px 8px; border: 1px solid #eee; font-weight: bold;">Statut</td><td style="padding: 6px 8px; border: 1px solid #eee;">Accepté</td></tr>
          </table>

          <h3 style="color: ${garage?.primaryColor || '#dc2626'}; border-bottom: 2px solid ${garage?.primaryColor || '#dc2626'}; padding-bottom: 4px;">Réservation ${resReference}</h3>
          <table style="width: 100%; border-collapse: collapse; margin: 8px 0 16px;">
            <tr><td style="padding: 6px 8px; border: 1px solid #eee; font-weight: bold;">Date</td><td style="padding: 6px 8px; border: 1px solid #eee;">${dateFormatted}</td></tr>
            <tr><td style="padding: 6px 8px; border: 1px solid #eee; font-weight: bold;">Horaire</td><td style="padding: 6px 8px; border: 1px solid #eee;">${timeStart} - ${timeEnd}</td></tr>
            <tr><td style="padding: 6px 8px; border: 1px solid #eee; font-weight: bold;">Statut</td><td style="padding: 6px 8px; border: 1px solid #eee;">Confirmé</td></tr>
          </table>

          <h3 style="color: ${garage?.primaryColor || '#dc2626'}; border-bottom: 2px solid ${garage?.primaryColor || '#dc2626'}; padding-bottom: 4px;">Facture ${invoiceNumber}</h3>
          <table style="width: 100%; border-collapse: collapse; margin: 8px 0 16px;">
            <tr><td style="padding: 6px 8px; border: 1px solid #eee; font-weight: bold;">Montant TTC</td><td style="padding: 6px 8px; border: 1px solid #eee;">${totalTTC.toFixed(2)} EUR</td></tr>
            <tr><td style="padding: 6px 8px; border: 1px solid #eee; font-weight: bold;">Statut</td><td style="padding: 6px 8px; border: 1px solid #eee;">En attente de paiement</td></tr>
          </table>

          ${garage?.address ? `<p><strong>Adresse :</strong> ${garage.address}${garage.postalCode ? ', ' + garage.postalCode : ''}${garage.city ? ' ' + garage.city : ''}</p>` : ''}
          ${garage?.phone ? `<p><strong>Téléphone :</strong> <a href="tel:${garage.phone}">${garage.phone}</a></p>` : ''}
          ${getEmailFooter(garageName)}`;

        await sendEmail({
          to: client.email,
          subject: `[${garageName}] Récapitulatif de votre prestation - ${quote.reference}`,
          html: recapHtml,
        });
      }

      res.json({
        success: true,
        quote: { id: quote.id, reference: quote.reference, status: "accepted" },
        reservation: { id: reservation.id, reference: resReference },
        invoice: { id: invoice.id, invoiceNumber },
        engagement: { id: engagement.id },
      });
    } catch (error: any) {
      console.error("[AcceptAndBook] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  // Generate view link for quote (admin/client)
  app.post("/api/quotes/:id/view-link", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const quote = await storage.getQuote(id);
      if (!quote) return res.status(404).json({ message: "Devis non trouvé" });
      
      const user = req.user;
      const isStaff = user.role === 'root' || user.role === 'superadmin' || user.role === 'admin' || user.role === 'employe';
      if (!isStaff && quote.clientId !== user.id) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }

      let viewToken = quote.viewToken;
      if (!viewToken) {
        viewToken = crypto.randomBytes(32).toString('hex');
        await storage.updateQuote(id, { viewToken } as any);
      }

      const viewUrl = `${getExternalBaseUrl(req)}/devis/${viewToken}`;
      res.json({ viewUrl, viewToken });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Generate view link for invoice (admin/client)
  app.post("/api/invoices/:id/view-link", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const invoice = await storage.getInvoice(id);
      if (!invoice) return res.status(404).json({ message: "Facture non trouvée" });
      
      const user = req.user;
      const isStaff = user.role === 'root' || user.role === 'superadmin' || user.role === 'admin' || user.role === 'employe';
      if (!isStaff && invoice.clientId !== user.id) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }

      let viewToken = invoice.viewToken;
      if (!viewToken) {
        viewToken = crypto.randomBytes(32).toString('hex');
        await db.update(invoices).set({ viewToken }).where(eq(invoices.id, id));
      }

      const viewUrl = `${getExternalBaseUrl(req)}/facture/${viewToken}`;
      res.json({ viewUrl, viewToken });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // PUBLIC INVOICE VIEW (tracks consultation via viewToken)
  app.get("/api/public/invoices/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const [invoice] = await db.select().from(invoices).where(eq(invoices.viewToken, token));
      if (!invoice) {
        return res.status(404).json({ message: "Facture non trouvée" });
      }

      // Track view
      if (!invoice.viewedAt) {
        await db.update(invoices).set({ viewedAt: new Date() }).where(eq(invoices.id, invoice.id));
        console.log(`[Tracking] Invoice ${invoice.id} marked as viewed via public link`);
      }

      const client = await storage.getUser(invoice.clientId);
      const items = await storage.getInvoiceItems(invoice.id);
      const settings = await storage.getApplicationSettings();
      const garage = invoice.garageId ? await storage.getGarage(invoice.garageId) : null;
      res.json({
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          amount: invoice.amount,
          priceExcludingTax: invoice.priceExcludingTax,
          taxRate: invoice.taxRate,
          taxAmount: invoice.taxAmount,
          productDetails: invoice.productDetails,
          notes: invoice.notes,
          dueDate: invoice.dueDate,
          paidAt: invoice.paidAt,
          createdAt: invoice.createdAt,
          wheelCount: invoice.wheelCount,
          diameter: invoice.diameter,
          paymentMethod: invoice.paymentMethod,
        },
        client: client ? {
          name: `${client.firstName || ""} ${client.lastName || ""}`.trim() || "Client",
        } : null,
        items: items.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unitPriceExcludingTax: item.unitPriceExcludingTax,
          totalExcludingTax: item.totalExcludingTax,
          totalIncludingTax: item.totalIncludingTax,
          taxRate: item.taxRate,
        })),
        garage: {
          name: settings?.companyName || garage?.name || "MY JANTES",
          logo: settings?.companyLogo || garage?.logo || null,
          primaryColor: garage?.primaryColor || "#dc2626",
          phone: settings?.companyPhone || garage?.phone || null,
          email: settings?.companyEmail || garage?.email || null,
          address: settings?.companyAddress || garage?.address || null,
          city: settings?.companyCity || garage?.city || null,
          postalCode: settings?.companyPostalCode || garage?.postalCode || null,
        },
      });
    } catch (error: any) {
      console.error("Error fetching public invoice:", error);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  app.post("/api/public/invoices/:token/create-checkout", async (req, res) => {
    try {
      const { token } = req.params;
      const [invoice] = await db.select().from(invoices).where(eq(invoices.viewToken, token));
      if (!invoice) {
        return res.status(404).json({ message: "Facture non trouvée" });
      }
      if (invoice.status === "paid") {
        return res.status(400).json({ message: "Cette facture est déjà payée" });
      }

      const amount = parseFloat(invoice.amount);
      if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ message: "Montant de facture invalide" });
      }

      const client = await storage.getUser(invoice.clientId);
      const clientEmail = client?.email || "client@myjantes.com";
      const clientName = client ? `${client.firstName || ""} ${client.lastName || ""}`.trim() : "Client";

      const { createCheckoutSession } = await import("./stripeService");

      const publicBase = "https://apps.myjantes.fr";
      const paymentMethods = (req.body.paymentMethods || ["card", "klarna"]) as string[];

      const session = await createCheckoutSession({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount,
        clientEmail,
        clientName,
        description: invoice.productDetails || `Facture ${invoice.invoiceNumber}`,
        successUrl: `${publicBase}/facture/${token}/paiement-confirme?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${publicBase}/facture/${token}`,
        paymentMethods,
      });

      await db.update(invoices)
        .set({
          stripeSessionId: session.id,
          paymentLink: session.url,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoice.id));

      console.log(`[Public Payment] Checkout session created for invoice ${invoice.invoiceNumber} (token: ${token.slice(0, 8)}...)`);

      res.json({
        sessionId: session.id,
        url: session.url,
      });
    } catch (error: any) {
      console.error("[Public Payment] Checkout error:", error);
      res.status(500).json({ message: error.message || "Erreur lors de la création du paiement" });
    }
  });

  app.get("/api/public/invoices/:token/payment-status", async (req, res) => {
    try {
      const { token } = req.params;
      const sessionId = req.query.session_id as string;
      const [invoice] = await db.select().from(invoices).where(eq(invoices.viewToken, token));
      if (!invoice) {
        return res.status(404).json({ message: "Facture non trouvée" });
      }

      if (invoice.status === "paid") {
        return res.json({
          invoiceStatus: "paid",
          paidAt: invoice.paidAt,
          stripeStatus: null,
        });
      }

      const sid = invoice.stripeSessionId;
      if (!sid) {
        return res.json({
          invoiceStatus: invoice.status,
          paidAt: invoice.paidAt,
          stripeStatus: null,
        });
      }

      if (sessionId && sessionId !== sid) {
        return res.status(400).json({ message: "Session de paiement invalide" });
      }

      const { retrieveSession } = await import("./stripeService");
      const session = await retrieveSession(sid);
      if (!session) {
        return res.json({
          invoiceStatus: invoice.status,
          paidAt: invoice.paidAt,
          stripeStatus: null,
        });
      }

      const sessionInvoiceId = session.metadata?.invoiceId;
      if (sessionInvoiceId && sessionInvoiceId !== invoice.id) {
        console.error(`[Public Payment] Session ${sid} metadata invoiceId ${sessionInvoiceId} does not match invoice ${invoice.id}`);
        return res.status(400).json({ message: "Session de paiement non associée à cette facture" });
      }

      const stripeStatus = {
        paymentStatus: session.payment_status,
        status: session.status,
        amountTotal: session.amount_total ? session.amount_total / 100 : null,
      };

      if (session.payment_status === "paid" && session.status === "complete") {
        await db.update(invoices)
          .set({
            status: "paid",
            paidAt: new Date(),
            paymentMethod: "stripe",
            stripePaymentIntentId: session.payment_intent as string,
            updatedAt: new Date(),
          })
          .where(eq(invoices.id, invoice.id));
        console.log(`[Public Payment] Invoice ${invoice.invoiceNumber} marked as paid via public verify`);

        return res.json({
          invoiceStatus: "paid",
          paidAt: new Date(),
          stripeStatus,
        });
      }

      res.json({
        invoiceStatus: invoice.status,
        paidAt: invoice.paidAt,
        stripeStatus,
      });
    } catch (error: any) {
      console.error("[Public Payment] Status error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/public/reviews/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const [review] = await db.select().from(reviews).where(eq(reviews.reviewToken, token));
      
      if (!review) {
        return res.status(404).json({ message: "Lien d'avis invalide" });
      }

      const invoice = review.invoiceId ? await storage.getInvoice(review.invoiceId) : null;
      const client = review.clientId ? await storage.getUser(review.clientId) : null;
      const garage = review.garageId ? await storage.getGarage(review.garageId) : null;

      res.json({
        reviewToken: token,
        hasReview: review.rating > 0,
        rating: review.rating > 0 ? review.rating : null,
        invoiceNumber: invoice?.invoiceNumber || null,
        clientName: review.clientName || (client ? `${client.firstName || ""} ${client.lastName || ""}`.trim() : null),
        garage: garage ? {
          name: garage.name,
          logo: garage.logo,
          primaryColor: garage.primaryColor,
          phone: garage.phone,
          email: garage.email,
          address: garage.address,
          city: garage.city,
          postalCode: garage.postalCode,
        } : null,
      });
    } catch (error: any) {
      console.error("Error fetching review:", error);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  app.post("/api/public/reviews/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const { rating, comment } = req.body;
      
      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "La note doit être entre 1 et 5" });
      }
      
      const [review] = await db.select().from(reviews).where(eq(reviews.reviewToken, token));
      if (!review) {
        return res.status(404).json({ message: "Lien d'avis invalide" });
      }
      
      if (review.rating > 0) {
        return res.status(400).json({ message: "Un avis a déjà été laissé pour cette facture" });
      }
      
      await db.update(reviews)
        .set({
          rating: parseInt(rating),
          comment: comment || null,
        })
        .where(eq(reviews.reviewToken, token));
      
      res.json({ message: "Merci pour votre avis !" });
    } catch (error: any) {
      console.error("Error creating review:", error);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  app.get("/api/public/logo.png", (req, res) => {
    const logoPath = path.join(process.cwd(), 'attached_assets', 'cropped-Logo-2-1-768x543_(3)_1767977972324.png');
    if (fs.existsSync(logoPath)) {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.sendFile(logoPath);
    } else {
      res.status(404).send('Logo not found');
    }
  });

  app.get("/api/public/quotes/:token/pdf", async (req, res) => {
    try {
      const { token } = req.params;
      const [quote] = await db.select().from(quotes).where(eq(quotes.viewToken, token));
      if (!quote) {
        return res.status(404).json({ message: "Devis non trouvé" });
      }
      const client = await storage.getUser(quote.clientId);
      const items = await storage.getQuoteItems(quote.id);
      const settings = await storage.getApplicationSettings();
      
      const formatPrice = (value: string | number | null | undefined): string => {
        if (value === null || value === undefined || value === "") return "0,00 €";
        const num = typeof value === "string" ? parseFloat(value) : value;
        if (isNaN(num)) return "0,00 €";
        return num.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
      };
      
      const { generateQuotePDF } = await import("./emailService");
      const pubQuoteTTC = parseFloat(quote.quoteAmount || "0");
      const pubQuoteTax = parseFloat(quote.taxAmount || "0");
      const pubQuoteHT = pubQuoteTax > 0 ? (pubQuoteTTC - pubQuoteTax) : (pubQuoteTTC / 1.2);

      const pdfBuffer = generateQuotePDF({
        quoteNumber: quote.reference || quote.id.slice(0, 8).toUpperCase(),
        quoteDate: quote.createdAt ? new Date(quote.createdAt).toLocaleDateString("fr-FR") : new Date().toLocaleDateString("fr-FR"),
        clientName: client ? (client.companyName || `${client.firstName || ""} ${client.lastName || ""}`.trim() || client.email) : "Client",
        status: quote.status,
        items: items.map(item => ({
          description: item.description,
          quantity: parseFloat(item.quantity || "1"),
          unitPrice: parseFloat(item.unitPriceExcludingTax || "0").toFixed(2),
          total: parseFloat(item.totalExcludingTax || "0").toFixed(2),
          taxRate: item.taxRate || "20",
        })),
        amount: formatPrice(quote.quoteAmount),
        totalHT: pubQuoteHT.toFixed(2),
        totalTTC: pubQuoteTTC.toFixed(2),
        companyName: settings?.companyName || "MyJantes",
      });
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Devis-${quote.reference || quote.id.slice(0, 8)}.pdf"`);
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error("Error generating public quote PDF:", error);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  // ==================== STRIPE PAYMENT ROUTES ====================

  // TEMP ENDPOINT - génération lien Klarna urgence
  app.get("/api/temp/klarna-link", async (req, res) => {
    if (req.query.secret !== "MJ2026TEMP") return res.status(403).json({ error: "forbidden" });
    try {
      const Stripe = (await import("stripe")).default;
      const key = process.env.STRIPE_SECRET_KEY_PROD || process.env.STRIPE_SECRET_KEY;
      if (!key) return res.status(500).json({ error: "Stripe key manquante" });
      const stripe = new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
      const amountCents = parseInt(req.query.amount as string || "42000");
      const email = req.query.email as string || "ludovic1925@hotmail.fr";
      const name = req.query.name as string || "Ludovic Catouillard";
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card", "klarna"] as any,
        mode: "payment",
        customer_email: email,
        line_items: [{
          price_data: {
            currency: "eur",
            product_data: { name: `Facture MyJantes - ${name}` },
            unit_amount: amountCents,
          },
          quantity: 1,
        }],
        success_url: `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/payment/cancel`,
        locale: "fr",
        metadata: { client: name },
      });
      res.json({ url: session.url, amount: amountCents / 100, email, session_id: session.id });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/payment/config", async (req, res) => {
    const { isStripeConfigured } = await import("./stripeService");
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY_PROD || process.env.STRIPE_PUBLISHABLE_KEY || null;
    res.json({
      stripeConfigured: isStripeConfigured(),
      publishableKey,
      isLiveMode: publishableKey?.startsWith("pk_live_") || false,
    });
  });

  app.get("/api/stripe/config", isAuthenticated, isAdmin, (_req, res) => {
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY_PROD || process.env.STRIPE_PUBLISHABLE_KEY || null;
    console.log(`[StripeConfig] Serving publishable key: ${publishableKey ? publishableKey.substring(0, 10) + "..." : "MISSING"}`);
    res.json({ publishableKey });
  });

  app.post("/api/payment/create-intent", isAuthenticated, async (req: any, res) => {
    try {
      const { invoiceId } = req.body;
      if (!invoiceId || typeof invoiceId !== "string") {
        return res.status(400).json({ message: "invoiceId requis" });
      }

      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Facture introuvable" });
      }

      if (invoice.clientId !== req.user.id && req.user.role !== "admin" && req.user.role !== "superadmin" && req.user.role !== "root") {
        return res.status(403).json({ message: "Accès non autorisé" });
      }

      if (invoice.status === "paid") {
        return res.status(400).json({ message: "Cette facture est déjà payée" });
      }

      const amount = parseFloat(invoice.amount);
      if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ message: "Montant de facture invalide" });
      }

      const client = await storage.getUser(invoice.clientId);
      const clientEmail = client?.email || req.user.email || "client@myjantes.com";
      const clientName = client ? `${client.firstName || ""} ${client.lastName || ""}`.trim() : "Client";

      const { createInstallmentPaymentIntent } = await import("./stripeService");

      const paymentIntent = await createInstallmentPaymentIntent({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount,
        clientEmail,
        clientName,
      });

      // Mark invoice as viewed when intent is created (checkout opened)
      try {
        await storage.updateInvoice(invoice.id, { viewedAt: new Date() });
        console.log(`[Tracking] Invoice ${invoice.id} marked as viewed (Intent)`);
      } catch (err) {
        console.error(`[Tracking] Failed to mark invoice ${invoice.id} as viewed:`, err);
      }

      await db.update(invoices)
        .set({
          stripePaymentIntentId: paymentIntent.id,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoice.id));

      // Mark invoice as viewed when intent is created (checkout opened)
      if (invoiceId) {
        try {
          await storage.updateInvoice(invoiceId, { viewedAt: new Date() });
          console.log(`[Tracking] Invoice ${invoiceId} marked as viewed`);
        } catch (err) {
          console.error(`[Tracking] Failed to mark invoice ${invoiceId} as viewed:`, err);
        }
      }

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY_PROD || null,
        amount,
        invoiceNumber: invoice.invoiceNumber,
      });
    } catch (error: any) {
      console.error("[Stripe] PaymentIntent error:", error);
      res.status(500).json({ message: error.message || "Erreur lors de la création du paiement" });
    }
  });

  app.post("/api/payment/create-checkout", isAuthenticated, async (req: any, res) => {
    try {
      const { invoiceId, paymentMethods } = req.body;
      if (!invoiceId) {
        return res.status(400).json({ message: "invoiceId requis" });
      }

      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Facture introuvable" });
      }

      if (invoice.clientId !== req.user.id && req.user.role !== "admin" && req.user.role !== "superadmin" && req.user.role !== "root") {
        return res.status(403).json({ message: "Accès non autorisé" });
      }

      if (invoice.status === "paid") {
        return res.status(400).json({ message: "Cette facture est déjà payée" });
      }

      const amount = parseFloat(invoice.amount);
      if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ message: "Montant de facture invalide" });
      }

      const client = await storage.getUser(invoice.clientId);
      const clientEmail = client?.email || req.user.email || "client@myjantes.com";
      const clientName = client ? `${client.firstName || ""} ${client.lastName || ""}`.trim() : "Client";

      const { createCheckoutSession } = await import("./stripeService");
      const publicBase = "https://apps.myjantes.fr";
      const facturePath = invoice.viewToken ? `/facture/${invoice.viewToken}` : `/payment/success`;

      const session = await createCheckoutSession({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount,
        clientEmail,
        clientName,
        description: invoice.productDetails || `Facture ${invoice.invoiceNumber}`,
        successUrl: `${publicBase}${facturePath}/paiement-confirme?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: invoice.viewToken ? `${publicBase}/facture/${invoice.viewToken}` : `${publicBase}/payment/cancel?invoice_id=${invoice.id}`,
        paymentMethods: paymentMethods || ["card", "klarna"],
      });

      // Mark invoice as viewed when checkout session is created
      try {
        await storage.updateInvoice(invoice.id, { viewedAt: new Date() });
        console.log(`[Tracking] Invoice ${invoice.id} marked as viewed (Checkout)`);
      } catch (err) {
        console.error(`[Tracking] Failed to mark invoice ${invoice.id} as viewed:`, err);
      }

      await db.update(invoices)
        .set({ 
          stripeSessionId: session.id,
          paymentLink: session.url,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoice.id));

      // Mark invoice as viewed when checkout session is created
      try {
        await storage.updateInvoice(invoice.id, { viewedAt: new Date() });
        console.log(`[Tracking] Invoice ${invoice.id} marked as viewed`);
      } catch (err) {
        console.error(`[Tracking] Failed to mark invoice ${invoice.id} as viewed:`, err);
      }

      res.json({ 
        sessionId: session.id, 
        url: session.url,
      });
    } catch (error: any) {
      console.error("[Stripe] Checkout error:", error);
      res.status(500).json({ message: error.message || "Erreur lors de la création du paiement" });
    }
  });

  app.get("/api/payment/status/:invoiceId", isAuthenticated, async (req: any, res) => {
    try {
      const invoice = await storage.getInvoice(req.params.invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Facture introuvable" });
      }

      if (invoice.clientId !== req.user.id && req.user.role !== "admin" && req.user.role !== "superadmin" && req.user.role !== "root") {
        return res.status(403).json({ message: "Accès non autorisé" });
      }

      let stripeStatus = null;
      if (invoice.stripeSessionId) {
        const { retrieveSession } = await import("./stripeService");
        const session = await retrieveSession(invoice.stripeSessionId);
        if (session) {
          stripeStatus = {
            paymentStatus: session.payment_status,
            status: session.status,
            amountTotal: session.amount_total ? session.amount_total / 100 : null,
          };
        }
      }

      res.json({
        invoiceId: invoice.id,
        invoiceStatus: invoice.status,
        paymentMethod: invoice.paymentMethod,
        stripeSessionId: invoice.stripeSessionId,
        paymentLink: invoice.paymentLink,
        stripeStatus,
        paidAt: invoice.paidAt,
      });
    } catch (error: any) {
      console.error("[Payment] Status error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/payment/verify/:sessionId", isAuthenticated, async (req: any, res) => {
    try {
      const { retrieveSession } = await import("./stripeService");
      const session = await retrieveSession(req.params.sessionId);
      
      if (!session) {
        return res.status(404).json({ message: "Session de paiement introuvable" });
      }

      const invoiceId = session.metadata?.invoiceId;
      if (!invoiceId) {
        return res.status(400).json({ message: "Aucune facture associée à cette session" });
      }

      if (session.payment_status === "paid") {
        await db.update(invoices)
          .set({
            status: "paid",
            paidAt: new Date(),
            stripePaymentIntentId: session.payment_intent as string,
            paymentMethod: "stripe",
            updatedAt: new Date(),
          })
          .where(eq(invoices.id, invoiceId));

        const invoice = await storage.getInvoice(invoiceId);
        if (invoice) {
          await storage.createNotification({
            userId: invoice.clientId,
            type: "invoice",
            title: "Paiement confirmé",
            message: `Le paiement de la facture ${invoice.invoiceNumber} a été confirmé.`,
            relatedId: invoice.id,
          });

          const wsClient = wsClients.get(invoice.clientId);
          if (wsClient && wsClient.readyState === WebSocket.OPEN) {
            wsClient.send(JSON.stringify({
              type: "payment_confirmed",
              invoiceId: invoice.id,
            }));
          }
        }
      }

      res.json({
        status: session.payment_status,
        invoiceId,
        paid: session.payment_status === "paid",
      });
    } catch (error: any) {
      console.error("[Payment] Verify error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ── Bunq Resend Inbound Email Webhook ──────────────────────────────────────

  /**
   * POST /webhook/resend-bunq
   * Reçoit les e-mails transférés par Resend Inbound.
   * Corps JSON Resend : { from, to, subject, text, html, attachments: [{filename, content_type, data}] }
   * SANS authentification (Resend contacte ce webhook depuis l'extérieur).
   * Sécurité : on vérifie que from contient @bunq.com.
   */
  app.post("/webhook/resend-bunq", async (req, res) => {
    try {
      const { isBunqSender, isSafeFilename, parseBunqCsv, parseBunqPdf, parseBunqZip, SyncResult } =
        await import("./bunqWebhookService");

      const body = req.body as {
        from?: string;
        subject?: string;
        attachments?: { filename: string; content_type: string; data: string }[];
      };

      // ── Validation expéditeur ──────────────────────────────────────────────
      const from = body.from || "";
      if (!isBunqSender(from)) {
        console.warn(`[bunq-webhook] Expéditeur non autorisé : ${from}`);
        return res.status(200).json({ ok: false, message: "Expéditeur non bunq — ignoré" });
      }

      console.log(`[bunq-webhook] E-mail reçu de ${from} — sujet : "${body.subject}"`);

      const attachments = body.attachments || [];
      if (attachments.length === 0) {
        return res.status(200).json({ ok: true, message: "Aucune pièce jointe", imported: 0 });
      }

      let totalImported = 0;
      const allErrors: string[] = [];

      for (const att of attachments) {
        const filename = att.filename || "fichier";

        if (!isSafeFilename(filename)) {
          console.warn(`[bunq-webhook] Fichier ignoré (extension non autorisée) : ${filename}`);
          continue;
        }

        const ext = filename.split(".").pop()?.toLowerCase() || "";
        const buffer = Buffer.from(att.data || "", "base64");

        try {
          let txList: { date: string; label: string; amount: number; currency: string; rawLine: string }[] = [];

          if (ext === "csv") {
            txList = parseBunqCsv(buffer);
            console.log(`[bunq-webhook] CSV "${filename}" : ${txList.length} transaction(s) parsées`);
          } else if (ext === "pdf") {
            txList = await parseBunqPdf(buffer);
            console.log(`[bunq-webhook] PDF "${filename}" : ${txList.length} transaction(s) extraites`);
          } else if (ext === "zip") {
            const zipResults = await parseBunqZip(buffer);
            for (const r of zipResults) {
              txList.push(...r.transactions);
              allErrors.push(...r.errors.map(e => `${r.filename}: ${e}`));
            }
            console.log(`[bunq-webhook] ZIP "${filename}" : ${txList.length} transaction(s) totales`);
          }

          // ── Upload vers Object Storage (audit trail) ──────────────────────
          try {
            const archiveName = `${Date.now()}_${filename}`;
            await uploadToStorage(buffer, archiveName, "bunq-imports");
            console.log(`[bunq-webhook] Fichier archivé : bunq-imports/${archiveName}`);
          } catch (stErr: any) {
            console.warn(`[bunq-webhook] Upload storage ignoré : ${stErr.message}`);
          }

          // ── Import comptable ──────────────────────────────────────────────
          const garageId: string | null = null;
          // Récupère les sourceId déjà importés
          const existingBunq = await db
            .select({ sourceId: accountingEntries.sourceId })
            .from(accountingEntries)
            .where(sql`${accountingEntries.sourceId} LIKE 'bunq_%'`);
          const importedIds = new Set(existingBunq.map(e => e.sourceId));

          for (const tx of txList) {
            const bunqKey = `bunq_${tx.date}_${tx.amount}_${tx.label.slice(0, 20).replace(/\s/g, "_")}`;
            if (importedIds.has(bunqKey)) continue;

            const year = new Date(tx.date).getFullYear() || new Date().getFullYear();
            const entryNumber = await storage.getNextEntryNumber(year);
            const amount = Math.abs(tx.amount);
            const isCredit = tx.amount > 0;

            const entry = await storage.createAccountingEntry({
              garageId,
              entryNumber,
              date: new Date(tx.date),
              journal: "bank",
              sourceType: "manual",
              sourceId: bunqKey,
              description: `[bunq] ${tx.label}`,
              totalDebit: String(amount),
              totalCredit: String(amount),
            });

            if (isCredit) {
              await storage.createAccountingLine({ entryId: entry.id, accountCode: "512100", accountLabel: "Banque bunq", description: tx.label, debit: String(amount), credit: "0" });
              await storage.createAccountingLine({ entryId: entry.id, accountCode: "471000", accountLabel: "Compte d'attente bunq", description: tx.label, debit: "0", credit: String(amount) });
            } else {
              await storage.createAccountingLine({ entryId: entry.id, accountCode: "471000", accountLabel: "Compte d'attente bunq", description: tx.label, debit: String(amount), credit: "0" });
              await storage.createAccountingLine({ entryId: entry.id, accountCode: "512100", accountLabel: "Banque bunq", description: tx.label, debit: "0", credit: String(amount) });
            }

            importedIds.add(bunqKey);
            totalImported++;
          }
        } catch (err: any) {
          console.error(`[bunq-webhook] Erreur traitement "${filename}" :`, err.message);
          allErrors.push(`${filename}: ${err.message}`);
        }
      }

      console.log(`[bunq-webhook] Terminé : ${totalImported} écriture(s) importée(s)`);
      return res.status(200).json({ ok: true, imported: totalImported, errors: allErrors });
    } catch (err: any) {
      console.error("[bunq-webhook] Erreur générale:", err);
      return res.status(200).json({ ok: false, message: err.message });
    }
  });

  /**
   * POST /api/import-bunq
   * Import manuel d'un fichier bunq (CSV/PDF/ZIP) via le frontend.
   * Envoi en JSON avec le fichier encodé en Base64.
   */
  app.post("/api/import-bunq", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { isSafeFilename, parseBunqCsv, parseBunqPdf, parseBunqZip } =
        await import("./bunqWebhookService");

      const { base64, filename } = req.body as { base64: string; filename: string };

      if (!base64 || !filename) {
        return res.status(400).json({ message: "Données de fichier manquantes" });
      }

      if (!isSafeFilename(filename)) {
        return res.status(400).json({ message: "Type de fichier non autorisé" });
      }

      const ext = filename.split(".").pop()?.toLowerCase() || "";
      const buffer = Buffer.from(base64, "base64");
      
      let txList: { date: string; label: string; amount: number; currency: string; rawLine: string }[] = [];
      const errors: string[] = [];

      if (ext === "csv") {
        txList = parseBunqCsv(buffer);
      } else if (ext === "pdf") {
        txList = await parseBunqPdf(buffer);
      } else if (ext === "zip") {
        const zipResults = await parseBunqZip(buffer);
        for (const r of zipResults) {
          txList.push(...r.transactions);
          errors.push(...r.errors);
        }
      }

      const garageId = req.user?.garageId || null;
      const existingBunq = await db
        .select({ sourceId: accountingEntries.sourceId })
        .from(accountingEntries)
        .where(sql`${accountingEntries.sourceId} LIKE 'bunq_%'`);
      const importedIds = new Set(existingBunq.map(e => e.sourceId));

      let imported = 0;
      let skipped = 0;

      for (const tx of txList) {
        const bunqKey = `bunq_${tx.date}_${tx.amount}_${tx.label.slice(0, 20).replace(/\s/g, "_")}`;
        if (importedIds.has(bunqKey)) { skipped++; continue; }

        const year = new Date(tx.date).getFullYear() || new Date().getFullYear();
        const entryNumber = await storage.getNextEntryNumber(year);
        const amount = Math.abs(tx.amount);
        const isCredit = tx.amount > 0;

        const entry = await storage.createAccountingEntry({
          garageId,
          entryNumber,
          date: new Date(tx.date),
          journal: "bank",
          sourceType: "manual",
          sourceId: bunqKey,
          description: `[bunq] ${tx.label}`,
          totalDebit: String(amount),
          totalCredit: String(amount),
        });

        if (isCredit) {
          await storage.createAccountingLine({ entryId: entry.id, accountCode: "512100", accountLabel: "Banque bunq", description: tx.label, debit: String(amount), credit: "0" });
          await storage.createAccountingLine({ entryId: entry.id, accountCode: "471000", accountLabel: "Compte d'attente bunq", description: tx.label, debit: "0", credit: String(amount) });
        } else {
          await storage.createAccountingLine({ entryId: entry.id, accountCode: "471000", accountLabel: "Compte d'attente bunq", description: tx.label, debit: String(amount), credit: "0" });
          await storage.createAccountingLine({ entryId: entry.id, accountCode: "512100", accountLabel: "Banque bunq", description: tx.label, debit: "0", credit: String(amount) });
        }

        importedIds.add(bunqKey);
        imported++;
      }

      res.json({ ok: true, imported, skipped, total: txList.length, errors });
    } catch (err: any) {
      console.error("[import-bunq]", err);
      res.status(500).json({ message: err.message });
    }
  });

  /**
   * GET /api/import-bunq/stats
   * Retourne les stats des imports bunq déjà en comptabilité.
   */
  app.get("/api/import-bunq/stats", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const bunqEntries = await db
        .select()
        .from(accountingEntries)
        .where(sql`${accountingEntries.sourceId} LIKE 'bunq_%'`)
        .orderBy(desc(accountingEntries.date));

      res.json({
        count: bunqEntries.length,
        lastImport: bunqEntries[0]?.createdAt || null,
        recent: bunqEntries.slice(0, 5).map(e => ({
          date: e.date,
          description: e.description,
          amount: e.totalDebit,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/webhooks/stripe", async (req, res) => {
    try {
      const signature = req.headers["stripe-signature"] as string;
      if (!signature) {
        return res.status(400).json({ message: "Missing stripe-signature header" });
      }

      const { constructWebhookEvent } = await import("./stripeService");
      
      let event;
      try {
        event = constructWebhookEvent(req.body, signature);
      } catch (err: any) {
        console.error("[Stripe Webhook] Signature verification failed:", err.message);
        return res.status(400).json({ message: `Webhook Error: ${err.message}` });
      }

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as any;
          const invoiceId = session.metadata?.invoiceId;
          
          if (invoiceId && session.payment_status === "paid") {
            await db.update(invoices)
              .set({
                status: "paid",
                paidAt: new Date(),
                stripePaymentIntentId: session.payment_intent,
                paymentMethod: "stripe",
                updatedAt: new Date(),
              })
              .where(eq(invoices.id, invoiceId));

            const invoice = await storage.getInvoice(invoiceId);
            if (invoice) {
              const client = await storage.getUser(invoice.clientId);
              const settings = await storage.getApplicationSettings();
              const { sendEmail, generateInvoicePaidEmailHtml } = await import("./emailService");
              const crypto = await import("crypto");
              
              const dynamicBase = getExternalBaseUrl(req);
              const clientName = `${client?.firstName || ""} ${client?.lastName || ""}`.trim() || client?.email || "";
              let reviewUrl = "";
              
              const existingReviews = await db.select().from(reviews).where(eq(reviews.invoiceId, invoice.id));
              if (existingReviews.length === 0) {
                const reviewToken = crypto.randomBytes(32).toString('hex');
                await db.insert(reviews).values({
                  garageId: invoice.garageId,
                  invoiceId: invoice.id,
                  clientId: invoice.clientId,
                  clientName: clientName,
                  rating: 0,
                  reviewToken: reviewToken,
                });
                reviewUrl = `${dynamicBase}/avis/${reviewToken}`;
              } else if (existingReviews[0].reviewToken) {
                reviewUrl = `${dynamicBase}/avis/${existingReviews[0].reviewToken}`;
              }

              if (client?.email) {
                const paidHtml = generateInvoicePaidEmailHtml({
                  clientName: clientName,
                  invoiceNumber: invoice.invoiceNumber || invoice.id.slice(0, 8).toUpperCase(),
                  amount: invoice.amount || "0",
                  paymentDate: new Date().toLocaleDateString("fr-FR"),
                  companyName: settings?.companyName || "MyJantes",
                  reviewUrl: reviewUrl || undefined
                });

                await sendEmail({
                  to: client.email,
                  subject: `Paiement reçu - Facture ${invoice.invoiceNumber}`,
                  html: paidHtml,
                });

                sendEventSms({
                  userPhone: client.phone,
                  userSmsConsent: client.smsConsent,
                  userName: `${client.firstName || ''} ${client.lastName || ''}`.trim(),
                  userEmail: client.email,
                  eventType: 'invoice_paid',
                  eventTitle: `Paiement reçu - ${invoice.invoiceNumber}`,
                  eventDetails: `Montant : ${invoice.amount || '0'} €. Merci pour votre confiance !`,
                  eventUrl: reviewUrl || undefined,
                });
              }

              await storage.createNotification({
                userId: invoice.clientId,
                type: "invoice",
                title: "Paiement reçu",
                message: `Le paiement de la facture ${invoice.invoiceNumber} a été reçu. Merci !`,
                relatedId: invoice.id,
              });
              sendWsNotification(invoice.clientId, { type: "payment_confirmed", invoiceId: invoice.id });
            }

            console.log(`[Stripe Webhook] Invoice ${invoiceId} marked as paid`);
          }
          break;
        }

        case "payment_intent.succeeded": {
          const paymentIntent = event.data.object as any;
          const invoiceId = paymentIntent.metadata?.invoiceId;
          
          if (invoiceId) {
            let paymentMethodType = "stripe";
            try {
              const { retrievePaymentIntentWithCharge, mapStripePaymentMethod } = await import("./stripeService");
              const fullPI = await retrievePaymentIntentWithCharge(paymentIntent.id);
              if (fullPI) {
                paymentMethodType = mapStripePaymentMethod(fullPI);
              }
            } catch (e) {
              console.error("[Stripe Webhook] Error mapping payment method:", e);
            }

            await db.update(invoices)
              .set({
                status: "paid",
                paidAt: new Date(),
                stripePaymentIntentId: paymentIntent.id,
                paymentMethod: paymentMethodType as any,
                updatedAt: new Date(),
              })
              .where(eq(invoices.id, invoiceId));

            const invoice = await storage.getInvoice(invoiceId);
            if (invoice) {
              const client = await storage.getUser(invoice.clientId);
              const settings = await storage.getApplicationSettings();
              const { sendEmail, generateInvoicePaidEmailHtml } = await import("./emailService");
              const crypto = await import("crypto");
              
              const dynamicBase = getExternalBaseUrl(req);
              const clientName = `${client?.firstName || ""} ${client?.lastName || ""}`.trim() || client?.email || "";
              let reviewUrl = "";
              
              const existingReviews = await db.select().from(reviews).where(eq(reviews.invoiceId, invoice.id));
              if (existingReviews.length === 0) {
                const reviewToken = crypto.randomBytes(32).toString('hex');
                await db.insert(reviews).values({
                  garageId: invoice.garageId,
                  invoiceId: invoice.id,
                  clientId: invoice.clientId,
                  clientName: clientName,
                  rating: 0,
                  reviewToken: reviewToken,
                });
                reviewUrl = `${dynamicBase}/avis/${reviewToken}`;
              } else if (existingReviews[0].reviewToken) {
                reviewUrl = `${dynamicBase}/avis/${existingReviews[0].reviewToken}`;
              }

              if (client?.email) {
                const paidHtml = generateInvoicePaidEmailHtml({
                  clientName: clientName,
                  invoiceNumber: invoice.invoiceNumber || invoice.id.slice(0, 8).toUpperCase(),
                  amount: invoice.amount || "0",
                  paymentDate: new Date().toLocaleDateString("fr-FR"),
                  companyName: settings?.companyName || "MyJantes",
                  reviewUrl: reviewUrl || undefined
                });

                await sendEmail({
                  to: client.email,
                  subject: `Paiement reçu - Facture ${invoice.invoiceNumber}`,
                  html: paidHtml,
                });
              }

              await storage.createNotification({
                userId: invoice.clientId,
                type: "invoice",
                title: "Paiement reçu",
                message: `Le paiement de la facture ${invoice.invoiceNumber} a été confirmé via ${paymentMethodType === "klarna" ? "Klarna" : paymentMethodType === "alma" ? "Alma" : "Stripe"}.`,
                relatedId: invoice.id,
              });

              const wsClient = wsClients.get(invoice.clientId);
              if (wsClient && wsClient.readyState === WebSocket.OPEN) {
                wsClient.send(JSON.stringify({
                  type: "payment_confirmed",
                  invoiceId: invoice.id,
                  paymentMethod: paymentMethodType,
                }));
              }
            }

            console.log(`[Stripe Webhook] PaymentIntent ${paymentIntent.id} succeeded for invoice ${invoiceId} (method: ${paymentMethodType})`);
          }
          break;
        }

        case "payment_intent.canceled": {
          const paymentIntent = event.data.object as any;
          const invoiceId = paymentIntent.metadata?.invoiceId;
          console.log(`[Stripe Webhook] PaymentIntent ${paymentIntent.id} canceled for invoice ${invoiceId}`);
          break;
        }

        case "payment_intent.payment_failed": {
          const paymentIntent = event.data.object as any;
          const invoiceId = paymentIntent.metadata?.invoiceId;
          console.log(`[Stripe Webhook] Payment failed for invoice ${invoiceId}: ${paymentIntent.last_payment_error?.message}`);
          break;
        }

        default:
          console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error("[Stripe Webhook] Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/payment/generate-link", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { invoiceId, paymentMethods } = req.body;
      if (!invoiceId) {
        return res.status(400).json({ message: "invoiceId requis" });
      }

      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Facture introuvable" });
      }

      if (invoice.status === "paid") {
        return res.status(400).json({ message: "Facture déjà payée" });
      }

      const client = await storage.getUser(invoice.clientId);
      const clientEmail = client?.email || "client@myjantes.com";
      const clientName = client ? `${client.firstName || ""} ${client.lastName || ""}`.trim() : "Client";

      const { createCheckoutSession } = await import("./stripeService");
      const publicBase = "https://apps.myjantes.fr";
      const invViewToken = invoice.viewToken || (() => {
        const t = crypto.randomBytes(32).toString("hex");
        db.update(invoices).set({ viewToken: t }).where(eq(invoices.id, invoice.id)).catch(() => {});
        return t;
      })();

      const session = await createCheckoutSession({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: parseFloat(invoice.amount),
        clientEmail,
        clientName,
        description: invoice.productDetails || `Facture ${invoice.invoiceNumber}`,
        successUrl: `${publicBase}/facture/${invViewToken}/paiement-confirme?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${publicBase}/facture/${invViewToken}`,
        paymentMethods: paymentMethods || ["card", "klarna"],
      });

      await db.update(invoices)
        .set({ 
          stripeSessionId: session.id,
          paymentLink: session.url,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoice.id));

      res.json({ 
        sessionId: session.id,
        paymentLink: session.url,
        invoiceNumber: invoice.invoiceNumber,
      });
    } catch (error: any) {
      console.error("[Payment] Generate link error:", error);
      res.status(500).json({ message: error.message || "Erreur lors de la génération du lien de paiement" });
    }
  });

  app.get("/api/admin/payments", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const allInvoices = await storage.getInvoices();
      const paidInvoices = allInvoices.filter(i => i.stripePaymentIntentId || i.paymentMethod === "stripe" || i.paymentMethod === "sepa" || i.paymentMethod === "klarna" || i.paymentMethod === "alma");
      
      const payments = [];
      for (const inv of paidInvoices) {
        const client = await storage.getUser(inv.clientId);
        payments.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          amount: inv.amount,
          status: inv.status,
          paymentMethod: inv.paymentMethod,
          stripePaymentIntentId: inv.stripePaymentIntentId,
          paidAt: inv.paidAt,
          clientName: client ? `${client.firstName || ""} ${client.lastName || ""}`.trim() : "N/A",
          clientEmail: client?.email || "N/A",
          createdAt: inv.createdAt,
        });
      }

      res.json(payments);
    } catch (error: any) {
      console.error("[Payments] List error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ========== ACCOUNTING MODULE ROUTES ==========

  // ===== EXPENSE CATEGORIES =====
  app.get("/api/admin/expense-categories", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageId = (req.user?.role === "superadmin" || req.user?.role === "root") ? undefined : req.user?.garageId;
      const categories = await storage.getExpenseCategories(garageId);
      res.json(categories);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/expense-categories", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const data = { ...req.body, garageId: req.user?.garageId || null };
      const category = await storage.createExpenseCategory(data);
      res.json(category);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/admin/expense-categories/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const category = await storage.updateExpenseCategory(req.params.id, req.body);
      res.json(category);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/admin/expense-categories/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      await storage.deleteExpenseCategory(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ===== EXPENSES =====
  app.get("/api/admin/expenses", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageId = (req.user?.role === "superadmin" || req.user?.role === "root") ? undefined : req.user?.garageId;
      const allExpenses = await storage.getExpenses(garageId);
      res.json(allExpenses);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/expenses/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const expense = await storage.getExpense(req.params.id);
      if (!expense) return res.status(404).json({ message: "Dépense non trouvée" });
      res.json(expense);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/expenses", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const year = new Date().getFullYear();
      const expenseNumber = await storage.getNextExpenseNumber(year);

      if (!req.body.vendor || !req.body.vendor.trim()) {
        return res.status(400).json({ message: "Fournisseur requis" });
      }

      let parsedDate: Date;
      if (req.body.date) {
        parsedDate = new Date(req.body.date);
        if (isNaN(parsedDate.getTime())) {
          return res.status(400).json({ message: "Date invalide" });
        }
      } else {
        parsedDate = new Date();
      }

      const amountHT = parseFloat(req.body.amountHT);
      const taxRate = parseFloat(req.body.taxRate || "20");
      if (isNaN(amountHT) || amountHT <= 0) {
        return res.status(400).json({ message: "Montant HT invalide" });
      }
      const taxAmount = amountHT * taxRate / 100;
      const amountTTC = amountHT + taxAmount;

      const data = {
        ...req.body,
        date: parsedDate,
        amountHT: amountHT.toFixed(2),
        taxRate: taxRate.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        amountTTC: amountTTC.toFixed(2),
        expenseNumber,
        garageId: req.user?.garageId || null,
      };
      const expense = await storage.createExpense(data);

      // Auto-generate accounting entry for the expense
      await createAccountingEntryForExpense(expense, req.user);

      res.json(expense);
    } catch (error: any) {
      console.error("Error creating expense:", error);
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/admin/expenses/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const updateData = { ...req.body };
      if (updateData.date) {
        const parsedDate = new Date(updateData.date);
        if (isNaN(parsedDate.getTime())) {
          return res.status(400).json({ message: "Date invalide" });
        }
        updateData.date = parsedDate;
      }
      if (updateData.amountHT) {
        const ht = parseFloat(updateData.amountHT);
        const rate = parseFloat(updateData.taxRate || "20");
        updateData.amountHT = ht.toFixed(2);
        updateData.taxRate = rate.toFixed(2);
        updateData.taxAmount = (ht * rate / 100).toFixed(2);
        updateData.amountTTC = (ht + ht * rate / 100).toFixed(2);
      }
      const expense = await storage.updateExpense(req.params.id, updateData);
      res.json(expense);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/admin/expenses/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      await storage.deleteExpense(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ===== CREDIT NOTES (AVOIRS) =====
  app.get("/api/admin/credit-notes", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageId = (req.user?.role === "superadmin" || req.user?.role === "root") ? undefined : req.user?.garageId;
      const notes = await storage.getCreditNotes(garageId);
      res.json(notes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/credit-notes/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const note = await storage.getCreditNote(req.params.id);
      if (!note) return res.status(404).json({ message: "Avoir non trouvé" });
      const items = await storage.getCreditNoteItems(req.params.id);
      res.json({ ...note, items });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/credit-notes", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { items, ...noteData } = req.body;
      const year = new Date().getFullYear();
      const creditNoteNumber = await storage.getNextCreditNoteNumber(year);

      const creditNote = await storage.createCreditNote({
        ...noteData,
        creditNoteNumber,
        garageId: req.user?.garageId || null,
      });

      if (items && Array.isArray(items)) {
        for (const item of items) {
          await storage.createCreditNoteItem({
            ...item,
            creditNoteId: creditNote.id,
          });
        }
      }

      // Auto-generate accounting entry for the credit note
      await createAccountingEntryForCreditNote(creditNote, req.user);

      res.json(creditNote);
    } catch (error: any) {
      console.error("Error creating credit note:", error);
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/admin/credit-notes/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const note = await storage.updateCreditNote(req.params.id, req.body);
      res.json(note);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ===== ACCOUNTING ENTRIES =====
  app.get("/api/admin/accounting/entries", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageId = (req.user?.role === "superadmin" || req.user?.role === "root") ? undefined : req.user?.garageId;
      const filters: any = {};
      if (req.query.journal) filters.journal = req.query.journal;
      if (req.query.startDate) filters.startDate = new Date(req.query.startDate as string);
      if (req.query.endDate) filters.endDate = new Date(req.query.endDate as string);
      const entries = await storage.getAccountingEntries(garageId, filters);
      res.json(entries);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/accounting/entries/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const entry = await storage.getAccountingEntry(req.params.id);
      if (!entry) return res.status(404).json({ message: "Écriture non trouvée" });
      const lines = await storage.getAccountingLines(req.params.id);
      res.json({ ...entry, lines });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/accounting/entries", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { lines, ...entryData } = req.body;
      const year = new Date(entryData.date).getFullYear();
      const entryNumber = await storage.getNextEntryNumber(year);

      let totalDebit = 0;
      let totalCredit = 0;
      if (lines && Array.isArray(lines)) {
        for (const line of lines) {
          totalDebit += parseFloat(line.debit || "0");
          totalCredit += parseFloat(line.credit || "0");
        }
      }

      const entry = await storage.createAccountingEntry({
        ...entryData,
        entryNumber,
        totalDebit: String(totalDebit),
        totalCredit: String(totalCredit),
        garageId: req.user?.garageId || null,
      });

      if (lines && Array.isArray(lines)) {
        for (const line of lines) {
          await storage.createAccountingLine({
            ...line,
            entryId: entry.id,
          });
        }
      }

      res.json(entry);
    } catch (error: any) {
      console.error("Error creating accounting entry:", error);
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/admin/accounting/entries/:id/validate", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const entry = await storage.updateAccountingEntry(req.params.id, {
        isValidated: true,
        validatedAt: new Date(),
        validatedBy: req.user.id,
      } as any);
      res.json(entry);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/admin/accounting/entries/bulk-validate", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { ids } = req.body as { ids: string[] };
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "IDs requis" });
      let count = 0;
      for (const id of ids) {
        try {
          await storage.updateAccountingEntry(id, { isValidated: true, validatedAt: new Date(), validatedBy: req.user.id } as any);
          count++;
        } catch {}
      }
      res.json({ ok: true, validated: count });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/admin/accounting/entries/bulk-delete", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { ids } = req.body as { ids: string[] };
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "IDs requis" });
      let count = 0;
      for (const id of ids) {
        try {
          await db.delete(accountingEntries).where(eq(accountingEntries.id, id));
          count++;
        } catch {}
      }
      res.json({ ok: true, deleted: count });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/admin/accounting/entries/bulk-email", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { ids, email } = req.body as { ids: string[]; email: string };
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "IDs requis" });
      if (!email) return res.status(400).json({ message: "Email requis" });

      const selectedEntries = await db
        .select()
        .from(accountingEntries)
        .where(inArray(accountingEntries.id, ids));

      const lines = selectedEntries.map(e =>
        `N°${e.entryNumber} | ${new Date(e.date).toLocaleDateString("fr-FR")} | ${e.journal} | ${e.description} | Débit: ${parseFloat(e.totalDebit || "0").toFixed(2)}€ | Crédit: ${parseFloat(e.totalCredit || "0").toFixed(2)}€ | ${e.isValidated ? "Validée" : "Brouillon"}`
      ).join("\n");

      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);

      await resend.emails.send({
        from: "MyJantes <contact@wpa.myjantes.fr>",
        to: email,
        subject: `Écritures comptables MyJantes — ${ids.length} écriture(s)`,
        text: `Bonjour,\n\nVoici les écritures comptables sélectionnées (${ids.length}):\n\n${lines}\n\nExportées depuis le module comptabilité MyJantes.`,
        html: `<p>Bonjour,</p><p>Voici les ${ids.length} écriture(s) comptable(s) sélectionnée(s) :</p><table border="1" cellpadding="6" style="border-collapse:collapse;font-family:monospace;font-size:12px"><thead><tr><th>N°</th><th>Date</th><th>Journal</th><th>Libellé</th><th>Débit</th><th>Crédit</th><th>Statut</th></tr></thead><tbody>${selectedEntries.map(e => `<tr><td>${e.entryNumber}</td><td>${new Date(e.date).toLocaleDateString("fr-FR")}</td><td>${e.journal}</td><td>${e.description}</td><td>${parseFloat(e.totalDebit || "0").toFixed(2)} €</td><td>${parseFloat(e.totalCredit || "0").toFixed(2)} €</td><td>${e.isValidated ? "✓ Validée" : "Brouillon"}</td></tr>`).join("")}</tbody></table><p style="font-size:11px;color:#888">MyJantes — Module Comptabilité</p>`,
      });

      res.json({ ok: true, sent: ids.length, to: email });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/admin/accounting/dossier-email", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { email, startDate, endDate } = req.body as { email: string; startDate: string; endDate: string };
      if (!email) return res.status(400).json({ message: "Email requis" });

      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);

      const entries = await storage.getAccountingEntries(undefined, { startDate: new Date(startDate), endDate: new Date(endDate) });
      const summary = `Période : ${startDate} → ${endDate}\nÉcritures totales : ${entries.length}\nValidées : ${entries.filter(e => e.isValidated).length}\nBrouillons : ${entries.filter(e => !e.isValidated).length}`;

      await resend.emails.send({
        from: "MyJantes <contact@wpa.myjantes.fr>",
        to: email,
        subject: `Dossier comptable MyJantes — ${startDate} au ${endDate}`,
        text: `Bonjour,\n\nVoici le résumé du dossier comptable :\n\n${summary}\n\nPour le dossier complet, connectez-vous à l'espace administration MyJantes.`,
        html: `<p>Bonjour,</p><p>Voici le résumé du dossier comptable pour la période <strong>${startDate}</strong> au <strong>${endDate}</strong> :</p><ul><li>Écritures totales : <strong>${entries.length}</strong></li><li>Validées : <strong>${entries.filter(e => e.isValidated).length}</strong></li><li>Brouillons : <strong>${entries.filter(e => !e.isValidated).length}</strong></li></ul><p style="font-size:11px;color:#888">MyJantes — Module Comptabilité</p>`,
      });

      res.json({ ok: true, to: email });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/admin/accounting/backfill-invoices", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageId = (req.user?.role === "superadmin" || req.user?.role === "root") ? undefined : req.user?.garageId;
      const allInvoices = await storage.getInvoices(undefined, garageId);
      const paidInvoices = allInvoices.filter(inv => inv.status === "paid");
      
      const existingEntries = await storage.getAccountingEntries(garageId, { sourceType: "invoice" });
      const existingInvoiceIds = new Set(existingEntries.map(e => e.sourceId));
      
      const invoicesToBackfill = paidInvoices.filter(inv => !existingInvoiceIds.has(inv.id));
      
      let createdCount = 0;
      for (const invoice of invoicesToBackfill) {
        try {
          const year = new Date(invoice.paidAt || invoice.createdAt || new Date()).getFullYear();
          const entryNumber = await storage.getNextEntryNumber(year);
          const ttc = parseFloat(invoice.amount || "0");
          const tva = parseFloat(invoice.taxAmount || "0");
          const ht = invoice.priceExcludingTax ? parseFloat(invoice.priceExcludingTax) : (ttc - tva);
          const paymentMethod = invoice.paymentMethod || "wire_transfer";
          const bankAccount = paymentMethod === "cash" ? "530000" : "512000";
          const bankLabel = paymentMethod === "cash" ? "Caisse" : "Banque";

          const entry = await storage.createAccountingEntry({
            garageId: invoice.garageId || null,
            entryNumber,
            date: invoice.paidAt || invoice.createdAt || new Date(),
            journal: "sales",
            sourceType: "invoice",
            sourceId: invoice.id,
            description: `Facture ${invoice.invoiceNumber} payée (backfill)`,
            totalDebit: String(ttc),
            totalCredit: String(ttc),
          });

          await storage.createAccountingLine({
            entryId: entry.id,
            accountCode: bankAccount,
            accountLabel: bankLabel,
            description: `Encaissement facture ${invoice.invoiceNumber}`,
            debit: String(ttc),
            credit: "0",
          });

          await storage.createAccountingLine({
            entryId: entry.id,
            accountCode: "706000",
            accountLabel: "Prestations de services",
            description: `Vente ${invoice.invoiceNumber}`,
            debit: "0",
            credit: String(ht),
          });

          if (tva > 0) {
            await storage.createAccountingLine({
              entryId: entry.id,
              accountCode: "445710",
              accountLabel: "TVA collectée",
              description: `TVA facture ${invoice.invoiceNumber}`,
              debit: "0",
              credit: String(tva),
            });
          }
          createdCount++;
        } catch (err) {
          console.error(`Error backfilling invoice ${invoice.id}:`, err);
        }
      }
      
      res.json({ message: `${createdCount} écritures comptables générées pour les factures existantes.`, count: createdCount });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // TVA Report
  app.get("/api/admin/accounting/tva-report", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageId = (req.user?.role === "superadmin" || req.user?.role === "root") ? undefined : req.user?.garageId;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(new Date().getFullYear(), 0, 1);
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

      const allInvoices = await storage.getInvoices(undefined, garageId);
      const allExpenses = await storage.getExpenses(garageId);
      const allCreditNotes = await storage.getCreditNotes(garageId);

      const filteredInvoices = allInvoices.filter(inv => {
        const d = new Date(inv.createdAt || 0);
        return d >= startDate && d <= endDate && inv.status === "paid";
      });

      const filteredExpenses = allExpenses.filter(exp => {
        const d = new Date(exp.date);
        return d >= startDate && d <= endDate && exp.status === "paid";
      });

      const filteredCreditNotes = allCreditNotes.filter(cn => {
        const d = new Date(cn.createdAt || 0);
        return d >= startDate && d <= endDate && (cn.status === "issued" || cn.status === "refunded");
      });

      // TVA collectée (from sales invoices)
      let tvaCollected = 0;
      let salesHT = 0;
      for (const inv of filteredInvoices) {
        tvaCollected += parseFloat(inv.taxAmount || "0");
        salesHT += inv.priceExcludingTax
          ? parseFloat(inv.priceExcludingTax)
          : (parseFloat(inv.amount || "0") - parseFloat(inv.taxAmount || "0"));
      }

      // TVA déductible (from expenses)
      let tvaDeductible = 0;
      let purchasesHT = 0;
      for (const exp of filteredExpenses) {
        tvaDeductible += parseFloat(exp.taxAmount || "0");
        purchasesHT += parseFloat(exp.amountHT || "0");
      }

      // TVA avoirs
      let tvaCreditNotes = 0;
      for (const cn of filteredCreditNotes) {
        tvaCreditNotes += parseFloat(cn.taxAmount || "0");
      }

      const tvaNet = tvaCollected - tvaDeductible - tvaCreditNotes;

      // Breakdown by rate
      const tvaByRate: Record<string, { collected: number; deductible: number; net: number }> = {};
      for (const inv of filteredInvoices) {
        const rate = inv.taxRate || "20.00";
        if (!tvaByRate[rate]) tvaByRate[rate] = { collected: 0, deductible: 0, net: 0 };
        tvaByRate[rate].collected += parseFloat(inv.taxAmount || "0");
      }
      for (const exp of filteredExpenses) {
        const rate = exp.taxRate || "20.00";
        if (!tvaByRate[rate]) tvaByRate[rate] = { collected: 0, deductible: 0, net: 0 };
        tvaByRate[rate].deductible += parseFloat(exp.taxAmount || "0");
      }
      for (const rate of Object.keys(tvaByRate)) {
        tvaByRate[rate].net = tvaByRate[rate].collected - tvaByRate[rate].deductible;
      }

      res.json({
        period: { startDate, endDate },
        salesHT,
        purchasesHT,
        tvaCollected,
        tvaDeductible,
        tvaCreditNotes,
        tvaNet,
        tvaByRate,
        invoiceCount: filteredInvoices.length,
        expenseCount: filteredExpenses.length,
        creditNoteCount: filteredCreditNotes.length,
      });
    } catch (error: any) {
      console.error("Error generating TVA report:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Profit & Loss (Compte de résultat)
  app.get("/api/admin/accounting/profit-loss", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageId = (req.user?.role === "superadmin" || req.user?.role === "root") ? undefined : req.user?.garageId;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(new Date().getFullYear(), 0, 1);
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

      const allInvoices = await storage.getInvoices(undefined, garageId);
      const allExpenses = await storage.getExpenses(garageId);
      const allCreditNotes = await storage.getCreditNotes(garageId);
      const categories = await storage.getExpenseCategories(garageId);

      const filteredInvoices = allInvoices.filter(inv => {
        const d = new Date(inv.createdAt || 0);
        return d >= startDate && d <= endDate && inv.status === "paid";
      });

      const filteredExpenses = allExpenses.filter(exp => {
        const d = new Date(exp.date);
        return d >= startDate && d <= endDate && exp.status === "paid";
      });

      const filteredCreditNotes = allCreditNotes.filter(cn => {
        const d = new Date(cn.createdAt || 0);
        return d >= startDate && d <= endDate && (cn.status === "issued" || cn.status === "refunded");
      });

      // Revenue (Produits)
      let totalRevenue = 0;
      const revenueByMonth: Record<string, number> = {};
      for (const inv of filteredInvoices) {
        const ht = parseFloat(inv.priceExcludingTax || inv.amount || "0");
        totalRevenue += ht;
        const month = new Date(inv.createdAt || 0).toISOString().slice(0, 7);
        revenueByMonth[month] = (revenueByMonth[month] || 0) + ht;
      }

      // Credit note adjustments
      let totalCreditNotes = 0;
      for (const cn of filteredCreditNotes) {
        totalCreditNotes += parseFloat(cn.totalHT || "0");
      }

      // Expenses by category
      let totalExpenses = 0;
      const expensesByCategory: Record<string, { name: string; total: number; count: number }> = {};
      const expensesByMonth: Record<string, number> = {};
      for (const exp of filteredExpenses) {
        const ht = parseFloat(exp.amountHT || "0");
        totalExpenses += ht;
        const month = new Date(exp.date).toISOString().slice(0, 7);
        expensesByMonth[month] = (expensesByMonth[month] || 0) + ht;

        const catName = exp.categoryId
          ? categories.find(c => c.id === exp.categoryId)?.name || "Autre"
          : "Non catégorisé";
        if (!expensesByCategory[catName]) expensesByCategory[catName] = { name: catName, total: 0, count: 0 };
        expensesByCategory[catName].total += ht;
        expensesByCategory[catName].count++;
      }

      const netRevenue = totalRevenue - totalCreditNotes;
      const netProfit = netRevenue - totalExpenses;
      const margin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

      res.json({
        period: { startDate, endDate },
        revenue: { total: totalRevenue, creditNotes: totalCreditNotes, net: netRevenue, byMonth: revenueByMonth },
        expenses: { total: totalExpenses, byCategory: Object.values(expensesByCategory), byMonth: expensesByMonth },
        netProfit,
        margin: Math.round(margin * 100) / 100,
        invoiceCount: filteredInvoices.length,
        expenseCount: filteredExpenses.length,
      });
    } catch (error: any) {
      console.error("Error generating P&L report:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Cash Flow
  app.get("/api/admin/accounting/cash-flow", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageId = (req.user?.role === "superadmin" || req.user?.role === "root") ? undefined : req.user?.garageId;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(new Date().getFullYear(), 0, 1);
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

      const allInvoices = await storage.getInvoices(undefined, garageId);
      const allExpenses = await storage.getExpenses(garageId);

      const paidInvoices = allInvoices.filter(inv => {
        const d = new Date(inv.paidAt || inv.createdAt || 0);
        return d >= startDate && d <= endDate && inv.status === "paid";
      });

      const paidExpenses = allExpenses.filter(exp => {
        const d = new Date(exp.date);
        return d >= startDate && d <= endDate && exp.status === "paid";
      });

      // Build monthly cash flow
      const cashFlowByMonth: Record<string, { month: string; inflows: number; outflows: number; net: number }> = {};

      for (const inv of paidInvoices) {
        const month = new Date(inv.paidAt || inv.createdAt || 0).toISOString().slice(0, 7);
        if (!cashFlowByMonth[month]) cashFlowByMonth[month] = { month, inflows: 0, outflows: 0, net: 0 };
        cashFlowByMonth[month].inflows += parseFloat(inv.amount || "0");
      }

      for (const exp of paidExpenses) {
        const month = new Date(exp.date).toISOString().slice(0, 7);
        if (!cashFlowByMonth[month]) cashFlowByMonth[month] = { month, inflows: 0, outflows: 0, net: 0 };
        cashFlowByMonth[month].outflows += parseFloat(exp.amountTTC || "0");
      }

      for (const key of Object.keys(cashFlowByMonth)) {
        cashFlowByMonth[key].net = cashFlowByMonth[key].inflows - cashFlowByMonth[key].outflows;
      }

      const sortedMonths = Object.values(cashFlowByMonth).sort((a, b) => a.month.localeCompare(b.month));

      const totalInflows = sortedMonths.reduce((s, m) => s + m.inflows, 0);
      const totalOutflows = sortedMonths.reduce((s, m) => s + m.outflows, 0);

      // By payment method
      const inflowsByMethod: Record<string, number> = {};
      for (const inv of paidInvoices) {
        const method = inv.paymentMethod || "other";
        inflowsByMethod[method] = (inflowsByMethod[method] || 0) + parseFloat(inv.amount || "0");
      }

      const outflowsByMethod: Record<string, number> = {};
      for (const exp of paidExpenses) {
        const method = exp.paymentMethod || "other";
        outflowsByMethod[method] = (outflowsByMethod[method] || 0) + parseFloat(exp.amountTTC || "0");
      }

      res.json({
        period: { startDate, endDate },
        totalInflows,
        totalOutflows,
        netCashFlow: totalInflows - totalOutflows,
        byMonth: sortedMonths,
        inflowsByMethod,
        outflowsByMethod,
      });
    } catch (error: any) {
      console.error("Error generating cash flow:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // FEC Export
  app.post("/api/admin/accounting/fec-export", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { startDate, endDate } = req.body;
      const garageId = (req.user?.role === "superadmin" || req.user?.role === "root") ? undefined : req.user?.garageId;

      const start = new Date(startDate);
      const end = new Date(endDate);

      const entries = await storage.getAccountingEntries(garageId, { startDate: start, endDate: end });

      // Build FEC format lines
      const fecLines: string[] = [];
      fecLines.push("JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|CompAuxNum|CompAuxLib|PieceRef|PieceDate|EcritureLib|Debit|Credit|EcritureLet|DateLet|ValidDate|Montantdevise|Idevise");

      for (const entry of entries) {
        const lines = await storage.getAccountingLines(entry.id);
        for (const line of lines) {
          const dateStr = new Date(entry.date).toISOString().slice(0, 10).replace(/-/g, '');
          fecLines.push([
            entry.journal?.toUpperCase() || "VE",
            entry.journal === "sales" ? "Journal des ventes" : entry.journal === "purchases" ? "Journal des achats" : entry.journal === "bank" ? "Journal de banque" : entry.journal === "cash" ? "Journal de caisse" : "Journal divers",
            entry.entryNumber,
            dateStr,
            line.accountCode,
            line.accountLabel,
            "",
            "",
            entry.sourceId || "",
            dateStr,
            line.description || entry.description,
            parseFloat(line.debit || "0").toFixed(2).replace('.', ','),
            parseFloat(line.credit || "0").toFixed(2).replace('.', ','),
            "",
            "",
            entry.isValidated ? dateStr : "",
            "",
            "EUR",
          ].join("|"));
        }
      }

      const fecContent = fecLines.join("\n");
      const fileName = `FEC_${start.toISOString().slice(0, 10)}_${end.toISOString().slice(0, 10)}.txt`;

      // Store export record
      await storage.createFecExport({
        garageId: garageId || null,
        periodStart: start,
        periodEnd: end,
        entryCount: entries.length,
        totalDebit: String(entries.reduce((s, e) => s + parseFloat(e.totalDebit || "0"), 0)),
        totalCredit: String(entries.reduce((s, e) => s + parseFloat(e.totalCredit || "0"), 0)),
        fileName,
        generatedBy: req.user.id,
      });

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(fecContent);
    } catch (error: any) {
      console.error("Error generating FEC export:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/accounting/fec-exports", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageId = (req.user?.role === "superadmin" || req.user?.role === "root") ? undefined : req.user?.garageId;
      const exports = await storage.getFecExports(garageId);
      res.json(exports);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== ACCOUNTING DOSSIER (Dossier Comptable Complet) =====

  app.get("/api/admin/accounting/dossier-validation", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageId = (req.user?.role === "superadmin" || req.user?.role === "root") ? undefined : req.user?.garageId;
      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), 0, 1);
      const end = endDate ? new Date(endDate as string) : new Date();

      const garage = garageId ? await storage.getGarage(garageId) : null;
      const invoices = await storage.getInvoices(garageId);
      const expenses = await storage.getExpenses(garageId);
      const creditNotes = await storage.getCreditNotes(garageId);
      const entries = await storage.getAccountingEntries(garageId, { startDate: start, endDate: end });

      const warnings: Array<{ severity: "error" | "warning" | "info"; category: string; message: string; count?: number }> = [];

      if (garage) {
        if (!garage.siret) warnings.push({ severity: "error", category: "garage", message: "SIRET du garage non renseigné" });
        if (!garage.tvaNumber) warnings.push({ severity: "error", category: "garage", message: "N° TVA intracommunautaire manquant" });
        if (!garage.address) warnings.push({ severity: "warning", category: "garage", message: "Adresse du garage manquante" });
        if (!garage.iban) warnings.push({ severity: "warning", category: "garage", message: "IBAN bancaire non renseigné" });
        if (!garage.legalForm) warnings.push({ severity: "info", category: "garage", message: "Forme juridique non renseignée" });
        if (!garage.capitalSocial) warnings.push({ severity: "info", category: "garage", message: "Capital social non renseigné" });
        if (!garage.nafCode) warnings.push({ severity: "info", category: "garage", message: "Code NAF non renseigné" });
        if (!garage.rcsCity) warnings.push({ severity: "info", category: "garage", message: "Ville RCS non renseignée" });
      }

      const invoicesWithoutClient = invoices.filter(i => !i.clientId);
      if (invoicesWithoutClient.length > 0) {
        warnings.push({ severity: "error", category: "invoices", message: "Factures sans client associé", count: invoicesWithoutClient.length });
      }

      const invoicesWithoutHT = invoices.filter(i => !i.priceExcludingTax || parseFloat(i.priceExcludingTax) === 0);
      if (invoicesWithoutHT.length > 0) {
        warnings.push({ severity: "warning", category: "invoices", message: "Factures sans montant HT", count: invoicesWithoutHT.length });
      }

      const invoicesWithoutDueDate = invoices.filter(i => !i.dueDate);
      if (invoicesWithoutDueDate.length > 0) {
        warnings.push({ severity: "warning", category: "invoices", message: "Factures sans date d'échéance", count: invoicesWithoutDueDate.length });
      }

      const invoicesWithoutPayment = invoices.filter(i => !i.paymentMethod);
      if (invoicesWithoutPayment.length > 0) {
        warnings.push({ severity: "info", category: "invoices", message: "Factures sans mode de paiement", count: invoicesWithoutPayment.length });
      }

      const expensesWithoutCategory = expenses.filter(e => !e.categoryId);
      if (expensesWithoutCategory.length > 0) {
        warnings.push({ severity: "warning", category: "expenses", message: "Dépenses sans catégorie", count: expensesWithoutCategory.length });
      }

      const expensesWithoutReceipt = expenses.filter(e => !e.attachmentPath);
      if (expensesWithoutReceipt.length > 0) {
        warnings.push({ severity: "info", category: "expenses", message: "Dépenses sans justificatif", count: expensesWithoutReceipt.length });
      }

      const unvalidatedEntries = entries.filter(e => !e.isValidated);
      if (unvalidatedEntries.length > 0) {
        warnings.push({ severity: "warning", category: "entries", message: "Écritures comptables non validées", count: unvalidatedEntries.length });
      }

      const creditNotesWithoutInvoice = creditNotes.filter(cn => !cn.invoiceId);
      if (creditNotesWithoutInvoice.length > 0) {
        warnings.push({ severity: "warning", category: "creditNotes", message: "Avoirs sans facture associée", count: creditNotesWithoutInvoice.length });
      }

      const errorCount = warnings.filter(w => w.severity === "error").length;
      const warningCount = warnings.filter(w => w.severity === "warning").length;
      const infoCount = warnings.filter(w => w.severity === "info").length;

      const summary = {
        invoiceCount: invoices.length,
        expenseCount: expenses.length,
        creditNoteCount: creditNotes.length,
        entryCount: entries.length,
        validatedEntryCount: entries.filter(e => e.isValidated).length,
      };

      res.json({ warnings, errorCount, warningCount, infoCount, summary, isReady: errorCount === 0 });
    } catch (error: any) {
      console.error("Error validating dossier:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/accounting/dossier-export", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { startDate, endDate } = req.body;
      const garageId = (req.user?.role === "superadmin" || req.user?.role === "root") ? undefined : req.user?.garageId;
      const start = new Date(startDate);
      const end = new Date(endDate);
      const garage = garageId ? await storage.getGarage(garageId) : null;

      const invoices = await storage.getInvoices(garageId);
      const expenses = await storage.getExpenses(garageId);
      const creditNotes = await storage.getCreditNotes(garageId);
      const entries = await storage.getAccountingEntries(garageId, { startDate: start, endDate: end });

      const periodInvoices = invoices.filter(i => {
        const d = i.createdAt ? new Date(i.createdAt) : null;
        return d && d >= start && d <= end;
      });
      const periodExpenses = expenses.filter(e => {
        const d = e.date ? new Date(e.date) : null;
        return d && d >= start && d <= end;
      });
      const periodCreditNotes = creditNotes.filter(cn => {
        const d = cn.createdAt ? new Date(cn.createdAt) : null;
        return d && d >= start && d <= end;
      });

      const totalRevenueHT = periodInvoices.reduce((s, i) => s + parseFloat(i.priceExcludingTax || "0"), 0);
      const totalRevenueTTC = periodInvoices.reduce((s, i) => s + parseFloat(i.amount || "0"), 0);
      const totalTVACollected = periodInvoices.reduce((s, i) => s + parseFloat(i.taxAmount || "0"), 0);
      const totalExpensesHT = periodExpenses.reduce((s, e) => s + parseFloat(e.amountHT || "0"), 0);
      const totalExpensesTTC = periodExpenses.reduce((s, e) => s + parseFloat(e.amountTTC || "0"), 0);
      const totalTVADeductible = periodExpenses.reduce((s, e) => s + parseFloat(e.taxAmount || "0"), 0);
      const totalCreditNotesHT = periodCreditNotes.reduce((s, cn) => s + parseFloat(cn.totalHT || "0"), 0);

      const dossierContent = [];
      dossierContent.push("═══════════════════════════════════════════════════════════════");
      dossierContent.push("              DOSSIER COMPTABLE COMPLET");
      dossierContent.push("═══════════════════════════════════════════════════════════════");
      dossierContent.push("");
      dossierContent.push(`Période : du ${start.toLocaleDateString("fr-FR")} au ${end.toLocaleDateString("fr-FR")}`);
      dossierContent.push(`Généré le : ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR")}`);
      dossierContent.push("");

      if (garage) {
        dossierContent.push("───────────────────────────────────────────────────────────────");
        dossierContent.push("1. IDENTIFICATION DE L'ENTREPRISE");
        dossierContent.push("───────────────────────────────────────────────────────────────");
        dossierContent.push(`Raison sociale    : ${garage.name || "Non renseigné"}`);
        dossierContent.push(`SIRET             : ${garage.siret || "Non renseigné"}`);
        dossierContent.push(`N° TVA            : ${garage.tvaNumber || "Non renseigné"}`);
        dossierContent.push(`Adresse           : ${garage.address || "Non renseigné"}`);
        dossierContent.push(`Téléphone         : ${garage.phone || "Non renseigné"}`);
        dossierContent.push(`Email             : ${garage.email || "Non renseigné"}`);
        dossierContent.push(`Forme juridique   : ${garage.legalForm || "Non renseigné"}`);
        dossierContent.push(`Capital social    : ${garage.capitalSocial || "Non renseigné"}`);
        dossierContent.push(`Code NAF          : ${garage.nafCode || "Non renseigné"}`);
        dossierContent.push(`RCS               : ${garage.rcsCity || "Non renseigné"}`);
        dossierContent.push(`IBAN              : ${garage.iban || "Non renseigné"}`);
        dossierContent.push(`BIC/SWIFT         : ${garage.swift || "Non renseigné"}`);
        dossierContent.push("");
      }

      dossierContent.push("───────────────────────────────────────────────────────────────");
      dossierContent.push("2. COMPTE DE RÉSULTAT SIMPLIFIÉ");
      dossierContent.push("───────────────────────────────────────────────────────────────");
      dossierContent.push(`Chiffre d'affaires HT        : ${totalRevenueHT.toFixed(2)} €`);
      dossierContent.push(`Avoirs émis                   : -${totalCreditNotesHT.toFixed(2)} €`);
      dossierContent.push(`CA net HT                     : ${(totalRevenueHT - totalCreditNotesHT).toFixed(2)} €`);
      dossierContent.push(`Charges HT                    : -${totalExpensesHT.toFixed(2)} €`);
      dossierContent.push(`Résultat net                  : ${(totalRevenueHT - totalCreditNotesHT - totalExpensesHT).toFixed(2)} €`);
      dossierContent.push(`Marge (%)                     : ${totalRevenueHT > 0 ? ((1 - totalExpensesHT / totalRevenueHT) * 100).toFixed(1) : "0.0"}%`);
      dossierContent.push("");

      dossierContent.push("───────────────────────────────────────────────────────────────");
      dossierContent.push("3. DÉCLARATION DE TVA");
      dossierContent.push("───────────────────────────────────────────────────────────────");
      dossierContent.push(`TVA collectée (ventes)        : ${totalTVACollected.toFixed(2)} €`);
      dossierContent.push(`TVA déductible (achats)       : ${totalTVADeductible.toFixed(2)} €`);
      dossierContent.push(`TVA nette à payer             : ${(totalTVACollected - totalTVADeductible).toFixed(2)} €`);
      dossierContent.push("");

      dossierContent.push("───────────────────────────────────────────────────────────────");
      dossierContent.push("4. SYNTHÈSE DES OPÉRATIONS");
      dossierContent.push("───────────────────────────────────────────────────────────────");
      dossierContent.push(`Factures émises               : ${periodInvoices.length}`);
      dossierContent.push(`  - Total HT                  : ${totalRevenueHT.toFixed(2)} €`);
      dossierContent.push(`  - Total TTC                 : ${totalRevenueTTC.toFixed(2)} €`);
      dossierContent.push(`Dépenses enregistrées         : ${periodExpenses.length}`);
      dossierContent.push(`  - Total HT                  : ${totalExpensesHT.toFixed(2)} €`);
      dossierContent.push(`  - Total TTC                 : ${totalExpensesTTC.toFixed(2)} €`);
      dossierContent.push(`Avoirs émis                   : ${periodCreditNotes.length}`);
      dossierContent.push(`  - Total HT                  : ${totalCreditNotesHT.toFixed(2)} €`);
      dossierContent.push(`Écritures comptables          : ${entries.length}`);
      dossierContent.push(`  - Validées                  : ${entries.filter(e => e.isValidated).length}`);
      dossierContent.push(`  - Brouillons                : ${entries.filter(e => !e.isValidated).length}`);
      dossierContent.push("");

      dossierContent.push("───────────────────────────────────────────────────────────────");
      dossierContent.push("5. DÉTAIL DES FACTURES");
      dossierContent.push("───────────────────────────────────────────────────────────────");
      for (const inv of periodInvoices.slice(0, 200)) {
        const client = inv.clientId ? await storage.getUser(inv.clientId) : null;
        const clientName = client ? `${client.firstName || ""} ${client.lastName || ""}`.trim() || client.email : "Inconnu";
        dossierContent.push(`${inv.invoiceNumber || "N/A"} | ${inv.createdAt ? new Date(inv.createdAt).toLocaleDateString("fr-FR") : "N/A"} | ${clientName} | HT: ${parseFloat(inv.priceExcludingTax || "0").toFixed(2)}€ | TTC: ${parseFloat(inv.amount || "0").toFixed(2)}€ | ${inv.status || "N/A"}`);
      }
      dossierContent.push("");

      dossierContent.push("───────────────────────────────────────────────────────────────");
      dossierContent.push("6. DÉTAIL DES DÉPENSES");
      dossierContent.push("───────────────────────────────────────────────────────────────");
      for (const exp of periodExpenses.slice(0, 200)) {
        dossierContent.push(`${exp.expenseNumber || "N/A"} | ${exp.date ? new Date(exp.date).toLocaleDateString("fr-FR") : "N/A"} | ${exp.vendor || "N/A"} | ${exp.description || "N/A"} | HT: ${parseFloat(exp.amountHT || "0").toFixed(2)}€ | TTC: ${parseFloat(exp.amountTTC || "0").toFixed(2)}€`);
      }
      dossierContent.push("");

      if (periodCreditNotes.length > 0) {
        dossierContent.push("───────────────────────────────────────────────────────────────");
        dossierContent.push("7. DÉTAIL DES AVOIRS");
        dossierContent.push("───────────────────────────────────────────────────────────────");
        for (const cn of periodCreditNotes.slice(0, 200)) {
          const client = cn.clientId ? await storage.getUser(cn.clientId) : null;
          const clientName = client ? `${client.firstName || ""} ${client.lastName || ""}`.trim() || client.email : "Inconnu";
          dossierContent.push(`${cn.creditNoteNumber || "N/A"} | ${cn.createdAt ? new Date(cn.createdAt).toLocaleDateString("fr-FR") : "N/A"} | ${clientName} | ${cn.reason || "N/A"} | HT: ${parseFloat(cn.totalHT || "0").toFixed(2)}€`);
        }
        dossierContent.push("");
      }

      dossierContent.push("═══════════════════════════════════════════════════════════════");
      dossierContent.push("Fin du dossier comptable");
      dossierContent.push("═══════════════════════════════════════════════════════════════");

      const content = dossierContent.join("\n");
      const fileName = `Dossier_Comptable_${start.toISOString().slice(0, 10)}_${end.toISOString().slice(0, 10)}.txt`;

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(content);
    } catch (error: any) {
      console.error("Error generating dossier export:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ===== NOTIFICATION RULES (Rappels & Notifications paramétrables) =====

  app.get("/api/admin/notification-rules", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageId = (req.user?.role === "superadmin" || req.user?.role === "root") ? undefined : req.user?.garageId;
      const rules = await storage.getNotificationRules(garageId);
      res.json(rules);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/notification-rules/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const rule = await storage.getNotificationRule(req.params.id);
      if (!rule) return res.status(404).json({ message: "Règle non trouvée" });
      res.json(rule);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/notification-rules", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageId = req.user?.role === "superadmin" ? req.body.garageId : req.user?.garageId;
      const rule = await storage.createNotificationRule({ ...req.body, garageId });
      res.json(rule);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/notification-rules/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const rule = await storage.updateNotificationRule(req.params.id, req.body);
      res.json(rule);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/admin/notification-rules/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      await storage.deleteNotificationRule(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== EXTERNAL APIs (Connexions API externes) =====

  const externalApiValidation = z.object({
    name: z.string().min(1, "Nom requis").max(255),
    baseUrl: z.string().url("URL invalide").refine(url => url.startsWith("http://") || url.startsWith("https://"), "L'URL doit commencer par http:// ou https://"),
    description: z.string().nullable().optional(),
    authType: z.enum(["none", "api_key", "bearer", "basic"]).default("none"),
    authConfig: z.record(z.string()).optional().default({}),
    defaultHeaders: z.record(z.string()).optional().default({}),
    discoveredRoutes: z.any().optional(),
    openApiSpec: z.any().optional(),
    isActive: z.boolean().optional(),
  });

  function maskApiSecrets(api: any) {
    const masked = { ...api };
    if (masked.authConfig && typeof masked.authConfig === "object") {
      const config = { ...masked.authConfig };
      if (config.token) config.token = config.token.slice(0, 6) + "••••••";
      if (config.key) config.key = config.key.slice(0, 6) + "••••••";
      if (config.password) config.password = "••••••";
      masked.authConfig = config;
    }
    return masked;
  }

  app.get("/api/admin/external-apis", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const apis = await storage.getExternalApis();
      res.json(apis.map(maskApiSecrets));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/external-apis/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const api = await storage.getExternalApi(req.params.id);
      if (!api) return res.status(404).json({ message: "API non trouvée" });
      res.json(maskApiSecrets(api));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/external-apis", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const validated = externalApiValidation.parse(req.body);
      const api = await storage.createExternalApi(validated as any);
      res.json(maskApiSecrets(api));
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ message: error.errors[0]?.message || "Données invalides" });
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/external-apis/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const partial = externalApiValidation.partial().parse(req.body);
      const api = await storage.updateExternalApi(req.params.id, partial as any);
      res.json(maskApiSecrets(api));
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ message: error.errors[0]?.message || "Données invalides" });
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/admin/external-apis/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      await storage.deleteExternalApi(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/external-apis/:id/discover", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const api = await storage.getExternalApi(req.params.id);
      if (!api) return res.status(404).json({ message: "API non trouvée" });

      const authHeaders: Record<string, string> = {};
      const config = (api.authConfig || {}) as Record<string, string>;
      if (api.authType === "bearer" && config.token) {
        authHeaders["Authorization"] = `Bearer ${config.token}`;
      } else if (api.authType === "api_key" && config.key && config.headerName) {
        authHeaders[config.headerName] = config.key;
      } else if (api.authType === "basic" && config.username && config.password) {
        authHeaders["Authorization"] = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
      }

      const defaultH = (api.defaultHeaders || {}) as Record<string, string>;
      const headers = { ...defaultH, ...authHeaders, "Accept": "application/json" };

      const specPaths = [
        "/openapi.json", "/swagger.json", "/api-docs", "/docs/openapi.json",
        "/v1/openapi.json", "/v2/openapi.json", "/v3/openapi.json",
        "/api/openapi.json", "/api/swagger.json", "/.well-known/openapi.json",
        "/openapi.yaml", "/swagger.yaml",
      ];

      let spec: any = null;
      let specUrl = "";

      for (const path of specPaths) {
        try {
          const url = api.baseUrl.replace(/\/$/, "") + path;
          const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
          if (r.ok) {
            const contentType = r.headers.get("content-type") || "";
            if (contentType.includes("json") || contentType.includes("yaml") || contentType.includes("text")) {
              const text = await r.text();
              try {
                spec = JSON.parse(text);
                specUrl = path;
                break;
              } catch {
                if (text.includes("openapi") || text.includes("swagger")) {
                  spec = { raw: text, format: "yaml" };
                  specUrl = path;
                  break;
                }
              }
            }
          }
        } catch {}
      }

      const routes: any[] = [];

      if (spec && spec.paths) {
        for (const [path, methods] of Object.entries(spec.paths as Record<string, any>)) {
          for (const [method, detail] of Object.entries(methods)) {
            if (["get", "post", "put", "patch", "delete", "options", "head"].includes(method)) {
              const d = detail as any;
              routes.push({
                method: method.toUpperCase(),
                path,
                summary: d.summary || d.description || "",
                operationId: d.operationId || "",
                tags: d.tags || [],
                parameters: (d.parameters || []).map((p: any) => ({
                  name: p.name,
                  in: p.in,
                  required: p.required || false,
                  type: p.schema?.type || "string",
                  description: p.description || "",
                })),
                requestBody: d.requestBody ? {
                  contentType: Object.keys(d.requestBody.content || {})[0] || "application/json",
                  schema: d.requestBody.content?.["application/json"]?.schema || null,
                  required: d.requestBody.required || false,
                } : null,
                responses: Object.entries(d.responses || {}).map(([code, resp]: [string, any]) => ({
                  code,
                  description: resp.description || "",
                })),
              });
            }
          }
        }
      }

      if (routes.length === 0) {
        const commonPaths = ["/", "/api", "/api/v1", "/health", "/status", "/ping", "/version", "/info"];
        for (const testPath of commonPaths) {
          try {
            const url = api.baseUrl.replace(/\/$/, "") + testPath;
            const r = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(5000) });
            if (r.ok || r.status < 500) {
              routes.push({
                method: "GET",
                path: testPath,
                summary: `Endpoint détecté (HTTP ${r.status})`,
                operationId: "",
                tags: ["discovered"],
                parameters: [],
                requestBody: null,
                responses: [{ code: String(r.status), description: r.statusText }],
              });
            }
          } catch {}
        }
      }

      await storage.updateExternalApi(api.id, {
        discoveredRoutes: routes,
        openApiSpec: spec ? { specUrl, info: spec.info || {}, serverCount: (spec.servers || []).length } : undefined,
      } as any);

      res.json({
        routesFound: routes.length,
        routes,
        specFound: !!spec,
        specUrl,
        specInfo: spec?.info || null,
      });
    } catch (error: any) {
      console.error("[ExternalAPI] Discovery error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/external-apis/:id/call", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const api = await storage.getExternalApi(req.params.id);
      if (!api) return res.status(404).json({ message: "API non trouvée" });

      const { method, path, body, queryParams, customHeaders } = req.body;
      if (!method || !path) return res.status(400).json({ message: "method et path requis" });

      const authHeaders: Record<string, string> = {};
      const config = (api.authConfig || {}) as Record<string, string>;
      if (api.authType === "bearer" && config.token) {
        authHeaders["Authorization"] = `Bearer ${config.token}`;
      } else if (api.authType === "api_key" && config.key && config.headerName) {
        authHeaders[config.headerName] = config.key;
      } else if (api.authType === "basic" && config.username && config.password) {
        authHeaders["Authorization"] = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
      }

      const defaultH = (api.defaultHeaders || {}) as Record<string, string>;
      const headers: Record<string, string> = {
        "Accept": "application/json",
        ...defaultH,
        ...authHeaders,
        ...(customHeaders || {}),
      };

      let url = api.baseUrl.replace(/\/$/, "") + path;
      if (queryParams && Object.keys(queryParams).length > 0) {
        const qs = new URLSearchParams(queryParams).toString();
        url += (url.includes("?") ? "&" : "?") + qs;
      }

      const fetchOpts: any = {
        method: method.toUpperCase(),
        headers,
        signal: AbortSignal.timeout(30000),
      };

      if (body && ["POST", "PUT", "PATCH"].includes(method.toUpperCase())) {
        fetchOpts.body = typeof body === "string" ? body : JSON.stringify(body);
        if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
      }

      const startTime = Date.now();
      const response = await fetch(url, fetchOpts);
      const duration = Date.now() - startTime;

      let responseBody: any;
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("json")) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      res.json({
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
        duration,
        url,
      });
    } catch (error: any) {
      console.error("[ExternalAPI] Call error:", error);
      res.status(500).json({ message: error.message, type: "proxy_error" });
    }
  });

  app.post("/api/admin/external-apis/:id/test-connection", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const api = await storage.getExternalApi(req.params.id);
      if (!api) return res.status(404).json({ message: "API non trouvée" });

      const authHeaders: Record<string, string> = {};
      const config = (api.authConfig || {}) as Record<string, string>;
      if (api.authType === "bearer" && config.token) {
        authHeaders["Authorization"] = `Bearer ${config.token}`;
      } else if (api.authType === "api_key" && config.key && config.headerName) {
        authHeaders[config.headerName] = config.key;
      } else if (api.authType === "basic" && config.username && config.password) {
        authHeaders["Authorization"] = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
      }

      const defaultH = (api.defaultHeaders || {}) as Record<string, string>;
      const headers = { ...defaultH, ...authHeaders, "Accept": "application/json" };

      const startTime = Date.now();
      const response = await fetch(api.baseUrl, { headers, signal: AbortSignal.timeout(10000) });
      const duration = Date.now() - startTime;

      res.json({
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        duration,
      });
    } catch (error: any) {
      res.json({
        success: false,
        status: 0,
        statusText: error.message,
        duration: 0,
      });
    }
  });

  // ===== E-INVOICING (Facturation Électronique) =====

  app.get("/api/admin/accounting/e-invoicing/compliance", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageId = (req.user?.role === "superadmin" || req.user?.role === "root") ? undefined : req.user?.garageId;
      const invoices = await storage.getInvoices(garageId);
      const garage = garageId ? await storage.getGarage(garageId) : null;

      console.log(`[E-Invoicing] Checking compliance for garage: ${garageId || 'All'} - Found ${invoices.length} invoices`);
      const complianceResults = await Promise.all(invoices.map(async (invoice: any) => {
        const client = await storage.getUser(invoice.clientId);
        const items = await storage.getInvoiceItems(invoice.id);
        const issues: string[] = [];

        if (!invoice.invoiceNumber) issues.push("Numéro de facture manquant");
        if (!invoice.createdAt) issues.push("Date de facture manquante");
        if (!invoice.clientId) issues.push("Client non renseigné");
        if (!client?.firstName && !client?.lastName && !client?.email) issues.push("Identité client incomplète");
        if (!client?.address) issues.push("Adresse client manquante");
        if (!invoice.amount || parseFloat(invoice.amount) <= 0) issues.push("Montant TTC manquant ou nul");
        if (!invoice.priceExcludingTax) issues.push("Montant HT manquant");
        if (!invoice.taxRate) issues.push("Taux de TVA manquant");
        if (!invoice.taxAmount) issues.push("Montant TVA manquant");
        if (!invoice.paymentMethod) issues.push("Mode de paiement manquant");
        if (!invoice.dueDate) issues.push("Date d'échéance manquante");
        if (items.length === 0 && !invoice.productDetails) issues.push("Aucune ligne de détail");

        if (garage) {
          if (!garage.siret) issues.push("SIRET du garage manquant");
          if (!garage.tvaNumber) issues.push("N° TVA intracommunautaire du garage manquant");
          if (!garage.address) issues.push("Adresse du garage manquante");
        }

        return {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          clientName: client ? `${client.firstName || ""} ${client.lastName || ""}`.trim() || client.email : "Inconnu",
          amount: invoice.amount,
          status: invoice.status,
          createdAt: invoice.createdAt,
          isCompliant: issues.length === 0,
          issues,
          issueCount: issues.length,
        };
      }));

      const totalInvoices = complianceResults.length;
      const compliantCount = complianceResults.filter(r => r.isCompliant).length;
      const nonCompliantCount = totalInvoices - compliantCount;
      const complianceRate = totalInvoices > 0 ? Math.round((compliantCount / totalInvoices) * 100) : 0;

      const commonIssues: Record<string, number> = {};
      complianceResults.forEach(r => {
        r.issues.forEach((issue: string) => {
          commonIssues[issue] = (commonIssues[issue] || 0) + 1;
        });
      });

      const garageCompliance = {
        hasSiret: !!garage?.siret,
        hasTvaNumber: !!garage?.tvaNumber,
        hasAddress: !!garage?.address,
        hasName: !!garage?.name,
        hasEmail: !!garage?.email,
        hasPhone: !!garage?.phone,
        hasIban: !!garage?.iban,
      };

      res.json({
        totalInvoices,
        compliantCount,
        nonCompliantCount,
        complianceRate,
        commonIssues: Object.entries(commonIssues).sort(([, a], [, b]) => b - a),
        invoices: complianceResults,
        garageCompliance,
      });
    } catch (error: any) {
      console.error("Error checking e-invoicing compliance:", error);
      res.status(500).json({ message: error.message });
    }
  });

  

  function escapeXml(str: string): string {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  // ===== ACCOUNTING AUTOMATION HELPERS =====

  async function createAccountingEntryForExpense(expense: any, user: any) {
    try {
      const year = new Date(expense.date).getFullYear();
      const entryNumber = await storage.getNextEntryNumber(year);

      const entry = await storage.createAccountingEntry({
        garageId: expense.garageId || null,
        entryNumber,
        date: new Date(expense.date),
        journal: "purchases",
        sourceType: "expense",
        sourceId: expense.id,
        description: `Dépense ${expense.expenseNumber} - ${expense.vendor}`,
        totalDebit: expense.amountTTC,
        totalCredit: expense.amountTTC,
      });

      // Debit: Expense account (6xxxxx)
      await storage.createAccountingLine({
        entryId: entry.id,
        accountCode: "606100",
        accountLabel: "Fournitures non stockables",
        description: expense.description || expense.vendor,
        debit: expense.amountHT,
        credit: "0",
        vatRate: expense.taxRate,
        vatAmount: expense.taxAmount,
      });

      // Debit: TVA déductible
      if (parseFloat(expense.taxAmount || "0") > 0) {
        await storage.createAccountingLine({
          entryId: entry.id,
          accountCode: "445660",
          accountLabel: "TVA déductible sur achats",
          description: `TVA ${expense.taxRate}%`,
          debit: expense.taxAmount,
          credit: "0",
        });
      }

      // Credit: Bank/Cash
      const bankAccount = expense.paymentMethod === "cash" ? "530000" : "512000";
      const bankLabel = expense.paymentMethod === "cash" ? "Caisse" : "Banque";
      await storage.createAccountingLine({
        entryId: entry.id,
        accountCode: bankAccount,
        accountLabel: bankLabel,
        description: `Règlement ${expense.expenseNumber}`,
        debit: "0",
        credit: expense.amountTTC,
      });
    } catch (error) {
      console.error("Error creating accounting entry for expense:", error);
    }
  }

  async function createAccountingEntryForCreditNote(creditNote: any, user: any) {
    try {
      const year = new Date().getFullYear();
      const entryNumber = await storage.getNextEntryNumber(year);

      const entry = await storage.createAccountingEntry({
        garageId: creditNote.garageId || null,
        entryNumber,
        date: new Date(),
        journal: "sales",
        sourceType: "credit_note",
        sourceId: creditNote.id,
        description: `Avoir ${creditNote.creditNoteNumber}`,
        totalDebit: creditNote.totalTTC,
        totalCredit: creditNote.totalTTC,
      });

      // Debit: Sales revenue (reverse)
      await storage.createAccountingLine({
        entryId: entry.id,
        accountCode: "706000",
        accountLabel: "Prestations de services",
        description: `Avoir ${creditNote.creditNoteNumber}`,
        debit: creditNote.totalHT,
        credit: "0",
      });

      if (parseFloat(creditNote.taxAmount || "0") > 0) {
        await storage.createAccountingLine({
          entryId: entry.id,
          accountCode: "445710",
          accountLabel: "TVA collectée",
          description: `TVA avoir ${creditNote.taxRate}%`,
          debit: creditNote.taxAmount,
          credit: "0",
        });
      }

      // Credit: Client account
      await storage.createAccountingLine({
        entryId: entry.id,
        accountCode: "411000",
        accountLabel: "Clients",
        description: `Avoir client ${creditNote.creditNoteNumber}`,
        debit: "0",
        credit: creditNote.totalTTC,
      });
    } catch (error) {
      console.error("Error creating accounting entry for credit note:", error);
    }
  }

  // ========== AR WHEEL DETECTION ==========
  const multerImport = await import("multer");
  const multerUpload = multerImport.default({ storage: multerImport.default.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

  app.post("/api/ar/detect-wheels", isAuthenticated, multerUpload.single("image"), async (req: any, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ message: "Aucune image fournie" });

      const base64 = file.buffer.toString("base64");
      const mimeType = file.mimetype || "image/jpeg";

      const GROK_KEY_AR = process.env.GROK_API_KEY || "";
      if (!GROK_KEY_AR) throw new Error("Clé API Grok manquante (GROK_API_KEY)");

      const prompt = `Analyse cette photo de voiture et identifie les positions des roues/jantes visibles.
Pour chaque roue visible, retourne ses coordonnées normalisées (entre 0 et 1) par rapport à l'image:
- x: position horizontale du centre de la roue (0 = gauche, 1 = droite)
- y: position verticale du centre de la roue (0 = haut, 1 = bas)
- radius: rayon approximatif de la roue en proportion de la largeur de l'image

Réponds UNIQUEMENT en JSON valide avec ce format exact:
{"positions": [{"x": 0.25, "y": 0.7, "radius": 0.08}, {"x": 0.75, "y": 0.7, "radius": 0.08}]}

Si ce n'est pas une photo de voiture ou si aucune roue n'est visible, réponds: {"positions": []}`;

      const response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GROK_KEY_AR}`,
        },
        body: JSON.stringify({
          model: "grok-2-vision-1212",
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
              { type: "text", text: prompt },
            ],
          }],
          temperature: 0.1,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        throw new Error(`Grok API error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "";
      
      const jsonMatch = text.match(/\{[\s\S]*"positions"[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        if (Array.isArray(result.positions)) {
          result.positions = result.positions
            .filter((p: any) => typeof p.x === "number" && typeof p.y === "number")
            .map((p: any) => ({
              x: Math.max(0, Math.min(1, p.x)),
              y: Math.max(0, Math.min(1, p.y)),
              radius: Math.max(0.03, Math.min(0.3, p.radius || 0.08)),
            }));
        }
        res.json(result);
      } else {
        res.json({ positions: [] });
      }
    } catch (error: any) {
      console.error("[AR] Wheel detection error:", error.message);
      res.json({ positions: [] });
    }
  });

  // ========== OCR DOCUMENT SCANNER (MINDEE) ==========

  app.post("/api/ocr/scan", isAuthenticated, isAdmin, multerUpload.single("file"), async (req: any, res) => {
    try {
      const file = req.file;
      const documentType = req.body.documentType || "invoice";

      if (!file) {
        return res.status(400).json({ message: "Aucun fichier fourni" });
      }

      const fsOcr = await import("fs");
      const pathOcr = await import("path");
      const uploadsDir = pathOcr.default.join(process.cwd(), "uploads", "ocr");
      if (!fsOcr.default.existsSync(uploadsDir)) {
        fsOcr.default.mkdirSync(uploadsDir, { recursive: true });
      }
      const ext = pathOcr.default.extname(file.originalname) || ".jpg";
      const localFileName = `ocr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      const localFilePath = pathOcr.default.join(uploadsDir, localFileName);
      fsOcr.default.writeFileSync(localFilePath, file.buffer);
      console.log(`[OCR] Fichier sauvegardé localement: ${localFilePath}`);

      const apiKey = process.env.MINDEE_API_KEY_PROD || process.env.MINDEE_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ message: "Clé API Mindee non configurée" });
      }

      const mindee = await import("mindee");
      const mindeeClient = new mindee.Client({ apiKey });
      const inputSource = await mindeeClient.docFromPath(localFilePath);

      let result: any;

      switch (documentType) {
        case "invoice": {
          const response = await mindeeClient.parse(mindee.product.InvoiceV4, inputSource);
          const pred = response.document.inference.prediction;
          result = {
            type: "invoice",
            invoiceNumber: pred.invoiceNumber?.value || null,
            invoiceDate: pred.date?.value || null,
            dueDate: pred.dueDate?.value || null,
            totalAmount: pred.totalAmount?.value || null,
            totalNet: pred.totalNet?.value || null,
            totalTax: pred.totalTax?.value || null,
            supplierName: pred.supplierName?.value || null,
            supplierAddress: pred.supplierAddress?.value || null,
            customerName: pred.customerName?.value || null,
            customerAddress: pred.customerAddress?.value || null,
            lineItems: (pred.lineItems || []).map((item: any) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalAmount: item.totalAmount,
              taxRate: item.taxRate,
            })),
            raw: response.document.toString(),
          };
          break;
        }
        case "carte_grise": {
          const response = await mindeeClient.parse(mindee.product.fr.CarteGriseV1, inputSource);
          const pred = response.document.inference.prediction;
          result = {
            type: "carte_grise",
            registrationNumber: pred.a?.value || null,
            firstRegistrationDate: pred.b?.value || null,
            ownerFullName: pred.c1?.value || null,
            ownerAddress: pred.c3?.value || null,
            ownerFirstName: pred.ownerFirstName?.value || null,
            ownerSurname: pred.ownerSurname?.value || null,
            make: pred.d1?.value || null,
            model: pred.d3?.value || null,
            vin: pred.e?.value || null,
            formula: pred.formulaNumber?.value || null,
            category: pred.j?.value || null,
            fuelType: pred.p3?.value || null,
            fiscalPower: pred.p6?.value || null,
            raw: response.document.toString(),
          };
          break;
        }
        case "id_card": {
          const response = await mindeeClient.parse(mindee.product.fr.IdCardV2, inputSource);
          const pred = response.document.inference.prediction;
          result = {
            type: "id_card",
            documentNumber: pred.documentNumber?.value || null,
            givenNames: (pred.givenNames || []).map((n: any) => n.value),
            surname: pred.surname?.value || null,
            birthDate: pred.birthDate?.value || null,
            birthPlace: pred.birthPlace?.value || null,
            expiryDate: pred.expiryDate?.value || null,
            issueDate: pred.issueDate?.value || null,
            authority: pred.authority?.value || null,
            gender: pred.gender?.value || null,
            nationality: pred.nationality?.value || null,
            mrz1: pred.mrz1?.value || null,
            mrz2: pred.mrz2?.value || null,
            mrz3: pred.mrz3?.value || null,
            raw: response.document.toString(),
          };
          break;
        }
        case "passport": {
          const response = await mindeeClient.parse(mindee.product.PassportV1, inputSource);
          const pred = response.document.inference.prediction;
          result = {
            type: "passport",
            documentId: pred.idNumber?.value || null,
            givenNames: (pred.givenNames || []).map((n: any) => n.value),
            surname: pred.surname?.value || null,
            birthDate: pred.birthDate?.value || null,
            birthPlace: pred.birthPlace?.value || null,
            expiryDate: pred.expiryDate?.value || null,
            issuanceDate: pred.issuanceDate?.value || null,
            gender: pred.gender?.value || null,
            country: pred.country?.value || null,
            mrz1: pred.mrz1?.value || null,
            mrz2: pred.mrz2?.value || null,
            raw: response.document.toString(),
          };
          break;
        }
        default:
          return res.status(400).json({ message: `Type de document non supporté: ${documentType}` });
      }

      // Save OCR scan result to history
      let savedScan: any = null;
      try {
        const [scan] = await db.insert(ocrScans).values({
          garageId: req.user?.garageId || null,
          scannedBy: req.user.id,
          documentType,
          fileName: file.originalname,
          result,
        }).returning();
        savedScan = scan;
      } catch (saveErr) {
        console.error("[OCR] Erreur sauvegarde historique:", saveErr);
      }

      console.log(`[OCR] Document scanné avec succès: ${documentType} par ${req.user.email}`);
      res.status(200).json({ success: true, result, scanId: savedScan?.id });
    } catch (error: any) {
      console.error("[OCR] Erreur de scan:", error);
      if (!res.headersSent) {
        res.status(500).json({ 
          message: "Erreur lors du scan OCR", 
          error: error.message,
          stack: error.stack 
        });
      }
    }
  });

  // OCR Scan History endpoints
  app.get("/api/admin/ocr/history", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageScope = getGarageScope(req.user);
      let query = db.select().from(ocrScans);
      if (garageScope) {
        query = query.where(eq(ocrScans.garageId, garageScope)) as any;
      }
      const scans = await (query as any).orderBy(desc(ocrScans.createdAt)).limit(50);
      res.json(scans);
    } catch (error) {
      console.error("[OCR] Erreur récupération historique:", error);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  app.get("/api/admin/ocr/history/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const [scan] = await db.select().from(ocrScans).where(eq(ocrScans.id, id));
      if (!scan) {
        return res.status(404).json({ message: "Scan non trouvé" });
      }
      const garageScope = getGarageScope(req.user);
      if (garageScope && scan.garageId !== garageScope) {
        return res.status(403).json({ message: "Accès refusé" });
      }
      res.json(scan);
    } catch (error) {
      console.error("[OCR] Erreur récupération scan:", error);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  app.delete("/api/admin/ocr/history/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const [scan] = await db.select().from(ocrScans).where(eq(ocrScans.id, id));
      if (!scan) {
        return res.status(404).json({ message: "Scan non trouvé" });
      }
      const garageScope = getGarageScope(req.user);
      if (garageScope && scan.garageId !== garageScope) {
        return res.status(403).json({ message: "Accès refusé" });
      }
      await db.delete(ocrScans).where(eq(ocrScans.id, id));
      res.json({ success: true });
    } catch (error) {
      console.error("[OCR] Erreur suppression scan:", error);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  // ========== OCR QUOTE/INVOICE CREATION (no media required) ==========
  app.post("/api/admin/ocr/create-quote", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { clientId, serviceId, wheelCount, diameter, taxRate, productDetails, notes, services: ocrServices } = req.body;
      const garageId = req.user?.garageId || null;

      if (!clientId) {
        return res.status(400).json({ message: "Client requis" });
      }
      if (!ocrServices || !Array.isArray(ocrServices) || ocrServices.length === 0) {
        return res.status(400).json({ message: "Au moins une ligne est requise" });
      }

      const resolvedServiceId = serviceId || (await storage.getServices())[0]?.id;
      if (!resolvedServiceId) {
        return res.status(400).json({ message: "Aucun service disponible" });
      }

      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const allQuotes = await storage.getQuotes();
      const count = allQuotes.filter(q => {
        if (!q.createdAt) return false;
        const qDate = new Date(q.createdAt);
        return !isNaN(qDate.getTime()) && qDate >= startOfMonth;
      }).length + 1;
      const reference = `DEV-${mm}-${String(count).padStart(5, '0')}`;

      const parsedTaxRate = parseFloat(taxRate || "20");
      const wMult = parseInt(wheelCount) || 1;
      let totalHT = 0;
      for (const s of ocrServices) {
        totalHT += (parseFloat(s.quantity) || 0) * (parseFloat(s.unitPrice) || 0) * wMult;
      }
      const taxAmount = (totalHT * parsedTaxRate) / 100;
      const totalTTC = totalHT + taxAmount;

      const quote = await storage.createQuote({
        clientId,
        serviceId: resolvedServiceId,
        garageId,
        reference,
        wheelCount: parseInt(wheelCount) || 4,
        diameter: diameter || null,
        priceExcludingTax: totalHT.toFixed(2),
        taxRate: parsedTaxRate.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        quoteAmount: totalTTC.toFixed(2),
        productDetails: productDetails || null,
        notes: notes || null,
        status: "approved",
      } as any);

      for (const service of ocrServices) {
        const qty = parseFloat(service.quantity) || 1;
        const unitPrice = parseFloat(service.unitPrice) || 0;
        const itemTotalHT = qty * unitPrice * wMult;
        const itemTaxAmount = (itemTotalHT * parsedTaxRate) / 100;
        const itemTotalTTC = itemTotalHT + itemTaxAmount;

        await storage.createQuoteItem({
          quoteId: quote.id,
          description: service.description || service.serviceName || "Ligne OCR",
          quantity: qty.toString(),
          unitPriceExcludingTax: unitPrice.toString(),
          totalExcludingTax: itemTotalHT.toString(),
          taxRate: parsedTaxRate.toString(),
          taxAmount: itemTaxAmount.toString(),
          totalIncludingTax: itemTotalTTC.toString(),
        });
      }

      await logAuditEvent({
        req,
        entityType: "quote",
        entityId: quote.id,
        action: "created",
        summary: `${entityLabels.quote} ${actionLabels.created} depuis scan OCR`,
        newData: quote,
        metadata: { clientId, source: "ocr_scan" },
      });

      await storage.createNotification({
        userId: clientId,
        type: "quote",
        title: "Nouveau devis",
        message: `Un devis a été créé pour vous`,
        relatedId: quote.id,
      });

      const wsClient = wsClients.get(clientId);
      if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(JSON.stringify({ type: "quote_updated", quoteId: quote.id, status: quote.status }));
      }

      // Link scan to created quote if scanId provided
      if (req.body.scanId) {
        try {
          await db.update(ocrScans).set({ createdQuoteId: quote.id }).where(eq(ocrScans.id, req.body.scanId));
        } catch (e) { /* ignore */ }
      }

      console.log(`[OCR] Devis créé depuis scan: ${reference} par ${req.user.email}`);
      res.json(quote);
    } catch (error: any) {
      console.error("[OCR] Erreur création devis:", error);
      res.status(400).json({ message: error.message || "Échec de la création du devis" });
    }
  });

  app.post("/api/admin/ocr/create-invoice", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { clientId, paymentMethod, wheelCount, diameter, taxRate, productDetails, notes, dueDate, invoiceItems } = req.body;
      const garageId = req.user?.garageId || null;

      if (!clientId) {
        return res.status(400).json({ message: "Client requis" });
      }
      if (!invoiceItems || !Array.isArray(invoiceItems) || invoiceItems.length === 0) {
        return res.status(400).json({ message: "Au moins une ligne est requise" });
      }

      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const allInvoices = await storage.getInvoices();
      const countToday = allInvoices.filter(i => {
        const iDate = new Date(i.createdAt || '');
        return iDate >= startOfDay;
      }).length + 1;
      const invoiceNumber = `FACT-${dd}-${mm}-${String(countToday).padStart(3, '0')}`;

      const parsedTaxRate = parseFloat(taxRate || "20");
      const wMult = parseInt(wheelCount) || 1;
      let totalHT = 0;
      for (const item of invoiceItems) {
        totalHT += (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPriceExcludingTax) || 0) * wMult;
      }
      const taxAmount = (totalHT * parsedTaxRate) / 100;
      const totalTTC = totalHT + taxAmount;

      const invoice = await storage.createInvoice({
        clientId,
        garageId,
        paymentMethod: paymentMethod || "wire_transfer",
        amount: totalTTC.toFixed(2),
        invoiceNumber,
        wheelCount: parseInt(wheelCount) || 4,
        diameter: diameter || null,
        priceExcludingTax: totalHT.toFixed(2),
        taxRate: parsedTaxRate.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        productDetails: productDetails || null,
        notes: notes || null,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        status: "pending",
      } as any);

      for (const item of invoiceItems) {
        await storage.createInvoiceItem({
          invoiceId: invoice.id,
          description: item.description || "Ligne OCR",
          quantity: String(parseFloat(item.quantity) || 1),
          unitPriceExcludingTax: String(parseFloat(item.unitPriceExcludingTax) || 0),
          totalExcludingTax: String(item.totalExcludingTax || 0),
          taxRate: String(item.taxRate || parsedTaxRate),
          taxAmount: String(item.taxAmount || 0),
          totalIncludingTax: String(item.totalIncludingTax || 0),
        });
      }

      await storage.createNotification({
        userId: clientId,
        type: "invoice",
        title: "Nouvelle facture",
        message: `Une facture a été créée pour vous`,
        relatedId: invoice.id,
      });

      const wsClient = wsClients.get(clientId);
      if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(JSON.stringify({ type: "invoice_created", invoiceId: invoice.id }));
      }

      // Link scan to created invoice if scanId provided
      if (req.body.scanId) {
        try {
          await db.update(ocrScans).set({ createdInvoiceId: invoice.id }).where(eq(ocrScans.id, req.body.scanId));
        } catch (e) { /* ignore */ }
      }

      console.log(`[OCR] Facture créée depuis scan: ${invoiceNumber} par ${req.user.email}`);
      res.json(invoice);
    } catch (error: any) {
      console.error("[OCR] Erreur création facture:", error);
      res.status(400).json({ message: error.message || "Échec de la création de la facture" });
    }
  });

  app.post("/api/admin/ocr/create-credit-note", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { clientId, invoiceId, reason, taxRate, notes, lineItems, scanId } = req.body;
      const garageId = req.user?.garageId || null;

      if (!clientId) {
        return res.status(400).json({ message: "Client requis" });
      }
      if (!invoiceId) {
        return res.status(400).json({ message: "Facture liée requise" });
      }
      if (!reason) {
        return res.status(400).json({ message: "Motif requis" });
      }
      if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
        return res.status(400).json({ message: "Au moins une ligne est requise" });
      }

      const now = new Date();
      const creditNoteNumber = await storage.getNextCreditNoteNumber(now.getFullYear());

      const parsedTaxRate = parseFloat(taxRate || "20");
      let totalHT = 0;
      for (const item of lineItems) {
        totalHT += (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPriceHT) || 0);
      }
      const taxAmount = (totalHT * parsedTaxRate) / 100;
      const totalTTC = totalHT + taxAmount;

      const creditNote = await storage.createCreditNote({
        garageId,
        invoiceId,
        clientId,
        creditNoteNumber,
        reason,
        totalHT: totalHT.toFixed(2),
        taxRate: parsedTaxRate.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        totalTTC: totalTTC.toFixed(2),
        status: "draft",
        notes: notes || null,
      } as any);

      for (const item of lineItems) {
        const qty = parseFloat(item.quantity) || 1;
        const unitPrice = parseFloat(item.unitPriceHT) || 0;
        const itemTotalHT = qty * unitPrice;
        const itemTaxRate = parseFloat(item.taxRate || taxRate) || parsedTaxRate;
        const itemTaxAmount = (itemTotalHT * itemTaxRate) / 100;
        const itemTotalTTC = itemTotalHT + itemTaxAmount;

        await storage.createCreditNoteItem({
          creditNoteId: creditNote.id,
          description: item.description || "Ligne avoir OCR",
          quantity: qty.toString(),
          unitPriceHT: unitPrice.toString(),
          totalHT: itemTotalHT.toString(),
          taxRate: itemTaxRate.toString(),
          taxAmount: itemTaxAmount.toString(),
          totalTTC: itemTotalTTC.toString(),
        });
      }

      if (scanId) {
        try {
          await db.update(ocrScans).set({ createdQuoteId: creditNote.id }).where(eq(ocrScans.id, scanId));
        } catch (e) { /* ignore - ocrScans may not have createdCreditNoteId column */ }
      }

      console.log(`[OCR] Avoir créé depuis scan: ${creditNoteNumber} par ${req.user.email}`);
      res.json(creditNote);
    } catch (error: any) {
      console.error("[OCR] Erreur création avoir:", error);
      res.status(400).json({ message: error.message || "Échec de la création de l'avoir" });
    }
  });

  app.post("/api/admin/ocr/create-expense", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { categoryId, supplier, amountHT, taxRate, taxAmount: inputTaxAmount, amountTTC: inputTTC, date, description, notes, receiptRef, scanId } = req.body;
      const garageId = req.user?.garageId || null;

      if (!supplier) {
        return res.status(400).json({ message: "Fournisseur requis" });
      }

      const now = new Date();
      const expenseNumber = await storage.getNextExpenseNumber(now.getFullYear());

      const parsedAmountHT = parseFloat(amountHT) || 0;
      const parsedTaxRate = parseFloat(taxRate || "20");
      const computedTaxAmount = inputTaxAmount != null ? parseFloat(inputTaxAmount) : (parsedAmountHT * parsedTaxRate) / 100;
      const computedTTC = inputTTC != null ? parseFloat(inputTTC) : parsedAmountHT + computedTaxAmount;

      const expense = await storage.createExpense({
        garageId,
        categoryId: categoryId || null,
        expenseNumber,
        vendor: supplier,
        description: description || null,
        date: date ? new Date(date) : now,
        amountHT: parsedAmountHT.toFixed(2),
        taxRate: parsedTaxRate.toFixed(2),
        taxAmount: computedTaxAmount.toFixed(2),
        amountTTC: computedTTC.toFixed(2),
        paymentMethod: "wire_transfer",
        status: "paid",
        notes: notes || null,
        attachmentName: receiptRef || null,
      } as any);

      if (scanId) {
        try {
          await db.update(ocrScans).set({ createdInvoiceId: expense.id }).where(eq(ocrScans.id, scanId));
        } catch (e) { /* ignore - ocrScans may not have createdExpenseId column */ }
      }

      console.log(`[OCR] Dépense créée depuis scan: ${expenseNumber} par ${req.user.email}`);
      res.json(expense);
    } catch (error: any) {
      console.error("[OCR] Erreur création dépense:", error);
      res.status(400).json({ message: error.message || "Échec de la création de la dépense" });
    }
  });

  // ========== GEMINI VISION OCR API (Mobile + Web) ==========
  const multerOcrVision = (await import("multer")).default({
    storage: (await import("multer")).default.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  app.post("/api/ocr/scan-vision", isAuthenticated, multerOcrVision.single("file"), async (req: any, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, message: "Aucun fichier fourni" });
      }

      const documentType = req.body.documentType || "auto_detect";
      const { scanDocument } = await import("./ocrVisionService");

      console.log(`[OCR-Vision] Scan ${documentType} par ${req.user?.email}, fichier: ${file.originalname} (${file.size} bytes)`);

      const result = await scanDocument(file.buffer, documentType, file.mimetype);

      let savedScan: any = null;
      try {
        const [scan] = await db.insert(ocrScans).values({
          garageId: req.user?.garageId || null,
          scannedBy: req.user.id,
          documentType,
          fileName: file.originalname,
          result: result.data,
        }).returning();
        savedScan = scan;
      } catch (saveErr) {
        console.error("[OCR-Vision] Erreur sauvegarde historique:", saveErr);
      }

      console.log(`[OCR-Vision] Scan réussi: type=${result.type}, confidence=${result.confidence}`);
      res.json({ success: true, result, scanId: savedScan?.id });
    } catch (error: any) {
      console.error("[OCR-Vision] Erreur:", error);
      res.status(500).json({ success: false, message: "Erreur lors du scan OCR", error: error.message });
    }
  });

  app.post("/api/ocr/scan-carte-grise", isAuthenticated, multerOcrVision.single("file"), async (req: any, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, message: "Aucun fichier fourni" });
      }

      const { scanCarteGrise } = await import("./ocrVisionService");
      console.log(`[OCR-Vision] Scan carte grise par ${req.user?.email}`);

      const result = await scanCarteGrise(file.buffer, file.mimetype);

      let savedScan: any = null;
      try {
        const [scan] = await db.insert(ocrScans).values({
          garageId: req.user?.garageId || null,
          scannedBy: req.user.id,
          documentType: "carte_grise",
          fileName: file.originalname,
          result: result.data,
        }).returning();
        savedScan = scan;
      } catch (saveErr) {
        console.error("[OCR-Vision] Erreur sauvegarde historique:", saveErr);
      }

      res.json({
        success: true,
        scanId: savedScan?.id,
        vehicleInfo: {
          registrationNumber: result.data.registrationNumber || null,
          make: result.data.make || null,
          commercialName: result.data.commercialName || null,
          model: result.data.model || null,
          vin: result.data.vin || null,
          fuelType: result.data.fuelType || null,
          fiscalPower: result.data.fiscalPower || null,
          firstRegistrationDate: result.data.firstRegistrationDate || null,
          color: result.data.color || null,
          ownerFullName: result.data.ownerFullName || null,
          ownerAddress: result.data.ownerAddress || null,
          category: result.data.category || null,
          engineCapacity: result.data.engineCapacity || null,
        },
        confidence: result.confidence,
        rawText: result.rawText,
      });
    } catch (error: any) {
      console.error("[OCR-Vision] Erreur carte grise:", error);
      res.status(500).json({ success: false, message: "Erreur lors du scan de la carte grise", error: error.message });
    }
  });

  app.post("/api/ocr/scan-license-plate", isAuthenticated, multerOcrVision.single("file"), async (req: any, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, message: "Aucun fichier fourni" });
      }

      const { scanLicensePlate } = await import("./ocrVisionService");
      console.log(`[OCR-Vision] Scan plaque par ${req.user?.email}`);

      const result = await scanLicensePlate(file.buffer, file.mimetype);

      res.json({
        success: true,
        plateNumber: result.data.plateNumber || null,
        country: result.data.country || null,
        format: result.data.format || null,
        confidence: result.confidence,
      });
    } catch (error: any) {
      console.error("[OCR-Vision] Erreur plaque:", error);
      res.status(500).json({ success: false, message: "Erreur lors du scan de la plaque", error: error.message });
    }
  });

  // ========== CLOUDFLARE R2 ADMIN ROUTES ==========
  app.get("/api/admin/storage/status", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const { isCloudflareR2Configured, listR2Files } = await import("./cloudflareR2Service");
      const { isGoogleDriveConfigured } = await import("./googleDriveStorage");
      
      const r2Configured = isCloudflareR2Configured();
      let r2FileCount = 0;
      if (r2Configured) {
        try {
          const files = await listR2Files("", 1000);
          r2FileCount = files.length;
        } catch {}
      }

      const uploadsDir = path.join(process.cwd(), "uploads");
      let localFileCount = 0;
      if (fs.existsSync(uploadsDir)) {
        localFileCount = fs.readdirSync(uploadsDir).filter(f => !f.startsWith(".")).length;
      }

      res.json({
        cloudflareR2: { configured: r2Configured, fileCount: r2FileCount },
        googleDrive: { configured: isGoogleDriveConfigured() },
        localStorage: { available: true, fileCount: localFileCount },
        priority: r2Configured ? "cloudflare_r2" : isGoogleDriveConfigured() ? "google_drive" : "local",
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/r2/files", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { isCloudflareR2Configured, listR2Files } = await import("./cloudflareR2Service");
      if (!isCloudflareR2Configured()) {
        return res.status(503).json({ message: "Cloudflare R2 non configuré" });
      }
      const prefix = (req.query.prefix as string) || "";
      const maxKeys = parseInt(req.query.limit as string) || 100;
      const files = await listR2Files(prefix, maxKeys);
      res.json({ files, count: files.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/r2/migrate-local", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const result = await migrateLocalToObjectStorage();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Generic file upload endpoint used by admin invoice creation
  const multerAdminUpload = (await import("multer")).default({
    storage: (await import("multer")).default.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
  });
  app.post("/api/admin/upload", isAuthenticated, isAdmin, multerAdminUpload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }
      const { ObjectStorageService } = await import("./objectStorage");
      const svc = new ObjectStorageService();
      const filePath = await svc.uploadFileBuffer(req.file.buffer, req.file.originalname, "invoices");
      return res.json({ filePath, fileName: req.file.originalname });
    } catch (err: any) {
      console.error("[Upload] /api/admin/upload error:", err);
      return res.status(500).json({ error: err.message || "Upload failed" });
    }
  });

  app.post("/api/admin/storage/migrate-uploads", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { ObjectStorageService } = await import("./objectStorage");
      const svc = new ObjectStorageService();

      const sourceDir = (req.body.sourceDir as string) || path.join(process.cwd(), "uploads");
      const storagePrefix = (req.body.storagePrefix as string) || ".private/uploads";
      const skipExisting = req.body.skipExisting !== false;

      console.log(`[Storage Migrate] Uploading from ${sourceDir} to ${storagePrefix}`);
      const uploadResult = await svc.uploadFromLocalDir(sourceDir, storagePrefix, { skipExisting });

      const matchResults = { pathsUpdated: 0, newLinks: 0 };
      if (req.body.autoMatch !== false) {
        const uploadsDir = sourceDir;
        const localFiles = fs.existsSync(uploadsDir)
          ? fs.readdirSync(uploadsDir).filter((f: string) => fs.statSync(path.join(uploadsDir, f)).isFile())
          : [];

        const uploadedMap = new Map<string, string>();
        for (const f of localFiles) {
          uploadedMap.set(f, `/objects/uploads/${f}`);
        }

        const allQm = await db.query.quoteMedia.findMany();
        const allIm = await db.query.invoiceMedia.findMany();
        const allQuotes = await db.query.quotes.findMany({ columns: { id: true, reference: true } });
        const allInvoices = await db.query.invoices.findMany({ columns: { id: true, invoiceNumber: true } });

        const quotesByRef = new Map(allQuotes.filter((q: any) => q.reference).map((q: any) => [q.reference, q.id]));
        const invoicesByRef = new Map(allInvoices.filter((i: any) => i.invoiceNumber).map((i: any) => [i.invoiceNumber, i.id]));
        const linkedFiles = new Set([
          ...allQm.map((m: any) => m.fileName),
          ...allIm.map((m: any) => m.fileName),
          ...allQm.map((m: any) => path.basename(m.filePath)),
          ...allIm.map((m: any) => path.basename(m.filePath)),
        ]);

        const refPatterns: Array<{ regex: RegExp; type: "quote" | "invoice" }> = [
          { regex: /(DEV-\d+-\d{5})/, type: "quote" },
          { regex: /(FACT-\d+-\d+-\d+)/, type: "invoice" },
          { regex: /(CB-\d{6})/, type: "invoice" },
          { regex: /(CB-\d{2}-\d{4})/, type: "invoice" },
          { regex: /(CBL-\d{2}-\d{4})/, type: "invoice" },
          { regex: /(ESP-\d{2}-\d{4})/, type: "invoice" },
          { regex: /(VIR-\d{2}-\d{4})/, type: "invoice" },
        ];

        for (const [fileName, objectPath] of uploadedMap) {
          if (linkedFiles.has(fileName)) continue;
          if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)) continue;

          let ref: string | null = null;
          let type: "quote" | "invoice" | null = null;
          for (const p of refPatterns) {
            const match = fileName.match(p.regex);
            if (match) { ref = match[1]; type = p.type; break; }
          }
          if (!ref || !type) continue;

          const fileSize = fs.existsSync(path.join(uploadsDir, fileName))
            ? fs.statSync(path.join(uploadsDir, fileName)).size : 0;

          if (type === "quote") {
            const quoteId = quotesByRef.get(ref);
            if (!quoteId) continue;
            await db.insert(quoteMedia).values({
              quoteId, filePath: objectPath, fileType: "image" as const, fileName, fileSize,
            });
            matchResults.newLinks++;
          } else {
            const invoiceId = invoicesByRef.get(ref);
            if (!invoiceId) continue;
            await db.insert(invoiceMedia).values({
              invoiceId, filePath: objectPath, fileType: "image" as const, fileName, fileSize,
            });
            matchResults.newLinks++;
          }
        }
      }

      res.json({ upload: uploadResult, matching: matchResults });
    } catch (error: any) {
      console.error("[Storage Migrate] Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/storage/copy-bucket", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { sourceBucketId, sourcePrefix, destPrefix } = req.body;
      if (!sourceBucketId || !sourcePrefix) {
        return res.status(400).json({ message: "sourceBucketId and sourcePrefix are required" });
      }
      const { ObjectStorageService } = await import("./objectStorage");
      const svc = new ObjectStorageService();
      const result = await svc.copyBetweenBuckets(
        sourceBucketId,
        sourcePrefix,
        destPrefix || sourcePrefix,
        { skipExisting: req.body.skipExisting !== false }
      );
      res.json(result);
    } catch (error: any) {
      console.error("[Copy Bucket] Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/sync-production", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const syncDataPath = path.join(process.cwd(), 'server', 'sync_data.json');
      
      if (!fs.existsSync(syncDataPath)) {
        return res.status(404).json({ message: "Fichier de synchronisation non trouvé" });
      }
      
      const syncData = JSON.parse(fs.readFileSync(syncDataPath, 'utf8'));
      const results: Record<string, { upserted: number; errors: number }> = {};
      
      function formatVal(val: any): string {
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
        if (typeof val === 'number') return String(val);
        if (Array.isArray(val)) return "'" + JSON.stringify(val).replace(/'/g, "''") + "'::jsonb";
        if (typeof val === 'object') return "'" + JSON.stringify(val).replace(/'/g, "''") + "'::jsonb";
        return "'" + String(val).replace(/'/g, "''") + "'";
      }
      
      const tableOrder = ['garages', 'users', 'services', 'quotes', 'invoices', 'reservations', 'notifications', 'quote_media', 'invoice_media', 'reviews', 'delivery_notes', 'repair_orders'];
      
      for (const table of tableOrder) {
        const rows = syncData[table];
        if (!rows || rows.length === 0) continue;
        
        results[table] = { upserted: 0, errors: 0 };
        const columns = Object.keys(rows[0]);
        const colNames = columns.map((c: string) => `"${c}"`).join(', ');
        
        for (const row of rows) {
          try {
            const valueParts = columns.map((c: string) => formatVal(row[c])).join(', ');
            const updateSet = columns.filter((c: string) => c !== 'id').map((c: string) => `"${c}" = ${formatVal(row[c])}`).join(', ');
            
            const query = `INSERT INTO ${table} (${colNames}) VALUES (${valueParts}) ON CONFLICT (id) DO UPDATE SET ${updateSet}`;
            await db.execute(sql.raw(query));
            results[table].upserted++;
          } catch (err: any) {
            results[table].errors++;
            if (results[table].errors <= 3) {
              console.error(`[Sync] Error ${table} id=${row.id}:`, err.message?.substring(0, 200));
            }
          }
        }
        
        console.log(`[Sync] ${table}: ${results[table].upserted} upserted, ${results[table].errors} errors`);
      }
      
      const totalCheck = await db.execute(sql.raw("SELECT SUM(CAST(amount AS DECIMAL)) as ca FROM invoices WHERE status = 'paid' AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)"));
      
      res.json({ 
        success: true, 
        results,
        verification: { ca_mois: totalCheck.rows[0]?.ca }
      });
    } catch (error: any) {
      console.error('[Sync] Error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/sms/logs", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const logs = await getSmsLogs(limit);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/sms/stats", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const stats = await getSmsStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/sms/test", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { phone, message } = req.body;
      if (!phone) return res.status(400).json({ message: "Numéro de téléphone requis" });
      const result = await sendSms({
        to: phone,
        eventType: 'general',
        eventTitle: 'Test SMS',
        eventDetails: message || 'Ceci est un test de notification SMS MyJantes.',
        recipientName: 'Test Admin',
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==========================================
  // GALLERY ROUTES
  // ==========================================
  
  app.get("/api/admin/gallery", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;
      const sourceType = req.query.sourceType as string; // 'quote' | 'invoice' | undefined
      const search = req.query.search as string;
      const dateFrom = req.query.dateFrom as string;
      const dateTo = req.query.dateTo as string;
      const storageBackend = req.query.storageBackend as string;

      let conditions: string[] = [];
      let params: any[] = [];
      let paramIdx = 1;

      if (search) {
        conditions.push(`(g.reference ILIKE $${paramIdx} OR g.file_name ILIKE $${paramIdx})`);
        params.push(`%${search}%`);
        paramIdx++;
      }
      if (dateFrom) {
        conditions.push(`g.created_at >= $${paramIdx}`);
        params.push(dateFrom);
        paramIdx++;
      }
      if (dateTo) {
        conditions.push(`g.created_at <= $${paramIdx}`);
        params.push(dateTo + 'T23:59:59');
        paramIdx++;
      }
      if (storageBackend) {
        const prefixMap: Record<string, string> = {
          'object_storage': '/objects/%',
          'google_drive': '/gdrive/%',
          'r2': '/r2/%',
          'local': '/uploads/%',
        };
        if (prefixMap[storageBackend]) {
          conditions.push(`g.file_path LIKE $${paramIdx}`);
          params.push(prefixMap[storageBackend]);
          paramIdx++;
        }
      }

      const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

      let unionQuery: string;
      if (sourceType === 'quote') {
        unionQuery = `
          SELECT qm.id, qm.file_path, qm.file_name, qm.file_type, qm.created_at,
                 'quote' as source_type, q.reference, qm.quote_id as source_id
          FROM quote_media qm
          LEFT JOIN quotes q ON qm.quote_id = q.id
        `;
      } else if (sourceType === 'invoice') {
        unionQuery = `
          SELECT im.id, im.file_path, im.file_name, im.file_type, im.created_at,
                 'invoice' as source_type, i.invoice_number as reference, im.invoice_id as source_id
          FROM invoice_media im
          LEFT JOIN invoices i ON im.invoice_id = i.id
        `;
      } else {
        unionQuery = `
          SELECT qm.id, qm.file_path, qm.file_name, qm.file_type, qm.created_at,
                 'quote' as source_type, q.reference, qm.quote_id as source_id
          FROM quote_media qm
          LEFT JOIN quotes q ON qm.quote_id = q.id
          UNION ALL
          SELECT im.id, im.file_path, im.file_name, im.file_type, im.created_at,
                 'invoice' as source_type, i.invoice_number as reference, im.invoice_id as source_id
          FROM invoice_media im
          LEFT JOIN invoices i ON im.invoice_id = i.id
        `;
      }

      const countQuery = `SELECT COUNT(*) as total FROM (${unionQuery}) g ${whereClause}`;
      const dataQuery = `SELECT * FROM (${unionQuery}) g ${whereClause} ORDER BY g.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

      const countResult = await pool.query(countQuery, params);
      const dataResult = await pool.query(dataQuery, params);

      res.json({
        items: dataResult.rows,
        total: parseInt(countResult.rows[0].total),
        page,
        limit,
        totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit),
      });
    } catch (error: any) {
      console.error("[Gallery] List error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/gallery/bulk-delete", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      const { items } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Aucun élément sélectionné" });
      }

      let deleted = 0;
      for (const item of items) {
        try {
          if (item.filePath) {
            await deleteMedia(item.filePath);
          }
          if (item.sourceType === 'quote') {
            await db.delete(quoteMedia).where(eq(quoteMedia.id, item.id));
          } else {
            await db.delete(invoiceMedia).where(eq(invoiceMedia.id, item.id));
          }
          deleted++;
        } catch (err: any) {
          console.error(`[Gallery] Delete ${item.id}:`, err.message);
        }
      }
      res.json({ deleted, total: items.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/gallery/bulk-export", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      const { items } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Aucun élément sélectionné" });
      }

      const archiver = (await import("archiver")).default;
      const archive = archiver("zip", { zlib: { level: 5 } });

      res.set({
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="galerie-export-${new Date().toISOString().split('T')[0]}.zip"`,
      });
      archive.pipe(res);

      for (const item of items) {
        try {
          const buffer = await downloadMedia(item.filePath);
          if (buffer) {
            const fileName = item.fileName || item.filePath.split('/').pop() || `photo-${item.id}`;
            archive.append(buffer, { name: fileName });
          }
        } catch (err: any) {
          console.error(`[Gallery] Export ${item.id}:`, err.message);
        }
      }

      await archive.finalize();
    } catch (error: any) {
      if (!res.headersSent) {
        res.status(500).json({ message: error.message });
      }
    }
  });

  app.patch("/api/admin/gallery/:id/rename", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { newName, sourceType } = req.body;
      if (!newName) return res.status(400).json({ message: "Nom requis" });

      if (sourceType === 'quote') {
        await db.update(quoteMedia).set({ fileName: newName }).where(eq(quoteMedia.id, id));
      } else {
        await db.update(invoiceMedia).set({ fileName: newName }).where(eq(invoiceMedia.id, id));
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/gallery/:id/associate", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { sourceType, currentSourceType, targetId } = req.body;
      if (!targetId || !sourceType) return res.status(400).json({ message: "Cible requise" });

      if (currentSourceType === 'quote') {
        const [media] = await db.select().from(quoteMedia).where(eq(quoteMedia.id, id));
        if (!media) return res.status(404).json({ message: "Photo introuvable" });

        if (sourceType === 'quote') {
          await db.update(quoteMedia).set({ quoteId: targetId }).where(eq(quoteMedia.id, id));
        } else {
          await db.insert(invoiceMedia).values({
            invoiceId: targetId,
            filePath: media.filePath,
            fileName: media.fileName,
            fileType: media.fileType,
          });
          await db.delete(quoteMedia).where(eq(quoteMedia.id, id));
        }
      } else {
        const [media] = await db.select().from(invoiceMedia).where(eq(invoiceMedia.id, id));
        if (!media) return res.status(404).json({ message: "Photo introuvable" });

        if (sourceType === 'invoice') {
          await db.update(invoiceMedia).set({ invoiceId: targetId }).where(eq(invoiceMedia.id, id));
        } else {
          await db.insert(quoteMedia).values({
            quoteId: targetId,
            filePath: media.filePath,
            fileName: media.fileName,
            fileType: media.fileType,
          });
          await db.delete(invoiceMedia).where(eq(invoiceMedia.id, id));
        }
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const multerGallery = (await import("multer")).default({ storage: (await import("multer")).default.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
  app.post("/api/admin/gallery/import", isAuthenticated, isSuperAdmin, multerGallery.array("photos", 50), async (req: any, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      const targetType = req.body.targetType; // 'quote' | 'invoice'
      const targetId = req.body.targetId;
      
      if (!files || files.length === 0) return res.status(400).json({ message: "Aucun fichier" });
      if (!targetId || !targetType) return res.status(400).json({ message: "Cible requise (devis ou facture)" });

      let reference = '';
      if (targetType === 'quote') {
        const [quote] = await db.select().from(quotes).where(eq(quotes.id, targetId));
        reference = quote?.reference || 'IMPORT';
      } else {
        const [invoice] = await db.select().from(invoices).where(eq(invoices.id, targetId));
        reference = invoice?.invoiceNumber || 'IMPORT';
      }

      const existingCount = targetType === 'quote'
        ? (await db.select().from(quoteMedia).where(eq(quoteMedia.quoteId, targetId))).length
        : (await db.select().from(invoiceMedia).where(eq(invoiceMedia.invoiceId, targetId))).length;

      const sharp = (await import("sharp")).default;
      const imported: string[] = [];
      
      for (let i = 0; i < files.length; i++) {
        try {
          let buffer = files[i].buffer;
          const ext = path.extname(files[i].originalname).toLowerCase() || '.jpg';
          
          if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
            const metadata = await sharp(buffer).metadata();
            const maxDim = 2000;
            if (metadata.width && metadata.width > maxDim || metadata.height && metadata.height > maxDim) {
              buffer = await sharp(buffer)
                .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 85 })
                .toBuffer();
            }

            try {
              const { addWatermarkToImage } = await import("./imageWatermark");
              buffer = await addWatermarkToImage(buffer, reference);
            } catch (wmErr: any) {
              console.warn(`[Gallery] Watermark failed: ${wmErr.message}`);
            }
          }
          
          const idx = existingCount + i + 1;
          const newName = `${reference}_${idx}${ext}`;
          const filePath = await uploadMedia(buffer, newName, 'uploads');
          
          if (targetType === 'quote') {
            await db.insert(quoteMedia).values({
              quoteId: targetId,
              filePath,
              fileName: newName,
              fileType: ext.includes('pdf') ? 'document' : 'image',
            });
          } else {
            await db.insert(invoiceMedia).values({
              invoiceId: targetId,
              filePath,
              fileName: newName,
              fileType: ext.includes('pdf') ? 'document' : 'image',
            });
          }
          imported.push(newName);
        } catch (fileErr: any) {
          console.error(`[Gallery] Import file ${files[i].originalname}:`, fileErr.message);
        }
      }
      
      res.json({ imported: imported.length, total: files.length, fileNames: imported });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/internal/migrate-from-dev", async (req: any, res) => {
    try {
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ message: "Route désactivée en production" });
      }
      const migrationSecret = req.headers["x-migration-secret"];
      if (migrationSecret !== process.env.SESSION_SECRET) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const dataPath = path.join(process.cwd(), "migration_data.json");
      if (!fs.existsSync(dataPath)) {
        return res.status(404).json({ message: "migration_data.json not found" });
      }

      const raw = fs.readFileSync(dataPath, "utf-8");
      const data = JSON.parse(raw);

      const tablesOrder = [
        "garages", "users", "services", "quotes", "quote_items", "quote_media",
        "invoices", "invoice_items", "invoice_media", "invoice_counters",
        "reservations", "reservation_services", "reviews", "notifications",
        "workflows", "workflow_steps", "repair_orders", "workshop_tasks",
        "accounting_entries", "accounting_lines", "application_settings",
        "credit_notes", "credit_note_items", "credit_note_counters",
        "delivery_notes", "delivery_note_counters", "delivery_note_invoices",
        "engagements", "expense_categories", "expense_counters", "expenses",
        "fec_exports", "ocr_scans", "password_reset_tokens", "sms_logs",
        "chat_conversations", "chat_participants", "chat_messages", "chat_attachments"
      ];

      const results: Record<string, any> = {};
      const client = await pool.connect();

      try {
        for (const table of tablesOrder) {
          const rows = data[table];
          if (!rows || rows.length === 0) {
            results[table] = { inserted: 0, skipped: true };
            continue;
          }

          try {
            const countRes = await client.query(`SELECT COUNT(*) as cnt FROM "${table}"`);
            const cnt = parseInt(countRes.rows[0].cnt, 10);
            if (cnt > 0) {
              results[table] = { skipped: true, existing: cnt, reason: "already has data" };
              continue;
            }

            let inserted = 0;
            let errors = 0;
            for (const row of rows) {
              try {
                const keys = Object.keys(row).filter(k => row[k] !== undefined);
                const cols = keys.map(k => `"${k}"`).join(", ");
                const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
                const values = keys.map(k => {
                  const v = row[k];
                  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
                    return JSON.stringify(v);
                  }
                  return v;
                });

                await client.query(
                  `INSERT INTO "${table}" (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
                  values
                );
                inserted++;
              } catch (rowErr: any) {
                errors++;
                if (errors <= 3) {
                  console.error(`[Migration] ${table} row error:`, rowErr.message);
                }
              }
            }
            results[table] = { inserted, total: rows.length, errors };
          } catch (tableErr: any) {
            results[table] = { error: tableErr.message };
          }
        }
      } finally {
        client.release();
      }

      console.log("[Migration] Complete:", JSON.stringify(results));
      res.json({ success: true, results });
    } catch (error: any) {
      console.error("[Migration] Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/internal/wipe-and-import", async (req: any, res) => {
    try {
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ message: "Route désactivée en production" });
      }
      const migrationSecret = req.headers["x-migration-secret"];
      if (migrationSecret !== process.env.SESSION_SECRET) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const dataPath = path.join(process.cwd(), "migration_data.json");
      if (!fs.existsSync(dataPath)) {
        return res.status(404).json({ message: "migration_data.json not found" });
      }

      const raw = fs.readFileSync(dataPath, "utf-8");
      const data = JSON.parse(raw);

      const tablesInDeleteOrder = [
        "chat_attachments", "chat_messages", "chat_participants", "chat_conversations",
        "sms_logs", "password_reset_tokens", "ocr_scans", "fec_exports",
        "expenses", "expense_counters", "expense_categories", "engagements",
        "delivery_note_invoices", "delivery_note_counters", "delivery_notes",
        "credit_note_counters", "credit_note_items", "credit_notes",
        "application_settings", "accounting_lines", "accounting_entries",
        "workshop_tasks", "repair_orders", "workflow_steps", "workflows",
        "notification_rules", "notifications", "reviews",
        "reservation_services", "reservations",
        "invoice_counters", "invoice_media", "invoice_items", "invoices",
        "quote_media", "quote_items", "quotes",
        "service_workflows", "services",
        "audit_log_changes", "audit_logs",
        "sessions", "users", "garages"
      ];

      const tablesInInsertOrder = [
        "garages", "users", "services", "service_workflows",
        "quotes", "quote_items", "quote_media",
        "invoices", "invoice_items", "invoice_media", "invoice_counters",
        "reservations", "reservation_services", "reviews",
        "notifications", "notification_rules",
        "workflows", "workflow_steps", "repair_orders", "workshop_tasks",
        "accounting_entries", "accounting_lines", "application_settings",
        "credit_notes", "credit_note_items", "credit_note_counters",
        "delivery_notes", "delivery_note_counters", "delivery_note_invoices",
        "engagements", "expense_categories", "expense_counters", "expenses",
        "fec_exports", "ocr_scans", "password_reset_tokens", "sms_logs",
        "audit_logs", "audit_log_changes",
        "chat_conversations", "chat_participants", "chat_messages", "chat_attachments"
      ];

      const client = await pool.connect();
      const results: Record<string, any> = {};

      try {
        console.log("[WipeImport] Step 1: Truncating all tables...");
        for (const table of tablesInDeleteOrder) {
          try {
            await client.query(`DELETE FROM "${table}"`);
            console.log(`[WipeImport] Cleared ${table}`);
          } catch (e: any) {
            console.error(`[WipeImport] Clear ${table} error: ${e.message}`);
          }
        }

        console.log("[WipeImport] Step 2: Inserting data...");
        for (const table of tablesInInsertOrder) {
          const rows = data[table];
          if (!rows || rows.length === 0) {
            results[table] = { inserted: 0 };
            continue;
          }

          let inserted = 0;
          let errors = 0;
          for (const row of rows) {
            try {
              const keys = Object.keys(row).filter(k => row[k] !== undefined);
              const cols = keys.map(k => `"${k}"`).join(", ");
              const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
              const values = keys.map(k => {
                const v = row[k];
                if (v !== null && typeof v === "object" && !Array.isArray(v)) {
                  return JSON.stringify(v);
                }
                return v;
              });

              await client.query(
                `INSERT INTO "${table}" (${cols}) VALUES (${placeholders})`,
                values
              );
              inserted++;
            } catch (rowErr: any) {
              errors++;
              if (errors <= 3) {
                console.error(`[WipeImport] ${table} row error: ${rowErr.message}`);
              }
            }
          }
          results[table] = { inserted, total: rows.length, errors };
          console.log(`[WipeImport] ${table}: ${inserted}/${rows.length} inserted, ${errors} errors`);
        }
      } finally {
        client.release();
      }

      console.log("[WipeImport] Complete!");
      res.json({ success: true, results });
    } catch (error: any) {
      console.error("[WipeImport] Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/internal/migrate-users-force", async (req: any, res) => {
    try {
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ message: "Route désactivée en production" });
      }
      const migrationSecret = req.headers["x-migration-secret"];
      if (migrationSecret !== process.env.SESSION_SECRET) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const dataPath = path.join(process.cwd(), "migration_data.json");
      if (!fs.existsSync(dataPath)) {
        return res.status(404).json({ message: "migration_data.json not found" });
      }

      const raw = fs.readFileSync(dataPath, "utf-8");
      const data = JSON.parse(raw);
      const users = data.users || [];

      const client = await pool.connect();
      let inserted = 0;
      let updated = 0;
      let errors = 0;

      try {
        for (const row of users) {
          try {
            const keys = Object.keys(row).filter(k => row[k] !== undefined);
            const cols = keys.map(k => `"${k}"`).join(", ");
            const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
            const updateCols = keys.filter(k => k !== "id").map((k, i) => `"${k}" = EXCLUDED."${k}"`).join(", ");
            const values = keys.map(k => {
              const v = row[k];
              if (v !== null && typeof v === "object" && !Array.isArray(v)) {
                return JSON.stringify(v);
              }
              return v;
            });

            const result = await client.query(
              `INSERT INTO "users" (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
              values
            );
            if (result.rowCount && result.rowCount > 0) {
              inserted++;
            }
          } catch (rowErr: any) {
            errors++;
            if (errors <= 5) {
              console.error(`[Migration-Users] Error:`, rowErr.message);
            }
          }
        }
      } finally {
        client.release();
      }

      console.log(`[Migration-Users] Done: ${inserted} upserted, ${errors} errors out of ${users.length}`);
      res.json({ success: true, inserted, errors, total: users.length });
    } catch (error: any) {
      console.error("[Migration-Users] Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/internal/reset-password", async (req: any, res) => {
    try {
      const migrationSecret = req.headers["x-migration-secret"];
      if (migrationSecret !== process.env.SESSION_SECRET) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { email, newPassword } = req.body;
      if (!email || !newPassword) {
        return res.status(400).json({ message: "email and newPassword required" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const client = await pool.connect();
      try {
        const result = await client.query(
          `UPDATE "users" SET "password" = $1 WHERE "email" = $2 RETURNING id, email, role`,
          [hashedPassword, email]
        );
        if (result.rowCount === 0) {
          return res.status(404).json({ message: "User not found" });
        }
        console.log(`[ResetPassword] Password reset for ${email}`);
        res.json({ success: true, user: result.rows[0] });
      } finally {
        client.release();
      }
    } catch (error: any) {
      console.error("[ResetPassword] Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/internal/fix-schema", async (req: any, res) => {
    try {
      const migrationSecret = req.headers["x-migration-secret"];
      if (migrationSecret !== process.env.SESSION_SECRET) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const results: string[] = [];
      const client = await pool.connect();
      try {
        try {
          await client.query(`ALTER TABLE invoice_counters ADD CONSTRAINT invoice_counters_payment_type_unique UNIQUE (payment_type)`);
          results.push("Added UNIQUE constraint on invoice_counters.payment_type");
        } catch (e: any) {
          if (e.code === '42710') {
            results.push("UNIQUE constraint on invoice_counters.payment_type already exists");
          } else {
            results.push(`invoice_counters constraint error: ${e.message}`);
          }
        }

        const fixPayment = await client.query(`UPDATE invoices SET payment_method = 'wire_transfer' WHERE payment_method = 'transfer'`);
        results.push(`Fixed ${fixPayment.rowCount} invoices with payment_method='transfer' -> 'wire_transfer'`);

        const fixQuotePayment = await client.query(`UPDATE quotes SET payment_method = 'wire_transfer' WHERE payment_method = 'transfer'`);
        results.push(`Fixed ${fixQuotePayment.rowCount} quotes with payment_method='transfer' -> 'wire_transfer'`);
      } finally {
        client.release();
      }

      res.json({ success: true, results });
    } catch (error: any) {
      console.error("[FixSchema] Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ========== AI MODULES ROUTES ==========

  const OPENROUTER_API_KEY_AI = process.env.OPENAI_API_KEY || "";
  const OPENROUTER_URL_AI = "https://openrouter.ai/api/v1/chat/completions";
  const GROK_API_KEY_AI = process.env.GROK_API_KEY || "";
  const GROK_URL_AI = "https://api.x.ai/v1/chat/completions";

  async function callGeminiAI(prompt: string, imageBase64?: string, imageMimeType?: string): Promise<string> {
    const userContent: any[] = [];
    if (imageBase64 && imageMimeType) {
      userContent.push({ type: "image_url", image_url: { url: `data:${imageMimeType};base64,${imageBase64}` } });
    }
    userContent.push({ type: "text", text: prompt });

    // Primary: OpenRouter
    if (OPENROUTER_API_KEY_AI) {
      try {
        const aiRes = await fetch(OPENROUTER_URL_AI, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENROUTER_API_KEY_AI}`,
            "HTTP-Referer": "https://apps.myjantes.fr",
            "X-Title": "MyJantes",
          },
          body: JSON.stringify({
            model: "openai/gpt-oss-120b:free",
            messages: [{ role: "user", content: userContent.length === 1 ? userContent[0].text : userContent }],
          }),
          signal: AbortSignal.timeout(60000),
        });
        if (aiRes.ok) {
          const data = await aiRes.json() as any;
          const text = data.choices?.[0]?.message?.content || "";
          const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
          return match ? match[1].trim() : text.trim();
        }
        const errBody = await aiRes.text().catch(() => "");
        console.warn(`[AI] OpenRouter ${aiRes.status} — bascule Grok. ${errBody.substring(0, 80)}`);
      } catch (e: any) {
        console.warn(`[AI] OpenRouter indisponible (${e.message}) — bascule Grok`);
      }
    }

    // Fallback: Grok
    if (!GROK_API_KEY_AI) throw new Error("Aucune clé IA disponible (OPENAI_API_KEY ou GROK_API_KEY requise)");
    const grokModel = imageBase64 ? "grok-2-vision-1212" : "grok-3";
    const grokRes = await fetch(GROK_URL_AI, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROK_API_KEY_AI}` },
      body: JSON.stringify({
        model: grokModel,
        messages: [{ role: "user", content: userContent.length === 1 ? userContent[0].text : userContent }],
        max_tokens: 8192,
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!grokRes.ok) {
      const errBody = await grokRes.text().catch(() => "");
      throw new Error(`Grok error: ${grokRes.status} — ${errBody.substring(0, 200)}`);
    }
    const grokData = await grokRes.json() as any;
    const grokText = grokData.choices?.[0]?.message?.content || "";
    const grokMatch = grokText.match(/```(?:json)?\s*([\s\S]*?)```/);
    return grokMatch ? grokMatch[1].trim() : grokText.trim();
  }

  // ── Notification immédiate au rootadmin pour chaque devis / facture / réservation ──
  async function notifyRootAdmin(
    type: "quote" | "invoice" | "reservation",
    item: any,
    mediaItems?: Array<{ filePath: string; fileName: string; fileType: string }>
  ): Promise<void> {
    try {
      const ROOT_EMAIL = "rbelmahi90@gmail.com";
      const labels: Record<string, string> = { quote: "Devis", invoice: "Facture", reservation: "Réservation" };
      const emojis: Record<string, string> = { quote: "📋", invoice: "🧾", reservation: "📅" };
      const ref = item.reference || item.invoiceNumber || item.id?.substring(0, 8);
      const subject = `${emojis[type]} Nouveau ${labels[type]} — ${ref}`;
      const dateStr = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" });

      const rows: string[] = [];
      if (item.invoiceNumber) rows.push(`<tr><td style="padding:4px 8px;color:#666;">N° Facture</td><td style="padding:4px 8px;font-weight:600;">${item.invoiceNumber}</td></tr>`);
      if (item.reference) rows.push(`<tr><td style="padding:4px 8px;color:#666;">Référence</td><td style="padding:4px 8px;font-weight:600;">${item.reference}</td></tr>`);
      if (item.status) rows.push(`<tr><td style="padding:4px 8px;color:#666;">Statut</td><td style="padding:4px 8px;">${item.status}</td></tr>`);
      if (item.amount) rows.push(`<tr><td style="padding:4px 8px;color:#666;">Montant TTC</td><td style="padding:4px 8px;font-weight:600;color:#dc2626;">${parseFloat(item.amount).toFixed(2)} €</td></tr>`);
      if (item.quoteAmount) rows.push(`<tr><td style="padding:4px 8px;color:#666;">Montant devis</td><td style="padding:4px 8px;font-weight:600;color:#dc2626;">${parseFloat(item.quoteAmount).toFixed(2)} €</td></tr>`);
      if (item.paymentMethod) rows.push(`<tr><td style="padding:4px 8px;color:#666;">Paiement</td><td style="padding:4px 8px;">${item.paymentMethod}</td></tr>`);
      if (item.scheduledDate || item.date) rows.push(`<tr><td style="padding:4px 8px;color:#666;">Date RDV</td><td style="padding:4px 8px;">${new Date(item.scheduledDate || item.date).toLocaleString("fr-FR")}</td></tr>`);
      if (item.notes) rows.push(`<tr><td style="padding:4px 8px;color:#666;">Notes</td><td style="padding:4px 8px;">${item.notes}</td></tr>`);
      if (item.requestDetails) rows.push(`<tr><td style="padding:4px 8px;color:#666;">Détails</td><td style="padding:4px 8px;">${item.requestDetails}</td></tr>`);

      const mediaLinks = (mediaItems || [])
        .map(m => `<li><a href="https://myjantes.fr${m.filePath}" style="color:#dc2626;">${m.fileName}</a> (${m.fileType})</li>`)
        .join("");

      const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;background:#f5f5f5;margin:0;padding:20px;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.12);">
  <div style="background:#dc2626;padding:24px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:22px;">${emojis[type]} Nouveau ${labels[type]} créé</h1>
    <p style="color:#fca5a5;margin:8px 0 0;">${dateStr}</p>
  </div>
  <div style="padding:24px;">
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      ${rows.join("")}
    </table>
    ${mediaLinks ? `<div style="margin-top:20px;"><h3 style="color:#dc2626;">📎 Médias joints (${mediaItems?.length})</h3><ul style="color:#374151;">${mediaLinks}</ul></div>` : ""}
    <div style="margin-top:20px;padding:12px;background:#fef2f2;border-radius:8px;border-left:4px solid #dc2626;">
      <p style="margin:0;color:#7f1d1d;font-size:13px;">ID: <code>${item.id}</code></p>
    </div>
  </div>
  <div style="background:#f9fafb;padding:16px;text-align:center;font-size:12px;color:#9ca3af;">
    MyJantes · Notification automatique rootadmin · <a href="https://myjantes.fr/admin" style="color:#dc2626;">Accéder à l'admin</a>
  </div>
</div>
</body></html>`;

      // Attach up to 3 images from object storage
      const attachments: Array<{ filename: string; content: Buffer }> = [];
      if (mediaItems && mediaItems.length > 0) {
        const images = mediaItems.filter(m => m.fileType === "image").slice(0, 3);
        for (const img of images) {
          try {
            const { Client } = await import("@replit/object-storage");
            const client = new Client();
            const objName = img.filePath.startsWith("/objects/")
              ? `.private/${img.filePath.slice("/objects/".length)}`
              : img.filePath;
            const result = await client.downloadAsBytes(objName);
            const buf = Buffer.isBuffer(result.value) ? result.value
              : result.value instanceof Uint8Array ? Buffer.from(result.value)
              : Array.isArray(result.value) ? Buffer.from(result.value[0] as Uint8Array)
              : null;
            if (buf && buf.length > 0 && buf.length < 4 * 1024 * 1024) {
              attachments.push({ filename: img.fileName || "image.jpg", content: buf });
            }
          } catch (e: any) {
            console.warn("[RootAdmin] Media attach failed:", e.message);
          }
        }
      }

      const { sendEmail } = await import("./emailService");
      await sendEmail({ to: ROOT_EMAIL, subject, html, attachments: attachments.length > 0 ? attachments : undefined });
      console.log(`[RootAdmin] Notification envoyée: ${subject}`);
    } catch (err: any) {
      console.error("[RootAdmin] Notification échec:", err.message);
    }
  }


  async function getBusinessSnapshot() {
    const now = new Date();
    const sixMonthsAgo = new Date(now); sixMonthsAgo.setMonth(now.getMonth() - 6);
    const twelveMonthsAgo = new Date(now); twelveMonthsAgo.setMonth(now.getMonth() - 12);

    const [quotesAll, invoicesAll, usersAll, servicesAll] = await Promise.all([
      db.select({ id: quotes.id, status: quotes.status, createdAt: quotes.createdAt }).from(quotes).where(sql`${quotes.createdAt} >= ${twelveMonthsAgo}`),
      db.select({ id: invoices.id, status: invoices.status, amount: invoices.amount, createdAt: invoices.createdAt }).from(invoices).where(sql`${invoices.createdAt} >= ${twelveMonthsAgo}`),
      db.select({ id: users.id, email: users.email, role: users.role, createdAt: users.createdAt }).from(users).where(eq(users.role, "client")),
      db.select({ id: services.id, name: services.name, basePrice: services.basePrice }).from(services),
    ]);

    const paidInvoices = invoicesAll.filter(i => i.status === "paid");
    const sentInvoices = invoicesAll.filter(i => i.status === "sent");
    const totalRevenue = paidInvoices.reduce((s, i) => s + parseFloat(i.amount || "0"), 0);
    const pendingRevenue = sentInvoices.reduce((s, i) => s + parseFloat(i.amount || "0"), 0);
    const quotesAccepted = quotesAll.filter(q => ["accepted", "completed"].includes(q.status || "")).length;
    const conversionRate = quotesAll.length > 0 ? Math.round((quotesAccepted / quotesAll.length) * 100) : 0;
    const avgTicket = paidInvoices.length > 0 ? totalRevenue / paidInvoices.length : 0;

    const recentClients = usersAll.filter(u => u.createdAt && new Date(u.createdAt) >= sixMonthsAgo).length;

    const monthlyRevenue: Record<string, number> = {};
    paidInvoices.forEach(inv => {
      const m = new Date(inv.createdAt!).toLocaleString("fr-FR", { month: "short", year: "2-digit" });
      monthlyRevenue[m] = (monthlyRevenue[m] || 0) + parseFloat(inv.amount || "0");
    });

    return {
      totalDevis: quotesAll.length,
      devisAcceptes: quotesAccepted,
      totalFactures: invoicesAll.length,
      facturesPayees: paidInvoices.length,
      facturesEnAttente: sentInvoices.length,
      totalClients: usersAll.length,
      nouveauxClients6m: recentClients,
      chiffreAffaires: Math.round(totalRevenue * 100) / 100,
      montantEnAttente: Math.round(pendingRevenue * 100) / 100,
      tauxConversion: conversionRate,
      panierMoyen: Math.round(avgTicket * 100) / 100,
      totalServices: servicesAll.length,
      revenusMensuels: monthlyRevenue,
    };
  }

  app.post("/api/admin/ai/analyse", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageId = getGarageScope(req.user);
      const snap = await getBusinessSnapshot();
      const monthsArr = Object.entries(snap.revenusMensuels).map(([m, ca]) => ({ mois: m, ca }));
      const prompt = `Tu es un coach business expert et consultant en performance pour un garage spécialisé jantes automobiles (MyJantes, Liévin 62800). Tu es direct, précis, et donnes des conseils actionnables avec des chiffres concrets. Tu analyses les données comme un vrai mentor d'entreprise.

DONNÉES RÉELLES DU GARAGE:
- CA encaissé (12 mois): ${snap.chiffreAffaires} €
- CA en attente: ${snap.montantEnAttente} €
- Devis total: ${snap.totalDevis} | Acceptés: ${snap.devisAcceptes} | Taux conversion: ${snap.tauxConversion}%
- Factures: ${snap.totalFactures} total | ${snap.facturesPayees} payées | ${snap.facturesEnAttente} en attente
- Panier moyen: ${snap.panierMoyen} €
- Clients total: ${snap.totalClients} | Nouveaux 6 mois: ${snap.nouveauxClients6m}
- Services catalogue: ${snap.totalServices}
- Revenus mensuels (ordre chronologique): ${JSON.stringify(snap.revenusMensuels)}

Réponds UNIQUEMENT avec ce JSON valide (sans markdown, sans commentaire):
{
  "score": 75,
  "tendance": "+12% vs période précédente",
  "resumeExecutif": "résumé précis 2-3 phrases avec chiffres clés pour le dirigeant",
  "coachMessage": "Message direct du coach 3-4 phrases: ce qui va bien, ce qui doit changer MAINTENANT, et l'opportunité à saisir. Sois direct et percutant.",
  "kpis": {
    "ca": {"valeur": ${snap.chiffreAffaires}, "evolution": "estimation % vs période précédente", "objectif": ${Math.round(snap.chiffreAffaires * 1.2)}, "atteinte": 0},
    "conversion": {"valeur": ${snap.tauxConversion}, "evolution": "tendance qualitative", "objectif": 40, "atteinte": 0},
    "panier": {"valeur": ${snap.panierMoyen}, "evolution": "tendance qualitative", "objectif": 350, "atteinte": 0},
    "clients": {"valeur": ${snap.totalClients}, "evolution": "tendance qualitative", "objectif": ${Math.round(snap.totalClients * 1.15)}, "atteinte": 0}
  },
  "radarScores": [
    {"domaine": "Ventes", "score": 0, "benchmark": 75},
    {"domaine": "Clients", "score": 0, "benchmark": 70},
    {"domaine": "Conversion", "score": 0, "benchmark": 65},
    {"domaine": "Rentabilité", "score": 0, "benchmark": 70},
    {"domaine": "Fidélisation", "score": 0, "benchmark": 60},
    {"domaine": "Croissance", "score": 0, "benchmark": 65}
  ],
  "revenusMensuelGraph": ${JSON.stringify(monthsArr.map(m => ({ mois: m.mois, ca: m.ca, objectif: Math.round(m.ca * 1.1) })))},
  "alertes": ["alerte critique 1 avec chiffre", "alerte critique 2 avec chiffre"],
  "points_forts": ["point fort 1 chiffré", "point fort 2 chiffré", "point fort 3 chiffré"],
  "actions_prioritaires": [
    {"action": "action immédiate 1 très concrète", "impact": "Élevé", "delai": "Cette semaine", "gain_estime": "X €/mois"},
    {"action": "action court terme 2 très concrète", "impact": "Élevé", "delai": "Ce mois", "gain_estime": "X €/mois"},
    {"action": "action moyen terme 3 très concrète", "impact": "Moyen", "delai": "3 mois", "gain_estime": "X €/mois"}
  ]
}
RÈGLES ABSOLUES:
- Réponds EXCLUSIVEMENT avec du JSON valide
- JAMAIS de backticks \`\`\`
- JAMAIS de texte avant ou après le JSON
- JAMAIS de markdown
- Le JSON doit être un objet complet {...}`;
      const cleanJSON = (str: string): string => {
        str = str.trim();
        str = str.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
        const start = str.indexOf("{");
        const end = str.lastIndexOf("}");
        if (start === -1 || end <= start) return "{}";
        str = str.substring(start, end + 1);
        str = str.replace(/,(\s*[}\]])/g, "$1");
        return str;
      };
      const raw = await callGeminiAI(prompt);
      let result: any;
      try {
        result = JSON.parse(cleanJSON(raw));
      } catch (parseErr: any) {
        console.error("[AI parse error]", parseErr.message, "| raw[:300]:", raw?.slice(0, 300));
        result = { raw, error: "parse_failed" };
      }

      const saved = await storage.createAiAnalysis({
        type: "globale",
        title: `Analyse Globale — ${new Date().toLocaleDateString("fr-FR")}`,
        result,
        garageId: garageId || null,
      } as any);

      res.json({ ...saved, result });
    } catch (error: any) {
      console.error("[AI/analyse]", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/ai/commercial", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageId = getGarageScope(req.user);
      const snap = await getBusinessSnapshot();
      const monthsArr2 = Object.entries(snap.revenusMensuels).map(([m, ca]) => ({ mois: m, ca: Number(ca) }));
      const tauxAcceptes = snap.totalDevis > 0 ? Math.round(snap.devisAcceptes / snap.totalDevis * 100) : 0;
      const tauxFactures = snap.devisAcceptes > 0 ? Math.round(snap.facturesPayees / snap.devisAcceptes * 100) : 0;
      const prompt = `Expert commercial garage jantes. Analyse rapide et coaching. Réponse JSON UNIQUEMENT.

CA total: ${snap.chiffreAffaires}€ | Conversion: ${snap.tauxConversion}% | Panier: ${snap.panierMoyen}€
Devis: ${snap.totalDevis} | Acceptés: ${snap.devisAcceptes} (${tauxAcceptes}%) | Factures payées: ${snap.facturesPayees}

{
  "coachMessage": "Diagnostic concis: conversion faible/bonne, levier #1 (action+impact€), levier #2 (action+impact€). 2 phrases max.",
  "tauxConversion": ${snap.tauxConversion},
  "panierMoyen": ${snap.panierMoyen},
  "funnelConversion": [
    {"etape": "Devis envoyés", "valeur": ${snap.totalDevis}, "taux": 100},
    {"etape": "Acceptés", "valeur": ${snap.devisAcceptes}, "taux": ${tauxAcceptes}},
    {"etape": "Facturés", "valeur": ${snap.facturesPayees}, "taux": ${tauxFactures}}
  ],
  "caParMois": ${JSON.stringify(monthsArr2.slice(-6).map(m => ({ mois: m.mois, ca: m.ca })))},
  "performanceCommerciale": {"score": 0, "analyse": "diagnostic chiffré: 1-2 phrases"}
}
RÈGLES ABSOLUES:
- Réponds EXCLUSIVEMENT avec du JSON valide
- JAMAIS de backticks \`\`\`
- JAMAIS de texte avant ou après le JSON
- JAMAIS de markdown
- Le JSON doit être un objet complet {...}`;
      const cleanJSON = (str: string): string => {
        str = str.trim();
        str = str.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
        const start = str.indexOf("{");
        const end = str.lastIndexOf("}");
        if (start === -1 || end <= start) return "{}";
        str = str.substring(start, end + 1);
        str = str.replace(/,(\s*[}\]])/g, "$1");
        return str;
      };
      const raw = await callGeminiAI(prompt);
      let result: any;
      try {
        result = JSON.parse(cleanJSON(raw));
      } catch (parseErr: any) {
        console.error("[AI parse error]", parseErr.message, "| raw[:300]:", raw?.slice(0, 300));
        result = { raw, error: "parse_failed" };
      }

      const saved = await storage.createAiAnalysis({
        type: "commerciale",
        title: `Analyse Commerciale — ${new Date().toLocaleDateString("fr-FR")}`,
        result,
        garageId: garageId || null,
      } as any);

      res.json({ ...saved, result });
    } catch (error: any) {
      console.error("[AI/commercial]", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/ai/growth", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageId = getGarageScope(req.user);
      const snap = await getBusinessSnapshot();
      const caM6 = Object.values(snap.revenusMensuels).slice(-6).reduce((s: number, v: any) => s + Number(v), 0);
      const caM3 = Object.values(snap.revenusMensuels).slice(-3).reduce((s: number, v: any) => s + Number(v), 0);
      const prompt = `Stratège croissance garage. Coaching rapide. JSON UNIQUEMENT.

CA 6m: ${Math.round(caM6)}€ | 3m: ${Math.round(caM3)}€ | Clients: ${snap.totalClients} | Nouveaux 6m: ${snap.nouveauxClients6m}

{
  "coachMessage": "État croissance: frein principal (chiffre€), stratégie 90j prioritaire. 2 phrases.",
  "potentielCAM6": ${Math.round(caM6 * 1.20)},
  "potentielCAM6Optimiste": ${Math.round(caM6 * 1.35)},
  "potentielCAM6Pessimiste": ${Math.round(caM6 * 1.05)},
  "projectionsM6": [
    {"mois": "M+1", "realiste": ${Math.round(caM3/3)}},
    {"mois": "M+2", "realiste": ${Math.round(caM3/3 * 1.15)}},
    {"mois": "M+3", "realiste": ${Math.round(caM3/3 * 1.25)}},
    {"mois": "M+4", "realiste": ${Math.round(caM3/3 * 1.30)}},
    {"mois": "M+5", "realiste": ${Math.round(caM3/3 * 1.35)}},
    {"mois": "M+6", "realiste": ${Math.round(caM3/3 * 1.40)}}
  ],
  "recommandations": [
    {"titre": "Action 1", "description": "chiffres concis", "impact": "Élevé", "effort": "Faible", "roi": "X€/mois", "priorite": 1},
    {"titre": "Action 2", "description": "chiffres concis", "impact": "Élevé", "effort": "Moyen", "roi": "X€/mois", "priorite": 2}
  ]
}
RÈGLES ABSOLUES:
- Réponds EXCLUSIVEMENT avec du JSON valide
- JAMAIS de backticks \`\`\`
- JAMAIS de texte avant ou après le JSON
- JAMAIS de markdown
- Le JSON doit être un objet complet {...}`;
      const cleanJSON = (str: string): string => {
        str = str.trim();
        str = str.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
        const start = str.indexOf("{");
        const end = str.lastIndexOf("}");
        if (start === -1 || end <= start) return "{}";
        str = str.substring(start, end + 1);
        str = str.replace(/,(\s*[}\]])/g, "$1");
        return str;
      };
      const raw = await callGeminiAI(prompt);
      let result: any;
      try {
        result = JSON.parse(cleanJSON(raw));
      } catch (parseErr: any) {
        console.error("[AI parse error]", parseErr.message, "| raw[:300]:", raw?.slice(0, 300));
        result = { raw, error: "parse_failed" };
      }

      const saved = await storage.createAiAnalysis({
        type: "croissance",
        title: `Analyse Croissance — ${new Date().toLocaleDateString("fr-FR")}`,
        result,
        garageId: garageId || null,
      } as any);

      res.json({ ...saved, result });
    } catch (error: any) {
      console.error("[AI/growth]", error);
      res.status(500).json({ message: error.message });
    }
  });

  {
    const multerAiWheel = (await import("multer")).default({
      storage: (await import("multer")).default.memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    });

    app.post("/api/admin/ai/wheel", isAuthenticated, isAdmin, multerAiWheel.single("image"), async (req: any, res) => {
      try {
        const garageId = getGarageScope(req.user);
        if (!req.file) return res.status(400).json({ message: "Image requise" });
        const imageBase64 = req.file.buffer.toString("base64");
        const imageMimeType = req.file.mimetype || "image/jpeg";

        const prompt = `Tu es un expert diagnostiqueur de jantes automobiles avec 20 ans d'expérience chez MyJantes (Liévin, France). Tu analyses chaque détail de la photo avec une précision de technicien certifié. Tu identifies tous les défauts visibles et proposes un plan de restauration complet et chiffré.

Réponds UNIQUEMENT avec ce JSON valide (sans markdown, sans commentaire):
{
  "diagnosis": {
    "etat": "Excellent|Bon|Moyen|Mauvais|Critique",
    "score": 85,
    "typeJante": "type précis identifié",
    "nombreBranches": "nombre ou description",
    "couleurActuelle": "couleur précise",
    "finitionActuelle": "brillant|mat|satiné|brossé|diamond cut|chrome|autre",
    "dimension": "estimation taille (ex: 17 pouces)",
    "problemesDetectes": ["problème détaillé 1", "problème détaillé 2"],
    "defauts": [
      {"type": "Rayures/Éraflures", "severite": 0, "localisation": "zone identifiée"},
      {"type": "Déformation/Choc", "severite": 0, "localisation": "zone identifiée"},
      {"type": "Corrosion/Rouille", "severite": 0, "localisation": "zone identifiée"},
      {"type": "Peinture écaillée", "severite": 0, "localisation": "zone identifiée"},
      {"type": "Déséquilibre visible", "severite": 0, "localisation": "zone identifiée"}
    ]
  },
  "servicesRequis": [
    {"service": "nom service", "urgence": "Immédiat|Court terme|Préventif", "description": "description technique précise", "prixMin": 0, "prixMax": 0}
  ],
  "prixTotalEstime": 0,
  "prixTotalEstimeMax": 0,
  "recommandation": "recommandation technique précise du technicien avec les étapes de remise en état",
  "optionsPersonnalisation": [
    {"option": "option 1", "description": "rendu visuel détaillé", "prix": "X-Y €"},
    {"option": "option 2", "description": "rendu visuel détaillé", "prix": "X-Y €"},
    {"option": "option 3", "description": "rendu visuel détaillé", "prix": "X-Y €"}
  ],
  "securite": {
    "circulationAutorisee": true,
    "remarque": "remarque sécurité si nécessaire"
  }
}`;

        const cleanJSON = (str: string): string => {
          str = str.trim();
          str = str.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
          const start = str.indexOf("{"); const end = str.lastIndexOf("}");
          if (start === -1 || end <= start) return "{}";
          str = str.substring(start, end + 1);
          str = str.replace(/,(\s*[}\]])/g, "$1");
          return str;
        };
        const raw = await callGeminiAI(prompt, imageBase64, imageMimeType);
        let result: any;
        try {
          result = JSON.parse(cleanJSON(raw));
        } catch (parseErr: any) {
          console.error("[AI/wheel parse error]", parseErr.message, "| raw[:300]:", raw?.slice(0, 300));
          result = { raw, error: "parse_failed" };
        }

        const saved = await storage.createAiAnalysis({
          type: "wheel",
          title: `Diagnostic Jante — ${new Date().toLocaleDateString("fr-FR")}`,
          result,
          garageId: garageId || null,
        } as any);

        res.json({ ...saved, result });
      } catch (error: any) {
        console.error("[AI/wheel]", error);
        res.status(500).json({ message: error.message });
      }
    });
  }

  app.get("/api/admin/ai/history", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const type = req.query.type as string | undefined;
      const limit = parseInt(req.query.limit as string || "50");
      const garageId = getGarageScope(req.user);
      const history = await storage.getAiAnalysisHistory(type, limit, garageId);
      res.json(history);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/ai/history/export/excel", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const XLSX = await import("xlsx");
      const type = req.query.type as string | undefined;
      const garageId = getGarageScope(req.user);
      const history = await storage.getAiAnalysisHistory(type, 200, garageId);

      const rows = history.map(row => ({
        ID: row.id,
        Type: row.type,
        Titre: row.title,
        Date: new Date(row.createdAt!).toLocaleString("fr-FR"),
        "Email envoyé": row.emailSentAt ? new Date(row.emailSentAt).toLocaleString("fr-FR") : "Non",
        Résultat: JSON.stringify(row.result),
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Analyses IA");

      ws["!cols"] = [
        { wch: 36 }, { wch: 12 }, { wch: 40 }, { wch: 20 }, { wch: 20 }, { wch: 60 },
      ];

      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      const filename = `analyses-ia-${new Date().toISOString().slice(0, 10)}.xlsx`;

      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buf);
    } catch (error: any) {
      console.error("[AI/excel]", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/ai/history/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageId = getGarageScope(req.user);
      const row = await storage.getAiAnalysis(req.params.id, garageId);
      if (!row) return res.status(404).json({ message: "Analyse non trouvée" });
      res.json(row);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/admin/ai/history/bulk/failed", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageId = getGarageScope(req.user);
      const count = await storage.deleteFailedAiAnalyses(garageId);
      res.json({ success: true, deleted: count });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/admin/ai/history/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageId = getGarageScope(req.user);
      await storage.deleteAiAnalysis(req.params.id, garageId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/ai/history/:id/email", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const garageId = getGarageScope(req.user);
      const row = await storage.getAiAnalysis(req.params.id, garageId);
      if (!row) return res.status(404).json({ message: "Analyse non trouvée" });

      const { to } = req.body;
      const recipient = to || req.user?.email || "contact@app.mytoolsgroup.eu";

      const typeLabels: Record<string, string> = {
        globale: "Analyse Globale IA",
        commerciale: "Analyse Commerciale IA",
        croissance: "Analyse Croissance IA",
        wheel: "Diagnostic Jante IA",
      };

      const label = typeLabels[row.type] || "Analyse IA";
      const date = new Date(row.createdAt!).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

      const resultHtml = `<pre style="background:#f8f8f8;padding:16px;border-radius:8px;font-family:monospace;font-size:12px;overflow-x:auto;white-space:pre-wrap;">${JSON.stringify(row.result, null, 2)}</pre>`;

      const html = `${getEmailHeader(label)}
<div style="padding:24px;">
  <h2 style="color:#dc2626;margin:0 0 8px;">📊 ${label}</h2>
  <p style="color:#666;margin:0 0 20px;">Généré le ${date}</p>
  <p>Bonjour,</p>
  <p>Veuillez trouver ci-dessous le rapport d'analyse IA généré par MyJantes.</p>
  ${resultHtml}
  <p style="margin-top:24px;color:#666;font-size:12px;">Ce rapport a été généré automatiquement par le module IA de MyJantes.</p>
</div>
${getEmailFooter()}`;

      await sendEmail({
        to: recipient,
        subject: `${label} — ${date}`,
        html,
      });

      await storage.updateAiAnalysis(row.id, { emailSentAt: new Date() } as any, garageId);

      res.json({ success: true, sentTo: recipient });
    } catch (error: any) {
      console.error("[AI/email]", error);
      res.status(500).json({ message: error.message });
    }
  });

<<<<<<< HEAD
  // ========== AI SMART FEATURES ==========

  app.post("/api/admin/ai/smart-quote", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { description } = req.body;
      if (!description?.trim()) return res.status(400).json({ message: "Description requise" });
      const { generateSmartQuoteSuggestion } = await import("./aiAssistant");
      const suggestion = await generateSmartQuoteSuggestion(description);
      res.json(suggestion);
    } catch (error: any) {
      console.error("[AI/smart-quote]", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/ai/email-draft", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { type, documentNumber, amount, clientName, prestations, technicalDetails } = req.body;
      if (!type || !documentNumber) return res.status(400).json({ message: "type et documentNumber requis" });
      const { generateEmailDraft } = await import("./aiAssistant");
      const draft = await generateEmailDraft({ type, documentNumber, amount: amount || "0", clientName: clientName || "", prestations: prestations || [], technicalDetails: technicalDetails || "" });
      res.json(draft);
    } catch (error: any) {
      console.error("[AI/email-draft]", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/ai/client-insights", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const clientData = req.body;
      if (!clientData?.name) return res.status(400).json({ message: "Données client requises" });
      const { generateClientInsights } = await import("./aiAssistant");
      const insights = await generateClientInsights(clientData);
      res.json(insights);
    } catch (error: any) {
      console.error("[AI/client-insights]", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/ai/repair-advisor", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const repairData = req.body;
      if (!repairData?.serviceName) return res.status(400).json({ message: "Données de réparation requises" });
      const { generateRepairAdvisory } = await import("./aiAssistant");
      const advisory = await generateRepairAdvisory(repairData);
      res.json(advisory);
    } catch (error: any) {
      console.error("[AI/repair-advisor]", error);
      res.status(500).json({ message: error.message });
    }
  });
=======
  // ========== MAILING HUB ==========
  app.use("/api/admin/mailing", mailingRouter);
>>>>>>> a2b3dc8 (feat(mailing-hub): Module Mailing complet - Resend + App mail sent)

  // ========== MODE ATELIER - DOSSIERS ==========
  registerDossierRoutes(app);

  // ========== DASHBOARD ATELIER - SCORING & STATS ==========
  const { registerDashboardRoutes } = await import("./dashboardRoutes");
  registerDashboardRoutes(app);

  // ========== IMPORT MEDIAS DEPUIS DISQUE LOCAL (USAGE UNIQUE — DEV SEULEMENT) ==========
  app.post("/api/internal/import-media-from-disk", async (req: any, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ message: "Not found" });
    }
    try {
      const secret = req.headers["x-import-secret"];
      if (secret !== process.env.SESSION_SECRET) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const SOURCE_DIR = req.body.sourceDir || "/tmp/galerie-import";
      if (!fs.existsSync(SOURCE_DIR)) {
        return res.status(400).json({ message: `Répertoire introuvable: ${SOURCE_DIR}` });
      }

      const allQuotesList = await db.select({ id: quotes.id, reference: quotes.reference }).from(quotes);
      const quoteByRef = new Map(allQuotesList.map((q: any) => [q.reference!, q.id]));

      const existingMediaList = await db
        .select({ fileName: quoteMedia.fileName, quoteId: quoteMedia.quoteId })
        .from(quoteMedia);
      const existingKeys = new Set(existingMediaList.map((m: any) => `${m.quoteId}:${m.fileName}`));

      const allFiles = fs.readdirSync(SOURCE_DIR)
        .filter((f: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
        .sort();

      const { Client: ObjClient } = await import("@replit/object-storage");
      const objStore = new ObjClient();
      const { randomUUID } = await import("crypto");

      let uploaded = 0, skipped = 0, missingQuote = 0, errors = 0;
      const missingRefs: string[] = [];
      const results: any[] = [];

      for (const fileName of allFiles) {
        const m = fileName.match(/^(DEV-\d{2}-\d{5})_(\d+)\.(jpg|jpeg|png|gif|webp)$/i);
        if (!m) { results.push({ file: fileName, status: "format_invalide" }); continue; }

        const reference = m[1];
        const quoteId = quoteByRef.get(reference);
        if (!quoteId) {
          if (!missingRefs.includes(reference)) missingRefs.push(reference);
          missingQuote++;
          results.push({ file: fileName, status: "devis_manquant", reference });
          continue;
        }

        const existKey = `${quoteId}:${fileName}`;
        if (existingKeys.has(existKey)) {
          skipped++;
          results.push({ file: fileName, status: "deja_present" });
          continue;
        }

        try {
          const buffer = fs.readFileSync(path.join(SOURCE_DIR, fileName));
          const ext = path.extname(fileName).toLowerCase();
          const uuid = randomUUID();
          const storageName = `${uuid}${ext}`;
          const objectName = `.private/uploads/${storageName}`;
          await objStore.uploadFromBytes(objectName, buffer);
          const filePath = `/objects/uploads/${storageName}`;
          await db.insert(quoteMedia).values({
            id: randomUUID(),
            quoteId,
            fileType: "image",
            filePath,
            fileName,
            fileSize: buffer.length,
          });
          existingKeys.add(existKey);
          uploaded++;
          results.push({ file: fileName, status: "importe", path: filePath });
        } catch (err: any) {
          errors++;
          results.push({ file: fileName, status: "erreur", error: err.message });
        }
      }

      res.json({
        success: true,
        uploaded, skipped, missingQuote, errors,
        missingRefs,
        total: allFiles.length,
        results,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== DEMANDES DE DEVIS (site vitrine → PWA) ==========

  // POST /api/public/website-quote-request — reçoit les demandes du site vitrine
  app.post("/api/public/website-quote-request", async (req: any, res) => {
    try {
      const secret = process.env.WEBSITE_WEBHOOK_SECRET || "myjantes-webhook-2026";
      const provided = req.headers["x-webhook-secret"] || req.body?.webhookSecret;
      if (provided !== secret) {
        return res.status(401).json({ message: "Secret invalide" });
      }

      const {
        firstName, lastName, email, phone,
        service, message, vehicleInfo, photos,
        ...rest
      } = req.body;

      const [newRequest] = await db.insert(quoteRequests).values({
        source: "website",
        firstName: firstName || null,
        lastName: lastName || null,
        email: email || null,
        phone: phone || null,
        service: service || null,
        message: message || null,
        vehicleInfo: vehicleInfo || null,
        photos: Array.isArray(photos) ? photos : [],
        status: "new",
        rawData: req.body,
      }).returning();

      // Notifier tous les admins via WebSocket
      const staffMembers = await storage.getUsersByRoles(['admin', 'superadmin']);
      for (const staff of staffMembers) {
        const wsClient = wsClients.get(staff.id);
        if (wsClient && wsClient.readyState === WebSocket.OPEN) {
          wsClient.send(JSON.stringify({
            type: "quote_request_new",
            quoteRequestId: newRequest.id,
            firstName, lastName, email, service,
          }));
        }
        await storage.createNotification({
          userId: staff.id,
          type: "quote",
          title: "Nouvelle demande de devis",
          message: `${firstName || ""} ${lastName || ""} (${email || phone || "?"}) — ${service || "Service non précisé"}`.trim(),
          relatedId: newRequest.id,
        });
      }

      res.status(201).json({ success: true, id: newRequest.id });
    } catch (error: any) {
      console.error("[QuoteRequest] Erreur réception:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/admin/quote-requests — liste des demandes
  app.get("/api/admin/quote-requests", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { status } = req.query;
      let query = db.select().from(quoteRequests).orderBy(desc(quoteRequests.createdAt));
      if (status && status !== "all") {
        const results = await db.select().from(quoteRequests)
          .where(eq(quoteRequests.status, status as string))
          .orderBy(desc(quoteRequests.createdAt));
        return res.json(results);
      }
      const results = await query;
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // PATCH /api/admin/quote-requests/:id — mettre à jour le statut
  app.patch("/api/admin/quote-requests/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const [updated] = await db.update(quoteRequests)
        .set({ status, updatedAt: new Date() })
        .where(eq(quoteRequests.id, id))
        .returning();
      if (!updated) return res.status(404).json({ message: "Demande non trouvée" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/admin/quote-requests/:id/convert — convertir en client + devis
  app.post("/api/admin/quote-requests/:id/convert", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { clientId: existingClientId, quoteDescription, quoteAmount, notes } = req.body;

      const [request] = await db.select().from(quoteRequests).where(eq(quoteRequests.id, id));
      if (!request) return res.status(404).json({ message: "Demande non trouvée" });

      let clientId = existingClientId;

      // Créer le client si pas déjà existant
      if (!clientId) {
        // Vérifier si email existe déjà
        if (request.email) {
          const existing = await db.select().from(users).where(eq(users.email, request.email)).limit(1);
          if (existing.length > 0) {
            clientId = existing[0].id;
          }
        }
        if (!clientId) {
          // Créer un nouveau compte client
          const crypto = await import("crypto");
          const tempPassword = crypto.randomBytes(12).toString("base64");
          const bcrypt = await import("bcrypt");
          const hashedPassword = await bcrypt.hash(tempPassword, 10);
          const newUserId = crypto.randomUUID();
          const [newUser] = await db.insert(users).values({
            id: newUserId,
            email: request.email || `client-${newUserId.slice(0, 8)}@myjantes.fr`,
            password: hashedPassword,
            firstName: request.firstName || null,
            lastName: request.lastName || null,
            phone: request.phone || null,
            role: "client",
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any).returning();
          clientId = newUser.id;
        }
      }

      // Créer le devis
      const quoteNumber = await storage.getNextQuoteNumber();
      const [newQuote] = await db.insert(quotes).values({
        clientId,
        reference: quoteNumber,
        status: "draft",
        description: quoteDescription || [
          request.service ? `Service : ${request.service}` : null,
          request.vehicleInfo ? `Véhicule : ${request.vehicleInfo}` : null,
          request.message ? `Message client : ${request.message}` : null,
        ].filter(Boolean).join("\n") || "Demande de devis depuis le site",
        quoteAmount: quoteAmount || "0",
        taxAmount: "0",
        notes: notes || null,
        mediaUrls: request.photos && (request.photos as string[]).length > 0
          ? JSON.stringify(request.photos)
          : null,
        viewToken: (await import("crypto")).randomBytes(32).toString("hex"),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any).returning();

      // Marquer la demande comme convertie
      await db.update(quoteRequests)
        .set({
          status: "converted",
          convertedClientId: clientId,
          convertedQuoteId: newQuote.id,
          updatedAt: new Date(),
        })
        .where(eq(quoteRequests.id, id));

      res.json({
        success: true,
        clientId,
        quoteId: newQuote.id,
        quoteReference: newQuote.reference,
      });
    } catch (error: any) {
      console.error("[QuoteRequest] Erreur conversion:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ========== MONITORING / SANTÉ SYSTÈME ==========
  app.get("/api/admin/monitoring/health", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const t0 = Date.now();

      // DB health + table counts
      let dbOk = false;
      let dbLatencyMs = 0;
      let dbStats: Record<string, any> = {};
      try {
        const r = await db.execute(sql`
          SELECT
            (SELECT COUNT(*) FROM users) AS users,
            (SELECT COUNT(*) FROM quotes) AS quotes,
            (SELECT COUNT(*) FROM invoices) AS invoices,
            (SELECT COUNT(*) FROM reservations) AS reservations,
            (SELECT COUNT(*) FROM services) AS services,
            (SELECT COUNT(*) FROM sessions) AS sessions,
            (SELECT COUNT(*) FROM notifications WHERE is_read = false) AS unread_notifications,
            (SELECT COALESCE(SUM(amount::numeric),0) FROM invoices WHERE status='paid') AS revenue_total,
            (SELECT COUNT(*) FROM quote_media) AS quote_media,
            (SELECT COUNT(*) FROM invoice_media) AS invoice_media
        `);
        dbStats = r.rows[0] as any;
        dbOk = true;
        dbLatencyMs = Date.now() - t0;
      } catch (e: any) {
        dbStats = { error: e.message };
      }

      // Object storage check
      let storageOk = false;
      let storageError: string | undefined;
      try {
        const { Client } = await import("@replit/object-storage");
        const c = new Client();
        const probe = Buffer.from("ping");
        await c.uploadFromBytes(".private/healthcheck/ping.txt", probe);
        storageOk = true;
      } catch (e: any) {
        storageError = e.message;
      }

      // OpenRouter AI check
      let aiOk = false;
      let aiError: string | undefined;
      try {
        if (!OPENROUTER_API_KEY_AI) {
          aiError = "OPENROUTER_API_KEY non configurée";
        } else {
          const aiProbe = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${OPENROUTER_API_KEY_AI}`,
              "HTTP-Referer": "https://apps.myjantes.fr",
              "X-Title": "MyJantes",
            },
            body: JSON.stringify({ model: "openai/gpt-oss-120b:free", messages: [{ role: "user", content: "ping" }], max_tokens: 5 }),
            signal: AbortSignal.timeout(10000),
          });
          aiOk = aiProbe.ok;
          if (!aiProbe.ok) aiError = `HTTP ${aiProbe.status}`;
        }
      } catch (e: any) {
        aiError = e.message;
      }

      // Email
      const emailOk = !!process.env.RESEND_API_KEY;

      // Memory
      const mem = process.memoryUsage();
      const memHeapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
      const memHeapTotalMb = Math.round(mem.heapTotal / 1024 / 1024);
      const memRssMb = Math.round(mem.rss / 1024 / 1024);

      // Uptime
      const uptimeSec = Math.floor(process.uptime());
      const uptimeStr = `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m ${uptimeSec % 60}s`;

      // WebSocket connections
      const wsConnections = wsClients.size;

      res.json({
        timestamp: new Date().toISOString(),
        uptime: { seconds: uptimeSec, formatted: uptimeStr },
        db: { ok: dbOk, latencyMs: dbLatencyMs, stats: dbStats },
        storage: { ok: storageOk, error: storageError },
        ai: { ok: aiOk, error: aiError },
        email: { ok: emailOk, provider: process.env.RESEND_API_KEY ? "Resend" : "none" },
        memory: { heapUsedMb: memHeapUsedMb, heapTotalMb: memHeapTotalMb, rssMb: memRssMb, usagePercent: Math.round((memHeapUsedMb / memHeapTotalMb) * 100) },
        websocket: { connections: wsConnections },
        nodeVersion: process.version,
        env: process.env.NODE_ENV || "development",
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
