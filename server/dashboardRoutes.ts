/**
 * Routes Dashboard Atelier — Scoring employés, stats globales, admin
 * GET /api/dashboard/atelier
 * GET /api/dashboard/employe/:id
 * GET /api/dashboard/admin
 * PATCH /api/dossiers/:id/assign
 * PATCH /api/dossiers/:id/priority
 */

import { type Express } from "express";
import { db } from "./db";
import {
  reservations,
  workshopTasks,
  users,
  services,
} from "@shared/schema";
import {
  eq,
  and,
  or,
  sql,
  desc,
  gte,
  count,
  inArray,
} from "drizzle-orm";
import { broadcastToUser } from "./wsClients";

function isAuthenticated(req: any, res: any, next: any) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ message: "Non authentifié" });
}

function isAdminOrEmployee(req: any, res: any, next: any) {
  const role = req.user?.role;
  if (["admin", "superadmin", "root", "employe"].includes(role)) return next();
  return res.status(403).json({ message: "Accès refusé" });
}

function isAdmin(req: any, res: any, next: any) {
  const role = req.user?.role;
  if (["admin", "superadmin", "root"].includes(role)) return next();
  return res.status(403).json({ message: "Accès admin requis" });
}

/**
 * Calcule le score d'un employé selon :
 * - Nombre de tâches complétées (40%)
 * - Rapidité : tâches complétées avant la date prévue (30%)
 * - Respect des priorités : urgences traitées en premier (30%)
 */
async function calculateEmployeeScore(employeeId: string): Promise<{
  score: number;
  tasksCompleted: number;
  avgCompletionHours: number;
  urgentHandled: number;
  rank: string;
}> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Tâches complétées par cet employé dans les 30 derniers jours
  const completedTasks = await db
    .select({
      id: workshopTasks.id,
      completedAt: workshopTasks.completedAt,
      createdAt: workshopTasks.createdAt,
      reservationId: workshopTasks.reservationId,
    })
    .from(workshopTasks)
    .where(
      and(
        eq(workshopTasks.completedByUserId, employeeId),
        eq(workshopTasks.isCompleted, true),
        gte(workshopTasks.completedAt, thirtyDaysAgo)
      )
    );

  const tasksCompleted = completedTasks.length;

  // Calcul rapidité moyenne (heures entre création et complétion)
  const completionTimes = completedTasks
    .filter((t) => t.completedAt && t.createdAt)
    .map((t) => {
      const diff = new Date(t.completedAt!).getTime() - new Date(t.createdAt!).getTime();
      return diff / 3600000; // en heures
    });

  const avgCompletionHours =
    completionTimes.length > 0
      ? Math.round(completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length)
      : 0;

  // Dossiers urgents traités par cet employé
  const reservationIds = [...new Set(completedTasks.map((t) => t.reservationId))];
  let urgentHandled = 0;
  if (reservationIds.length > 0) {
    const urgentReservations = await db
      .select({ id: reservations.id })
      .from(reservations)
      .where(
        and(
          inArray(reservations.id, reservationIds),
          or(eq(reservations.urgency, "high"), eq(reservations.urgency, "critical"))
        )
      );
    urgentHandled = urgentReservations.length;
  }

  // Calcul du score (0-100)
  const volumeScore = Math.min(tasksCompleted * 4, 40); // max 40 pts
  const speedScore = avgCompletionHours > 0 ? Math.max(30 - Math.min(avgCompletionHours * 2, 30), 0) : 15; // max 30 pts
  const urgencyScore = Math.min(urgentHandled * 6, 30); // max 30 pts
  const score = Math.round(volumeScore + speedScore + urgencyScore);

  const rank =
    score >= 85 ? "Expert" : score >= 65 ? "Confirmé" : score >= 40 ? "Intermédiaire" : "Débutant";

  return { score, tasksCompleted, avgCompletionHours, urgentHandled, rank };
}

