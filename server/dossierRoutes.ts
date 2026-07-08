/**
 * Routes /api/dossiers — Mode Atelier Kanban
 * Enveloppe les reservations + repair_orders existants sans rien casser.
 */

import { type Express } from "express";
import { db } from "./db";
import { reservations, repairOrders, users, services } from "@shared/schema";
import { eq, and, or, ilike, sql, desc, gte, lte, inArray } from "drizzle-orm";
import multer from "multer";
import { ObjectStorageService } from "./objectStorage";
import { resolveConflict } from "./conflictResolver";
import { broadcastToUser } from "./wsClients";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function isAuthenticated(req: any, res: any, next: any) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ message: "Non authentifié" });
}

function isAdmin(req: any, res: any, next: any) {
  const role = req.user?.role;
  if (["admin", "superadmin", "root", "employe"].includes(role)) return next();
  return res.status(403).json({ message: "Accès refusé" });
}

// Enrichit une réservation avec le repair_order lié et les données client/service
async function enrichReservation(r: any) {
  const [repairOrder] = await db
    .select()
    .from(repairOrders)
    .where(eq(repairOrders.reservationId, r.id))
    .limit(1);

  return {
    ...r,
    repairOrder: repairOrder || null,
    // atelierStatus par défaut selon le statut reservation
    atelierStatus: r.atelierStatus || deriveDefaultAtelierStatus(r.status),
  };
}

function deriveDefaultAtelierStatus(reservationStatus: string): string {
  switch (reservationStatus) {
    case "pending": return "reception";
    case "confirmed": return "preparation";
    case "completed": return "restitution";
    case "cancelled": return "reception";
    default: return "reception";
  }
}

