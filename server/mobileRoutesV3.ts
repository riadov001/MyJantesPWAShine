// Mobile API v3 — Task #4 routes
// - Public viewToken endpoints (devis, facture, réservation, avis)
// - Configurateur 3D quote/estimate aliases
// - AR wheel detect mobile alias
// - Universal Links well-known files

import type { Express, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { isAuthenticated } from "./localAuth";
import { quotes, invoices, reservations, reviews } from "@shared/schema";

// Express does not type its internal _router. We narrow access through a
// dedicated interface so the dispatch helper stays type-safe and readable.
interface ExpressWithRouter extends Express {
  _router: {
    handle: (req: Request, res: Response, next: NextFunction) => void;
  };
}

function forward(app: Express, target: string) {
  const router = (app as ExpressWithRouter)._router;
  return (req: Request, res: Response, next: NextFunction) => {
    let path = target;
    for (const [k, v] of Object.entries(req.params || {})) {
      path = path.replace(`:${k}`, encodeURIComponent(String(v)));
    }
    const qIndex = req.originalUrl.indexOf("?");
    const qs = qIndex >= 0 ? req.originalUrl.slice(qIndex) : "";
    req.url = path + qs;
    router.handle(req, res, next);
  };
}

// HMAC-based view token for reservations (no schema migration needed).
// Format: <base64url(reservationId)>.<base64url(hmac)>
function reservationSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    throw new Error("SESSION_SECRET is required for reservation token signing");
  }
  return s;
}
export function signReservationToken(reservationId: string): string {
  const idEnc = Buffer.from(reservationId).toString("base64url");
  const sig = crypto
    .createHmac("sha256", reservationSecret())
    .update(reservationId)
    .digest("base64url");
  return `${idEnc}.${sig}`;
}
function verifyReservationToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const id = (() => {
    try {
      return Buffer.from(parts[0], "base64url").toString("utf8");
    } catch {
      return "";
    }
  })();
  if (!id) return null;
  const expected = crypto
    .createHmac("sha256", reservationSecret())
    .update(id)
    .digest("base64url");
  const a = Buffer.from(parts[1]);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return crypto.timingSafeEqual(a, b) ? id : null;
}