export function registerDashboardRoutes(app: Express) {
  // ─── GET /api/dashboard/atelier ─────────────────────────────────────────────
  // Vue globale atelier : en attente, en cours, terminés, urgences
  app.get("/api/dashboard/atelier", isAuthenticated, isAdminOrEmployee, async (_req, res) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [all, todayRows, urgentRows, lateRows, completedToday] = await Promise.all([
        db
          .select({
            id: reservations.id,
            atelierStatus: reservations.atelierStatus,
            urgency: reservations.urgency,
            status: reservations.status,
            scheduledDate: reservations.scheduledDate,
            estimatedEndDate: reservations.estimatedEndDate,
            wheelCount: reservations.wheelCount,
            assignedEmployeeId: reservations.assignedEmployeeId,
          })
          .from(reservations),

        db
          .select({ id: reservations.id })
          .from(reservations)
          .where(
            and(
              gte(reservations.scheduledDate, today),
              sql`${reservations.scheduledDate} < ${tomorrow}`,
              or(eq(reservations.status, "pending"), eq(reservations.status, "confirmed"))
            )
          ),

        db
          .select({ id: reservations.id })
          .from(reservations)
          .where(
            and(
              or(eq(reservations.urgency, "high"), eq(reservations.urgency, "critical")),
              or(eq(reservations.status, "pending"), eq(reservations.status, "confirmed"))
            )
          ),

        db
          .select({ id: reservations.id })
          .from(reservations)
          .where(
            and(
              sql`${reservations.estimatedEndDate} < ${new Date()}`,
              or(eq(reservations.status, "pending"), eq(reservations.status, "confirmed"))
            )
          ),

        db
          .select({ id: reservations.id })
          .from(reservations)
          .where(
            and(
              eq(reservations.status, "completed"),
              gte(reservations.updatedAt, today),
              sql`${reservations.updatedAt} < ${tomorrow}`
            )
          ),
      ]);

      const activeStatuses = ["reception", "attente", "preparation", "reparation", "finition", "controle"];
      const doneStatuses = ["termine", "restitution"];

      const pending = all.filter(
        (r) =>
          r.status === "pending" &&
          (r.atelierStatus === "reception" || r.atelierStatus === "attente")
      );
      const inProgress = all.filter(
        (r) =>
          ["pending", "confirmed"].includes(r.status || "") &&
          activeStatuses.includes(r.atelierStatus || "reception") &&
          !["reception", "attente"].includes(r.atelierStatus || "")
      );
      const completed = all.filter(
        (r) => r.status === "completed" || doneStatuses.includes(r.atelierStatus || "")
      );

      const wheelsInProgress = inProgress.reduce((sum, r) => sum + (r.wheelCount || 0), 0);
      const unassigned = all.filter(
        (r) =>
          !r.assignedEmployeeId &&
          ["pending", "confirmed"].includes(r.status || "")
      ).length;

      const byAtelierStatus = Object.fromEntries(
        ["reception", "attente", "preparation", "reparation", "finition", "controle", "termine", "restitution"].map(
          (s) => [s, all.filter((r) => (r.atelierStatus || "reception") === s).length]
        )
      );

      const byUrgency = {
        none: all.filter((r) => !r.urgency || r.urgency === "none").length,
        low: all.filter((r) => r.urgency === "low").length,
        medium: all.filter((r) => r.urgency === "medium").length,
        high: all.filter((r) => r.urgency === "high").length,
        critical: all.filter((r) => r.urgency === "critical").length,
      };

      res.json({
        summary: {
          total: all.length,
          pending: pending.length,
          inProgress: inProgress.length,
          completed: completed.length,
          urgent: urgentRows.length,
          today: todayRows.length,
          late: lateRows.length,
          completedToday: completedToday.length,
          wheelsInProgress,
          unassigned,
        },
        byAtelierStatus,
        byUrgency,
      });
    } catch (err: any) {
      console.error("[Dashboard] atelier error:", err);
      res.status(500).json({ message: err.message || "Erreur serveur" });
    }
  });

  // ─── GET /api/dashboard/employe/:id ─────────────────────────────────────────
  // Dashboard individuel employé : tâches, priorités, score, progression
  app.get("/api/dashboard/employe/:id", isAuthenticated, isAdminOrEmployee, async (req: any, res) => {
    try {
      const { id } = req.params;

      // Sécurité : un employé ne peut voir que son propre dashboard
      if (req.user.role === "employe" && req.user.id !== id) {
        return res.status(403).json({ message: "Accès refusé" });
      }

      const [employee] = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          role: users.role,
          profileImageUrl: users.profileImageUrl,
        })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!employee) return res.status(404).json({ message: "Employé introuvable" });

      // Dossiers assignés à cet employé
      const assignedDossiers = await db
        .select({
          id: reservations.id,
          reference: reservations.reference,
          atelierStatus: reservations.atelierStatus,
          urgency: reservations.urgency,
          status: reservations.status,
          scheduledDate: reservations.scheduledDate,
          estimatedEndDate: reservations.estimatedEndDate,
          vehicleMake: reservations.vehicleMake,
          vehicleModel: reservations.vehicleModel,
          vehicleRegistration: reservations.vehicleRegistration,
          serviceName: services.name,
        })
        .from(reservations)
        .leftJoin(services, eq(reservations.serviceId, services.id))
        .where(eq(reservations.assignedEmployeeId, id))
        .orderBy(desc(reservations.scheduledDate));

      // Tâches complétées par cet employé
      const completedTasksCount = await db
        .select({ count: count() })
        .from(workshopTasks)
        .where(
          and(
            eq(workshopTasks.completedByUserId, id),
            eq(workshopTasks.isCompleted, true)
          )
        );

      // Tâches en attente sur dossiers assignés
      const pendingTasksResult = await db
        .select({ count: count() })
        .from(workshopTasks)
        .where(eq(workshopTasks.isCompleted, false));

      const scoreData = await calculateEmployeeScore(id);

      const activeCount = assignedDossiers.filter((d) =>
        ["pending", "confirmed"].includes(d.status || "")
      ).length;
      const completedDossiers = assignedDossiers.filter((d) => d.status === "completed").length;
      const urgentDossiers = assignedDossiers.filter(
        (d) => d.urgency === "high" || d.urgency === "critical"
      ).length;

      res.json({
        employee,
        stats: {
          assignedTotal: assignedDossiers.length,
          active: activeCount,
          completed: completedDossiers,
          urgent: urgentDossiers,
          tasksCompleted: completedTasksCount[0]?.count || 0,
          pendingTasks: pendingTasksResult[0]?.count || 0,
        },
        scoring: scoreData,
        dossiers: assignedDossiers,
      });
    } catch (err: any) {
      console.error("[Dashboard] employe error:", err);
      res.status(500).json({ message: err.message || "Erreur serveur" });
    }
  });

  // ─── GET /api/dashboard/admin ────────────────────────────────────────────────
  // Vue admin : performance employés, charge globale, classement
  app.get("/api/dashboard/admin", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      // Récupère tous les employés
      const employees = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          role: users.role,
          profileImageUrl: users.profileImageUrl,
        })
        .from(users)
        .where(
          or(
            eq(users.role, "employe"),
            eq(users.role, "admin")
          )
        );

      // Score de chaque employé en parallèle
      const employeeScores = await Promise.all(
        employees.map(async (emp) => {
          const score = await calculateEmployeeScore(emp.id);
          // Compter les dossiers assignés actifs
          const [assignedCount] = await db
            .select({ count: count() })
            .from(reservations)
            .where(
              and(
                eq(reservations.assignedEmployeeId, emp.id),
                or(eq(reservations.status, "pending"), eq(reservations.status, "confirmed"))
              )
            );
          return {
            ...emp,
            name: [emp.firstName, emp.lastName].filter(Boolean).join(" ") || emp.email,
            ...score,
            activeDossiers: assignedCount?.count || 0,
          };
        })
      );

      // Classement par score
      employeeScores.sort((a, b) => b.score - a.score);
      const ranked = employeeScores.map((e, i) => ({ ...e, position: i + 1 }));

      // Stats globales charge
      const [totalActive, totalUrgent, totalUnassigned, totalCompleted] = await Promise.all([
        db
          .select({ count: count() })
          .from(reservations)
          .where(or(eq(reservations.status, "pending"), eq(reservations.status, "confirmed"))),
        db
          .select({ count: count() })
          .from(reservations)
          .where(
            and(
              or(eq(reservations.urgency, "high"), eq(reservations.urgency, "critical")),
              or(eq(reservations.status, "pending"), eq(reservations.status, "confirmed"))
            )
          ),
        db
          .select({ count: count() })
          .from(reservations)
          .where(
            and(
              sql`${reservations.assignedEmployeeId} IS NULL`,
              or(eq(reservations.status, "pending"), eq(reservations.status, "confirmed"))
            )
          ),
        db
          .select({ count: count() })
          .from(reservations)
          .where(eq(reservations.status, "completed")),
      ]);

      res.json({
        employees: ranked,
        globalLoad: {
          totalActive: totalActive[0]?.count || 0,
          totalUrgent: totalUrgent[0]?.count || 0,
          totalUnassigned: totalUnassigned[0]?.count || 0,
          totalCompleted: totalCompleted[0]?.count || 0,
        },
      });
    } catch (err: any) {
      console.error("[Dashboard] admin error:", err);
      res.status(500).json({ message: err.message || "Erreur serveur" });
    }
  });

  // ─── PATCH /api/dossiers/:id/assign ─────────────────────────────────────────
  app.patch("/api/dossiers/:id/assign", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { employeeId } = req.body;

      const [current] = await db
        .select()
        .from(reservations)
        .where(eq(reservations.id, id))
        .limit(1);
      if (!current) return res.status(404).json({ message: "Dossier introuvable" });

      const [updated] = await db
        .update(reservations)
        .set({
          assignedEmployeeId: employeeId || null,
          updatedAt: new Date(),
          version: (current.version || 1) + 1,
          lastUpdated: new Date(),
        })
        .where(eq(reservations.id, id))
        .returning();

      try {
        broadcastToUser("*", { type: "dossier_assigned", data: { id, employeeId } });
        if (employeeId) {
          broadcastToUser(employeeId, {
            type: "dossier_assigned",
            data: { id, message: "Un dossier vous a été assigné" },
          });
        }
      } catch {}

      res.json(updated);
    } catch (err: any) {
      console.error("[Dashboard] assign error:", err);
      res.status(500).json({ message: err.message || "Erreur serveur" });
    }
  });

  // ─── PATCH /api/dossiers/:id/priority ───────────────────────────────────────
  // Alias pour la priorité (mappe sur le champ urgency existant)
  // priority: "low" | "medium" | "urgent" → urgency: "low" | "medium" | "high"
  app.patch("/api/dossiers/:id/priority", isAuthenticated, isAdminOrEmployee, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { priority } = req.body;

      if (!["low", "medium", "urgent", "none"].includes(priority)) {
        return res.status(400).json({ message: "Priorité invalide" });
      }

      // Mapping priority → urgency
      const urgencyMap: Record<string, string> = {
        none: "none",
        low: "low",
        medium: "medium",
        urgent: "high",
      };
      const urgency = urgencyMap[priority];

      const [current] = await db
        .select()
        .from(reservations)
        .where(eq(reservations.id, id))
        .limit(1);
      if (!current) return res.status(404).json({ message: "Dossier introuvable" });

      const [updated] = await db
        .update(reservations)
        .set({
          urgency: urgency as any,
          updatedAt: new Date(),
          version: (current.version || 1) + 1,
          lastUpdated: new Date(),
        })
        .where(eq(reservations.id, id))
        .returning();

      try {
        broadcastToUser("*", { type: "dossier_priority_changed", data: { id, urgency } });
      } catch {}

      res.json({ ...updated, priority });
    } catch (err: any) {
      console.error("[Dashboard] priority error:", err);
      res.status(500).json({ message: err.message || "Erreur serveur" });
    }
  });
}