export function registerDossierRoutes(app: Express) {
  // ─── GET /api/dossiers ───────────────────────────────────────────────────────
  app.get("/api/dossiers", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { status, urgency, search, dateFrom, dateTo, atelierStatus } = req.query as Record<string, string>;

      let query = db
        .select({
          id: reservations.id,
          reference: reservations.reference,
          clientId: reservations.clientId,
          serviceId: reservations.serviceId,
          scheduledDate: reservations.scheduledDate,
          estimatedEndDate: reservations.estimatedEndDate,
          wheelCount: reservations.wheelCount,
          diameter: reservations.diameter,
          status: reservations.status,
          atelierStatus: reservations.atelierStatus,
          urgency: reservations.urgency,
          version: reservations.version,
          lastUpdated: reservations.lastUpdated,
          conflictHistory: reservations.conflictHistory,
          notes: reservations.notes,
          vehicleRegistration: reservations.vehicleRegistration,
          vehicleMake: reservations.vehicleMake,
          vehicleModel: reservations.vehicleModel,
          vehicleVin: reservations.vehicleVin,
          createdAt: reservations.createdAt,
          updatedAt: reservations.updatedAt,
          // Client info via join
          clientFirstName: users.firstName,
          clientLastName: users.lastName,
          clientEmail: users.email,
          clientPhone: users.phone,
          // Service info via join
          serviceName: services.name,
        })
        .from(reservations)
        .leftJoin(users, eq(reservations.clientId, users.id))
        .leftJoin(services, eq(reservations.serviceId, services.id))
        .$dynamic();

      const conditions: any[] = [];

      if (status && status !== "all") conditions.push(eq(reservations.status, status as any));
      if (urgency && urgency !== "all") conditions.push(eq(reservations.urgency, urgency as any));
      if (atelierStatus && atelierStatus !== "all") conditions.push(eq(reservations.atelierStatus, atelierStatus as any));
      if (dateFrom) conditions.push(gte(reservations.scheduledDate, new Date(dateFrom)));
      if (dateTo) conditions.push(lte(reservations.scheduledDate, new Date(dateTo)));
      if (search) {
        conditions.push(
          or(
            ilike(users.firstName, `%${search}%`),
            ilike(users.lastName, `%${search}%`),
            ilike(users.email, `%${search}%`),
            ilike(reservations.vehicleRegistration, `%${search}%`),
            ilike(reservations.vehicleMake, `%${search}%`),
            ilike(reservations.reference, `%${search}%`)
          )
        );
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      const rows = await (query as any).orderBy(desc(reservations.scheduledDate));

      // Attach repair_orders in batch
      const ids = rows.map((r: any) => r.id);
      const allRepairOrders = ids.length > 0
        ? await db.select().from(repairOrders).where(inArray(repairOrders.reservationId, ids))
        : [];

      const repairMap: Record<string, any> = {};
      for (const ro of allRepairOrders) {
        if (ro.reservationId) repairMap[ro.reservationId] = ro;
      }

      const enriched = rows.map((r: any) => ({
        ...r,
        atelierStatus: r.atelierStatus || deriveDefaultAtelierStatus(r.status),
        repairOrder: repairMap[r.id] || null,
        clientName: [r.clientFirstName, r.clientLastName].filter(Boolean).join(" ") || r.clientEmail || "Client",
      }));

      res.json(enriched);
    } catch (err: any) {
      console.error("[Dossiers] GET error:", err);
      res.status(500).json({ message: err.message || "Erreur serveur" });
    }
  });

  // ─── GET /api/dossiers/stats ─────────────────────────────────────────────────
  app.get("/api/dossiers/stats", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [all, todayRows, urgentRows, lateRows] = await Promise.all([
        db.select({ id: reservations.id, wheelCount: reservations.wheelCount, urgency: reservations.urgency, scheduledDate: reservations.scheduledDate, estimatedEndDate: reservations.estimatedEndDate, atelierStatus: reservations.atelierStatus, status: reservations.status })
          .from(reservations)
          .where(or(eq(reservations.status, "pending"), eq(reservations.status, "confirmed"))),
        db.select({ id: reservations.id }).from(reservations)
          .where(and(
            gte(reservations.scheduledDate, today),
            lte(reservations.scheduledDate, tomorrow),
            or(eq(reservations.status, "pending"), eq(reservations.status, "confirmed"))
          )),
        db.select({ id: reservations.id }).from(reservations)
          .where(and(
            or(eq(reservations.urgency, "high"), eq(reservations.urgency, "critical")),
            or(eq(reservations.status, "pending"), eq(reservations.status, "confirmed"))
          )),
        db.select({ id: reservations.id, estimatedEndDate: reservations.estimatedEndDate }).from(reservations)
          .where(and(
            lte(reservations.estimatedEndDate, new Date()),
            or(eq(reservations.status, "pending"), eq(reservations.status, "confirmed"))
          )),
      ]);

      const totalWheels = all.reduce((sum: number, r: any) => sum + (r.wheelCount || 0), 0);
      const notDone = all.filter((r: any) => !["termine", "restitution"].includes(r.atelierStatus || ""));
      const wheelsInProgress = notDone.reduce((sum: number, r: any) => sum + (r.wheelCount || 0), 0);

      // Délai moyen (en heures) depuis scheduledDate pour les dossiers actifs
      const now = new Date();
      const delays = notDone
        .filter((r: any) => r.scheduledDate)
        .map((r: any) => (now.getTime() - new Date(r.scheduledDate).getTime()) / 3600000);
      const avgDelay = delays.length > 0 ? Math.round(delays.reduce((a: number, b: number) => a + b, 0) / delays.length) : 0;

      res.json({
        total: all.length,
        today: todayRows.length,
        urgent: urgentRows.length,
        late: lateRows.length,
        wheelsInProgress,
        totalWheels,
        avgDelayHours: avgDelay,
        byAtelierStatus: Object.fromEntries(
          ["reception", "attente", "preparation", "reparation", "finition", "controle", "termine", "restitution"].map(
            (s) => [s, all.filter((r: any) => (r.atelierStatus || deriveDefaultAtelierStatus(r.status)) === s).length]
          )
        ),
      });
    } catch (err: any) {
      console.error("[Dossiers] stats error:", err);
      res.status(500).json({ message: err.message || "Erreur serveur" });
    }
  });

  // ─── PATCH /api/dossiers/:id/status ─────────────────────────────────────────
  app.patch("/api/dossiers/:id/status", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { atelierStatus, urgency, clientVersion } = req.body;

      const [current] = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
      if (!current) return res.status(404).json({ message: "Dossier introuvable" });

      // Détection de conflit de version
      if (clientVersion !== undefined && clientVersion < current.version) {
        return res.status(409).json({
          message: "Conflit de version",
          serverVersion: current.version,
          serverData: current,
        });
      }

      const updateData: any = {
        version: (current.version || 1) + 1,
        lastUpdated: new Date(),
        updatedAt: new Date(),
      };
      if (atelierStatus !== undefined) updateData.atelierStatus = atelierStatus;
      if (urgency !== undefined) updateData.urgency = urgency;

      const [updated] = await db
        .update(reservations)
        .set(updateData)
        .where(eq(reservations.id, id))
        .returning();

      // Broadcast WebSocket pour sync temps réel
      try {
        broadcastToUser("*", { type: "dossier_updated", data: { id, atelierStatus, urgency } });
      } catch {}

      res.json(updated);
    } catch (err: any) {
      console.error("[Dossiers] PATCH status error:", err);
      res.status(500).json({ message: err.message || "Erreur serveur" });
    }
  });

  // ─── POST /api/dossiers/:id/photos ──────────────────────────────────────────
  app.post("/api/dossiers/:id/photos", isAuthenticated, isAdmin, upload.array("photos", 10), async (req: any, res) => {
    try {
      const { id } = req.params;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) return res.status(400).json({ message: "Aucun fichier reçu" });

      const [reservation] = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
      if (!reservation) return res.status(404).json({ message: "Dossier introuvable" });

      const objStorage = new ObjectStorageService();
      const uploadedUrls: string[] = [];

      for (const file of files) {
        const key = `.private/uploads/atelier/${id}/${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`;
        await objStorage.uploadObject(key, file.buffer, file.mimetype);
        const publicUrl = `/objects/uploads/atelier/${id}/${key.split("/").pop()}`;
        uploadedUrls.push(publicUrl);
      }

      // Cherche le repair_order lié et y ajoute les photos
      const [ro] = await db.select().from(repairOrders).where(eq(repairOrders.reservationId, id)).limit(1);
      if (ro) {
        const existing: string[] = Array.isArray(ro.photos) ? ro.photos as string[] : [];
        await db.update(repairOrders).set({ photos: [...existing, ...uploadedUrls] }).where(eq(repairOrders.id, ro.id));
      }

      res.json({ urls: uploadedUrls });
    } catch (err: any) {
      console.error("[Dossiers] photos upload error:", err);
      res.status(500).json({ message: err.message || "Erreur upload" });
    }
  });

  // ─── POST /api/dossiers/:id/resolve ─────────────────────────────────────────
  app.post("/api/dossiers/:id/resolve", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { clientData, baseData } = req.body;

      const [serverData] = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
      if (!serverData) return res.status(404).json({ message: "Dossier introuvable" });

      const result = resolveConflict(serverData as any, clientData, baseData || {});

      if (!result.requiresManualReview) {
        const existing: any[] = Array.isArray(serverData.conflictHistory) ? serverData.conflictHistory as any[] : [];
        await db.update(reservations).set({
          ...result.mergedData,
          version: (serverData.version || 1) + 1,
          lastUpdated: new Date(),
          conflictHistory: [...existing, result.conflictEntry],
        }).where(eq(reservations.id, id));
      }

      res.json(result);
    } catch (err: any) {
      console.error("[Dossiers] resolve error:", err);
      res.status(500).json({ message: err.message || "Erreur serveur" });
    }
  });
}
