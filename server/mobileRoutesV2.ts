// Mobile API v2 — additive routes for the published iOS app and the next version.
// Every existing /api/mobile/* route in mobileRoutes.ts is preserved unchanged.
// New endpoints below are grouped by domain.

import type { Express, Request, Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import crypto from "crypto";
import { isAuthenticated, isAdmin } from "./localAuth";
import { storage } from "./storage";
import { db } from "./db";
import {
  deviceTokens,
  reviews,
  insertReservationSchema,
  insertDeviceTokenSchema,
  insertReviewSchema,
} from "@shared/schema";
import { getAvailableSlots } from "./frenchBusinessHours";
import { getBaseUrl } from "./urlHelper";

const APP_LATEST_IOS = process.env.MOBILE_LATEST_IOS_VERSION ?? "1.0.0";
const APP_MIN_IOS = process.env.MOBILE_MIN_IOS_VERSION ?? "1.0.0";
const APP_LATEST_ANDROID = process.env.MOBILE_LATEST_ANDROID_VERSION ?? "1.0.0";
const APP_MIN_ANDROID = process.env.MOBILE_MIN_ANDROID_VERSION ?? "1.0.0";

function pickStripeKey(env = process.env) {
  return {
    secret: env.STRIPE_SECRET_KEY_PROD || env.STRIPE_SECRET_KEY || env.STRIPE_API_KEY || "",
    publishable: env.STRIPE_PUBLISHABLE_KEY_PROD || env.STRIPE_PUBLISHABLE_KEY || "",
  };
}

export function registerMobileRoutesV2(app: Express) {
  // ============================================================
  // 1. HEALTH / VERSION / GARAGE (no auth)
  // ============================================================

  app.get("/api/mobile/health", (_req, res) => {
    res.json({
      ok: true,
      service: "myjantes-api",
      time: new Date().toISOString(),
      uptimeSec: Math.round(process.uptime()),
    });
  });

  app.get("/api/mobile/version", (_req, res) => {
    res.json({
      ios: { latest: APP_LATEST_IOS, min: APP_MIN_IOS },
      android: { latest: APP_LATEST_ANDROID, min: APP_MIN_ANDROID },
      maintenance: process.env.MOBILE_MAINTENANCE === "true",
    });
  });

  app.get("/api/mobile/garage", async (_req, res) => {
    try {
      const all = await storage.getGarages?.();
      const g = Array.isArray(all) && all.length ? all[0] : null;
      if (!g) return res.json({});
      res.json({
        id: g.id,
        name: g.name,
        slug: g.slug,
        logo: g.logo,
        tagline: g.tagline,
        address: g.address,
        city: g.city,
        postalCode: g.postalCode,
        phone: g.phone,
        email: g.email,
        website: g.website,
        primaryColor: g.primaryColor,
        secondaryColor: g.secondaryColor,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ============================================================
  // 2. AUTH EXTRAS
  // ============================================================

  // Idempotent logout — for stateless JWT, the client just discards tokens.
  app.post("/api/mobile/auth/logout", async (req: any, res) => {
    try {
      if (req.session?.destroy) {
        req.session.destroy(() => res.json({ ok: true }));
        return;
      }
      res.json({ ok: true });
    } catch (e: any) {
      res.json({ ok: true });
    }
  });

  // Forgot password — placeholder that always returns 200 to avoid email enumeration.
  app.post("/api/mobile/auth/forgot-password", async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      if (email) {
        const u = await storage.getUserByEmail(email).catch(() => null);
        if (u) {
          // Hook your password-reset email here (Resend) when ready.
          console.log(`[MobileAuth] forgot-password requested for ${email}`);
        }
      }
      res.json({ ok: true, message: "Si l'email existe, un lien sera envoyé." });
    } catch {
      res.json({ ok: true });
    }
  });

  // ============================================================
  // 2b. FIREBASE SIGN-IN (Apple / Google) — verify ID token, return JWT
  // ============================================================

  app.post("/api/mobile/auth/firebase", async (req, res) => {
    try {
      const { idToken, provider } = req.body ?? {};
      if (!idToken || typeof idToken !== "string") {
        return res.status(400).json({ message: "idToken requis" });
      }

      const { initializeFirebase } = await import("./firebase");
      initializeFirebase();
      const { getAuth } = await import("firebase-admin/auth");
      type DecodedIdToken = Awaited<ReturnType<ReturnType<typeof getAuth>["verifyIdToken"]>>;

      let decoded: DecodedIdToken;
      try {
        decoded = await getAuth().verifyIdToken(idToken, true);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[MobileAuth/firebase] verifyIdToken failed:", message);
        return res.status(401).json({ message: "Token Firebase invalide" });
      }

      // Provider allowlist: only Apple + Google sign-in tokens are accepted.
      const ALLOWED_PROVIDERS = new Set(["apple.com", "google.com"]);
      const signInProvider = decoded.firebase?.sign_in_provider;
      if (!signInProvider || !ALLOWED_PROVIDERS.has(signInProvider)) {
        console.warn(`[MobileAuth/firebase] Provider non autorisé: ${signInProvider}`);
        return res.status(403).json({ message: "Provider d'authentification non autorisé" });
      }

      const email = (decoded.email ?? "").toLowerCase().trim();
      if (!email) {
        return res.status(400).json({ message: "Email manquant dans le token Firebase" });
      }

      // email_verified prevents account takeover via email collision.
      // Apple Sign-In always verifies emails (including private relay addresses);
      // Google Sign-In also guarantees email_verified. Reject only explicit false.
      if (decoded.email_verified === false) {
        console.warn(`[MobileAuth/firebase] Email non vérifié: ${email} (provider=${signInProvider})`);
        return res.status(403).json({ message: "Email non vérifié par le fournisseur d'authentification" });
      }

      let user = await storage.getUserByEmail(email).catch(() => undefined);

      if (!user) {
        const displayName = (decoded.name ?? "").trim();
        const [firstName, ...rest] = displayName.split(/\s+/).filter(Boolean);
        const lastName = rest.join(" ");
        user = await storage.createUser({
          email,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          role: "client",
        });
        console.log(`[MobileAuth/firebase] Created new user ${email} via ${provider ?? "firebase"}`);
      }

      const { signAccessToken, signRefreshToken } = await import("./localAuth");
      const payload = { userId: user.id, email: user.email, role: user.role };
      const accessToken = signAccessToken(payload);
      const refreshToken = signRefreshToken(payload);

      const { password: _pw, ...safeUser } = user;
      res.json({
        accessToken,
        refreshToken,
        tokenType: "Bearer",
        user: safeUser,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur serveur";
      console.error("[MobileAuth/firebase] Error:", err);
      res.status(500).json({ message });
    }
  });

  // Mobile registration (particulier or pro) — separate from web /api/register
  app.post("/api/mobile/auth/register", async (req, res) => {
    try {
      const {
        email, password, firstName, lastName, phone, role,
        companyName, siret, tvaNumber, companyAddress,
      } = req.body ?? {};

      if (!email || !password) {
        return res.status(400).json({ message: "Email et mot de passe requis" });
      }
      if (String(password).length < 6) {
        return res.status(400).json({ message: "Mot de passe trop court (min 6 caractères)" });
      }

      const allowedRoles = ["client", "client_professionnel"] as const;
      type ClientRole = (typeof allowedRoles)[number];
      const userRole: ClientRole = allowedRoles.includes(role) ? role : "client";
      if (userRole === "client_professionnel" && !companyName) {
        return res.status(400).json({ message: "Nom de l'entreprise requis pour un compte professionnel" });
      }

      const normalizedEmail = String(email).toLowerCase().trim();
      const existing = await storage.getUserByEmail(normalizedEmail).catch(() => undefined);
      if (existing) {
        return res.status(409).json({ message: "Cet email est déjà utilisé" });
      }

      const { hashPassword, signAccessToken, signRefreshToken } = await import("./localAuth");
      const hashed = await hashPassword(String(password));

      const user = await storage.createUser({
        email: normalizedEmail,
        password: hashed,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        phone: phone || undefined,
        role: userRole,
        companyName: userRole === "client_professionnel" ? (companyName || undefined) : undefined,
        siret: userRole === "client_professionnel" ? (siret || undefined) : undefined,
        tvaNumber: userRole === "client_professionnel" ? (tvaNumber || undefined) : undefined,
        companyAddress: userRole === "client_professionnel" ? (companyAddress || undefined) : undefined,
      });

      const payload = { userId: user.id, email: user.email, role: user.role };
      const accessToken = signAccessToken(payload);
      const refreshToken = signRefreshToken(payload);
      const { password: _pw, ...safeUser } = user;
      res.status(201).json({ accessToken, refreshToken, tokenType: "Bearer", user: safeUser });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur serveur";
      console.error("[MobileAuth/register] Error:", err);
      res.status(500).json({ message });
    }
  });

  // ============================================================
  // 3. PUSH NOTIFICATIONS — DEVICE TOKEN REGISTRATION
  // ============================================================

  app.post("/api/mobile/devices/register", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Non authentifié" });

      const parsed = insertDeviceTokenSchema.parse({
        userId,
        token: String(req.body?.token || ""),
        platform: req.body?.platform === "android" ? "android" : "ios",
        appVersion: req.body?.appVersion ?? null,
        deviceModel: req.body?.deviceModel ?? null,
        locale: req.body?.locale ?? null,
        isActive: true,
      });

      if (!parsed.token) return res.status(400).json({ message: "Token requis" });

      const [existing] = await db.select().from(deviceTokens).where(eq(deviceTokens.token, parsed.token));
      if (existing) {
        const [updated] = await db.update(deviceTokens)
          .set({ userId, isActive: true, appVersion: parsed.appVersion, deviceModel: parsed.deviceModel, locale: parsed.locale, platform: parsed.platform, updatedAt: new Date() })
          .where(eq(deviceTokens.id, existing.id))
          .returning();
        return res.json({ ok: true, device: updated });
      }
      const [inserted] = await db.insert(deviceTokens).values(parsed).returning();
      res.json({ ok: true, device: inserted });
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.delete("/api/mobile/devices/:token", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      await db.update(deviceTokens)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(deviceTokens.token, req.params.token), eq(deviceTokens.userId, userId)));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/mobile/devices", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const list = await db.select().from(deviceTokens)
        .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.isActive, true)));
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ============================================================
  // 4. RESERVATIONS — CREATE / UPDATE / CANCEL / AVAILABILITY
  // ============================================================

  app.get("/api/mobile/reservations/availability", isAuthenticated, async (req: any, res) => {
    try {
      const now = new Date();
      const year = parseInt(String(req.query.year || now.getFullYear()), 10);
      const month = parseInt(String(req.query.month || now.getMonth() + 1), 10);
      const duration = parseInt(String(req.query.duration || 60), 10);
      const garageId = req.user?.garageId;
      const all = await storage.getReservations(undefined, garageId);
      const days = getAvailableSlots(year, month, duration, all as Array<{ scheduledDate: string | Date; estimatedEndDate?: string | Date | null; durationMinutes?: number }>);
      res.json({ year, month, duration, days });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/mobile/reservations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const role = req.user?.role;
      const isStaff = ["root", "rootadmin", "superadmin", "admin", "employe"].includes(role);
      const userGarageId = req.user?.garageId;

      // Strip ownership fields from client input — derive from authenticated context.
      // Staff may override clientId/garageId; everyone else is forced to self/own garage.
      const { clientId: bodyClientId, garageId: bodyGarageId, status: bodyStatus, ...rest } = req.body ?? {};

      const data = insertReservationSchema.parse({
        ...rest,
        clientId: isStaff ? (bodyClientId ?? userId) : userId,
        garageId: isStaff ? (bodyGarageId ?? userGarageId) : userGarageId,
        status: isStaff ? (bodyStatus ?? "pending") : "pending",
      });
      const created = await storage.createReservation(data);
      res.status(201).json(created);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/mobile/reservations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const role = req.user?.role;
      const r = await storage.getReservation(req.params.id);
      if (!r) return res.status(404).json({ message: "Réservation introuvable" });
      const isStaff = ["root", "rootadmin", "superadmin", "admin", "employe"].includes(role);
      if (!isStaff && r.clientId !== userId) {
        return res.status(403).json({ message: "Non autorisé" });
      }

      // Business rule: clients cannot cancel/reschedule less than 24h before scheduledDate.
      if (!isStaff && r.scheduledDate) {
        const scheduled = new Date(r.scheduledDate as string | Date).getTime();
        const wantsCancel = req.body?.status === "cancelled";
        const wantsReschedule = req.body?.scheduledDate && req.body.scheduledDate !== r.scheduledDate;
        if (wantsCancel || wantsReschedule) {
          const hoursBefore = (scheduled - Date.now()) / 3_600_000;
          if (hoursBefore < 24) {
            return res.status(400).json({
              message: "Modification ou annulation impossible à moins de 24h du rendez-vous.",
            });
          }
        }
      }

      // Clients can only cancel or reschedule their own
      const allowed = isStaff
        ? req.body
        : { status: req.body?.status === "cancelled" ? "cancelled" : r.status, scheduledDate: req.body?.scheduledDate ?? r.scheduledDate };
      const updated = await storage.updateReservation(req.params.id, allowed);
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.delete("/api/mobile/reservations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const role = req.user?.role;
      const r = await storage.getReservation(req.params.id);
      if (!r) return res.status(404).json({ message: "Réservation introuvable" });
      const isStaff = ["root", "rootadmin", "superadmin", "admin"].includes(role);
      if (!isStaff && r.clientId !== userId) {
        return res.status(403).json({ message: "Non autorisé" });
      }

      // Business rule: clients cannot cancel less than 24h before scheduledDate.
      if (!isStaff && r.scheduledDate) {
        const scheduled = new Date(r.scheduledDate as string | Date).getTime();
        const hoursBefore = (scheduled - Date.now()) / 3_600_000;
        if (hoursBefore < 24) {
          return res.status(400).json({
            message: "Annulation impossible à moins de 24h du rendez-vous.",
          });
        }
      }

      // Clients soft-cancel; admins hard-delete
      if (isStaff) {
        await storage.deleteReservation(req.params.id);
      } else {
        await storage.updateReservation(req.params.id, { status: "cancelled" });
      }
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ============================================================
  // 5. REVIEWS — PUBLIC LIST + CLIENT SUBMIT
  // ============================================================

  app.get("/api/mobile/reviews", async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit || 20), 10), 100);
      const list = await db.select().from(reviews)
        .where(eq(reviews.isApproved, true))
        .orderBy(desc(reviews.createdAt))
        .limit(limit);
      res.json(list.map((r: any) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        clientName: r.clientName,
        createdAt: r.createdAt,
      })));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/mobile/reviews", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const me = await storage.getUser(userId);
      const body = req.body || {};
      const rating = parseInt(String(body.rating), 10);
      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Note invalide (1-5)" });
      }
      let invoiceGarageId: string | undefined;
      if (body.invoiceId) {
        const inv = await storage.getInvoice(body.invoiceId);
        if (!inv) return res.status(404).json({ message: "Facture introuvable" });
        if (inv.clientId !== userId) return res.status(403).json({ message: "Non autorisé" });
        invoiceGarageId = inv.garageId ?? undefined;
      }
      const data = insertReviewSchema.parse({
        garageId: invoiceGarageId ?? me?.garageId ?? null,
        invoiceId: body.invoiceId ?? null,
        quoteId: body.quoteId ?? null,
        clientId: userId,
        clientName: `${me?.firstName ?? ""} ${me?.lastName ?? ""}`.trim() || null,
        rating,
        comment: body.comment ?? null,
        reviewToken: crypto.randomBytes(24).toString("hex"),
        isApproved: false,
      });
      const [created] = await db.insert(reviews).values(data).returning();
      res.status(201).json(created);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // ============================================================
  // 6. STRIPE — PAYMENT INTENT FOR INVOICES
  // ============================================================

  app.get("/api/mobile/payment/config", (_req, res) => {
    const { publishable } = pickStripeKey();
    res.json({
      publishableKey: publishable,
      currency: "eur",
      countryCode: "FR",
    });
  });

  app.post("/api/mobile/invoices/:id/payment-intent", isAuthenticated, async (req: any, res) => {
    try {
      const { secret, publishable } = pickStripeKey();
      if (!secret) return res.status(500).json({ message: "Stripe non configuré" });
      const userId = req.user?.id || req.user?.claims?.sub;
      const role = req.user?.role;
      const inv = await storage.getInvoice(req.params.id);
      if (!inv) return res.status(404).json({ message: "Facture introuvable" });
      const isStaff = ["root", "rootadmin", "superadmin", "admin", "employe"].includes(role);
      if (!isStaff && inv.clientId !== userId) {
        return res.status(403).json({ message: "Non autorisé" });
      }
      if (inv.status === "paid") return res.status(409).json({ message: "Facture déjà payée" });

      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(secret);
      const amountCents = Math.round(parseFloat(String(inv.amount || "0")) * 100);
      if (amountCents <= 0) return res.status(400).json({ message: "Montant invalide" });

      const intent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: "eur",
        automatic_payment_methods: { enabled: true },
        metadata: {
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber ?? "",
          clientId: String(inv.clientId ?? ""),
          source: "mobile",
        },
      });
      res.json({
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id,
        amount: amountCents,
        currency: "eur",
        publishableKey: publishable,
      });
    } catch (e: any) {
      console.error("[MobilePay] payment-intent error", e);
      res.status(500).json({ message: e.message });
    }
  });

  // ============================================================
  // 7. PDF SHORTCUTS (mobile-friendly aliases)
  // ============================================================

  app.get("/api/mobile/invoices/:id/pdf", isAuthenticated, async (req: any, res, next) => {
    // Reuse the existing handler at /api/invoices/:id/pdf
    req.url = `/api/invoices/${req.params.id}/pdf`;
    return (app as any)._router.handle(req, res, next);
  });

  app.get("/api/mobile/quotes/:id/pdf", isAuthenticated, async (req: any, res, next) => {
    req.url = `/api/quotes/${req.params.id}/pdf`;
    return (app as any)._router.handle(req, res, next);
  });

  // ============================================================
  // 8. OCR — MOBILE ALIAS FOR CARTE GRISE
  // ============================================================

  app.post("/api/mobile/ocr/carte-grise", isAuthenticated, async (req: any, res, next) => {
    req.url = "/api/ocr/scan-carte-grise";
    return (app as any)._router.handle(req, res, next);
  });

  // ============================================================
  // 9. PUBLIC SERVICES SHORTCUT (reused by booking flow)
  // ============================================================

  app.get("/api/mobile/public/services", async (_req, res) => {
    try {
      const services = await storage.getServices();
      res.json(services);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ============================================================
  // 10. CLIENT QUOTE ACTIONS (accept)
  // ============================================================

  app.post("/api/mobile/quotes/:id/accept", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const quote = await storage.getQuote(req.params.id);
      if (!quote) return res.status(404).json({ message: "Devis introuvable" });
      if (quote.clientId !== userId) {
        return res.status(403).json({ message: "Non autorisé" });
      }
      if (!["pending", "approved"].includes(String(quote.status))) {
        return res.status(409).json({ message: "Ce devis ne peut plus être accepté" });
      }
      const updated = await storage.updateQuote(req.params.id, { status: "accepted" });
      res.json(updated);
    } catch (e: any) {
      console.error("[MobileQuoteAccept] error", e);
      res.status(500).json({ message: e.message });
    }
  });

  // ============================================================
  // 11. ACCOUNT — DELETE (RGPD self-service)
  // ============================================================

  app.delete("/api/mobile/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Non authentifié" });
      await storage.deleteUser(userId);
      res.json({ ok: true });
    } catch (e: any) {
      console.error("[MobileDeleteAccount] error", e);
      res.status(500).json({ message: e.message });
    }
  });

  // ============================================================
  // 12. NOTIFICATION PREFERENCES (SMS / email marketing)
  // ============================================================

  app.get("/api/mobile/profile/preferences", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "Utilisateur introuvable" });
      res.json({
        smsConsent: !!user.smsConsent,
        emailMarketingConsent: !!user.marketingEmailConsent,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/mobile/profile/preferences", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const { smsConsent, emailMarketingConsent } = req.body ?? {};
      const patch: { smsConsent?: boolean; marketingEmailConsent?: boolean } = {};
      if (typeof smsConsent === "boolean") patch.smsConsent = smsConsent;
      if (typeof emailMarketingConsent === "boolean") patch.marketingEmailConsent = emailMarketingConsent;
      const updated = await storage.updateUser(userId, patch);
      res.json({
        smsConsent: !!updated.smsConsent,
        emailMarketingConsent: !!updated.marketingEmailConsent,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  console.log("[MobileV2] Routes additionnelles enregistrées (auth, push, réservations, avis, paiement)");
}