export async function registerMobileRoutesV3(app: Express) {
  // ==================================================================
  // .well-known files for iOS Universal Links + Android App Links
  // ==================================================================
  app.get("/.well-known/apple-app-site-association", (_req, res) => {
    res.type("application/json").json({
      applinks: {
        apps: [],
        details: [
          {
            appID: `${process.env.APPLE_TEAM_ID || "TEAMID"}.fr.myjantes.app`,
            paths: [
              "/public/devis/*",
              "/public/facture/*",
              "/public/reservation/*",
              "/public/avis/*",
            ],
          },
        ],
      },
      webcredentials: {
        apps: [`${process.env.APPLE_TEAM_ID || "TEAMID"}.fr.myjantes.app`],
      },
    });
  });

  app.get("/.well-known/assetlinks.json", (_req, res) => {
    const fingerprint = process.env.ANDROID_SHA256_CERT_FINGERPRINT || "";
    res.type("application/json").json([
      {
        relation: [
          "delegate_permission/common.handle_all_urls",
          "delegate_permission/common.get_login_creds",
        ],
        target: {
          namespace: "android_app",
          package_name: "fr.myjantes.app",
          sha256_cert_fingerprints: fingerprint ? [fingerprint] : [],
        },
      },
    ]);
  });

  // ==================================================================
  // PUBLIC VIEW-TOKEN ROUTES (mobile aliases of /api/public/*)
  // No auth required; the token IS the auth.
  // ==================================================================

  // --- Quotes / Devis ---
  app.get("/api/mobile/public/quotes/:token", forward(app, "/api/public/quotes/:token"));
  app.post("/api/mobile/public/quotes/:token/accept", forward(app, "/api/public/quotes/:token/accept"));
  app.post("/api/mobile/public/quotes/:token/reject", forward(app, "/api/public/quotes/:token/reject"));
  app.get("/api/mobile/public/quotes/:token/available-slots", forward(app, "/api/public/quotes/:token/available-slots"));
  app.post("/api/mobile/public/quotes/:token/book", forward(app, "/api/public/quotes/:token/book"));
  app.get("/api/mobile/public/quotes/:token/reservation", forward(app, "/api/public/quotes/:token/reservation"));

  // --- Invoices / Facture ---
  app.get("/api/mobile/public/invoices/:token", forward(app, "/api/public/invoices/:token"));
  app.post("/api/mobile/public/invoices/:token/create-checkout", forward(app, "/api/public/invoices/:token/create-checkout"));
  app.get("/api/mobile/public/invoices/:token/payment-status", forward(app, "/api/public/invoices/:token/payment-status"));

  // --- Reviews / Avis ---
  app.get("/api/mobile/public/reviews/:token", forward(app, "/api/public/reviews/:token"));
  app.post("/api/mobile/public/reviews/:token", forward(app, "/api/public/reviews/:token"));

  // --- Reservation public viewer (HMAC-signed token; no DB migration) ---
  app.get("/api/mobile/public/reservations/:token", async (req, res) => {
    try {
      const id = verifyReservationToken(req.params.token);
      if (!id) return res.status(403).json({ message: "Token invalide" });
      const [r] = await db.select().from(reservations).where(eq(reservations.id, id));
      if (!r) return res.status(404).json({ message: "Réservation introuvable" });
      const service = r.serviceId ? await storage.getService(r.serviceId) : null;
      const garage = r.garageId ? await storage.getGarage(r.garageId) : null;
      res.json({
        reservation: {
          id: r.id,
          reference: r.reference,
          status: r.status,
          scheduledDate: r.scheduledDate,
          estimatedEndDate: r.estimatedEndDate,
          notes: r.notes,
        },
        service: service ? { id: service.id, name: service.name, description: service.description } : null,
        garage: garage
          ? {
              name: garage.name,
              logo: garage.logo,
              primaryColor: garage.primaryColor,
              phone: garage.phone,
              address: garage.address,
              postalCode: garage.postalCode,
              city: garage.city,
            }
          : null,
      });
    } catch (e: any) {
      console.error("[MobileV3] reservation by reference error", e);
      res.status(500).json({ message: e.message });
    }
  });

  // --- Reservation public actions (token-based) ---
  app.post("/api/mobile/public/reservations/:token/confirm", async (req, res) => {
    try {
      const id = verifyReservationToken(req.params.token);
      if (!id) return res.status(403).json({ message: "Token invalide" });
      const updated = await storage.updateReservation(id, { status: "confirmed" });
      res.json({ status: updated?.status || "confirmed" });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/mobile/public/reservations/:token/cancel", async (req, res) => {
    try {
      const id = verifyReservationToken(req.params.token);
      if (!id) return res.status(403).json({ message: "Token invalide" });
      const updated = await storage.updateReservation(id, { status: "cancelled" });
      res.json({ status: updated?.status || "cancelled" });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ==================================================================
  // OWNERSHIP RESOLVER — used by mobile deep-link screens to decide
  // whether to redirect an authenticated owner to their full app view.
  // ==================================================================
  app.get("/api/mobile/public/resolve-token", async (req, res) => {
    try {
      const kind = String(req.query.kind || "").toLowerCase();
      const token = String(req.query.token || "");
      if (!token || !kind) return res.status(400).json({ message: "kind/token requis" });

      let ownerId: string | null = null;
      let resourceId: string | null = null;

      if (kind === "devis" || kind === "quote") {
        const [q] = await db.select().from(quotes).where(eq(quotes.viewToken, token));
        if (q) {
          ownerId = q.clientId ?? null;
          resourceId = q.id;
        }
      } else if (kind === "facture" || kind === "invoice") {
        const [inv] = await db.select().from(invoices).where(eq(invoices.viewToken, token));
        if (inv) {
          ownerId = inv.clientId ?? null;
          resourceId = inv.id;
        }
      } else if (kind === "avis" || kind === "review") {
        const [rv] = await db.select().from(reviews).where(eq(reviews.reviewToken, token));
        if (rv) {
          ownerId = rv.clientId ?? null;
          resourceId = rv.id;
        }
      } else if (kind === "reservation") {
        const id = verifyReservationToken(token);
        if (id) {
          const [r] = await db.select().from(reservations).where(eq(reservations.id, id));
          if (r) {
            ownerId = r.clientId ?? null;
            resourceId = r.id;
          }
        }
      } else {
        return res.status(400).json({ message: "kind invalide" });
      }

      if (!resourceId) return res.status(404).json({ message: "Introuvable" });
      res.json({ ownerId, resourceId });
    } catch (e: any) {
      console.error("[MobileV3] resolve-token error", e);
      res.status(500).json({ message: e.message });
    }
  });

  // ==================================================================
  // CONFIGURATEUR — mobile aliases of /api/configurator/* (auth)
  // ==================================================================
  app.post("/api/mobile/configurator/quote-request", forward(app, "/api/configurator/quote-request"));
  app.post("/api/mobile/configurator/estimate", forward(app, "/api/configurator/estimate"));
  app.post("/api/mobile/ai/analyze-wheel-params", forward(app, "/api/ai/analyze-wheel-params"));

  // ==================================================================
  // AR — composite (server-side rendered try-on result for sharing)
  // ==================================================================
  // Body: multipart/form-data with `image` (file) + `wheels` (JSON string of
  // [{x,y,radius}] normalised 0..1) + `color` (hex). Returns a composited
  // JPEG with translucent coloured discs overlaid at each wheel position.
  // The mobile client saves and shares this result so the user can post the
  // generated try-on, not just the raw photo.
  const arUpload = (await import("multer")).default({
    storage: (await import("multer")).default.memoryStorage(),
    limits: { fileSize: 12 * 1024 * 1024 },
  }).single("image");

  app.post("/api/mobile/ar/composite", arUpload, async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "Image manquante" });
      const wheels: Array<{ x: number; y: number; radius: number }> = JSON.parse(
        String(req.body?.wheels || "[]"),
      );
      const colorHex = String(req.body?.color || "#dc2626");
      const sharp = (await import("sharp")).default;
      const meta = await sharp(req.file.buffer).metadata();
      const W = meta.width || 1024;
      const H = meta.height || 1024;
      const circles = wheels
        .map((w) => {
          const cx = Math.round(w.x * W);
          const cy = Math.round(w.y * H);
          const r = Math.round(w.radius * W);
          return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${colorHex}" fill-opacity="0.78" stroke="#000" stroke-width="${Math.max(2, r * 0.04)}" />`;
        })
        .join("");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${circles}</svg>`;
      const out = await sharp(req.file.buffer)
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .jpeg({ quality: 88 })
        .toBuffer();
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "no-store");
      res.send(out);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ==================================================================
  // Public viewer-token issuer for reservations (used by emails / SMS)
  // ==================================================================
  app.get("/api/mobile/reservations/:id/view-token", isAuthenticated, async (req: any, res) => {
    try {
      const id = req.params.id;
      const [r] = await db.select().from(reservations).where(eq(reservations.id, id));
      if (!r) return res.status(404).json({ message: "Réservation introuvable" });
      const userId: string | undefined = req.user?.id || req.user?.claims?.sub;
      const role: string | undefined = req.user?.role;
      const isOwner = userId && r.clientId === userId;
      const isAdminLike = role === "admin" || role === "superadmin" || role === "root" || role === "employe";
      if (!isOwner && !isAdminLike) {
        return res.status(403).json({ message: "Accès refusé" });
      }
      res.json({ token: signReservationToken(id), reference: r.reference });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  console.log("[MobileV3] Routes Task #4 enregistrées (public token, configurateur, AR, .well-known)");
}
