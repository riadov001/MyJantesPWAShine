import type { Express, Response } from "express";
import { isAuthenticated, isAdmin } from "./localAuth";
import { uploadImage } from "./uploadMiddleware";
import { storage } from "./storage";
import { optimizeImageBuffer } from "./imageOptimizer";
import { insertQuoteSchema } from "@shared/schema";
import { getBaseUrl, buildUrl } from "./urlHelper";


export function registerMobileRoutes(app: Express, uploadToStorage: (fileData: Buffer, fileName: string, folder: string) => Promise<string>) {

  // NOTE: /api/mobile/auth/login, /api/mobile/login, and /api/mobile/refresh-token
  // are registered in localAuth.ts via setupAuth(). They are NOT duplicated here.

  app.get("/api/mobile/auth/me", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Non authentifié" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "Utilisateur introuvable" });
      const { password, ...safeUser } = user as any;
      res.json(safeUser);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== USER PROFILE ==========
  app.get("/api/mobile/profile", isAuthenticated, async (req: any, res: Response) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user) return res.status(404).json({ message: "Utilisateur introuvable" });

      const { password, ...safeUser } = user as any;
      res.json(safeUser);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/mobile/profile", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { firstName, lastName, phone, address, postalCode, city } = req.body;
      const updated = await storage.updateUser(req.user.id, {
        firstName, lastName, phone, address, postalCode, city,
      });
      if (!updated) return res.status(404).json({ message: "Utilisateur introuvable" });
      const { password, ...safeUser } = updated as any;
      res.json(safeUser);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/mobile/profile/avatar", isAuthenticated, uploadImage.single("avatar"), async (req: any, res: Response) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ message: "Aucune image fournie" });

      const optimized = await optimizeImageBuffer(file.buffer, file.mimetype);
      const url = await uploadToStorage(optimized, `avatar_${req.user.id}.jpg`, "avatars");
      await storage.updateUser(req.user.id, { profileImageUrl: url });
      res.json({ success: true, url });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== SERVICES ==========
  app.get("/api/mobile/services", isAuthenticated, async (req: any, res: Response) => {
    try {
      const garageId = req.user?.garageId;
      const servicesList = await storage.getServices(garageId);
      res.json(servicesList);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== QUOTES (Client) ==========
  app.get("/api/mobile/quotes", isAuthenticated, async (req: any, res: Response) => {
    try {
      const user = req.user as any;
      const garageId = user.role === "superadmin" ? undefined : user.garageId;
      const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "20"), 10) || 20, 1), 100);
      const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
      let quotesList;
      if (user.role === "admin" || user.role === "superadmin" || user.role === "employe") {
        quotesList = await storage.getQuotes(undefined, garageId);
      } else {
        quotesList = await storage.getQuotes(user.id);
      }
      const total = quotesList.length;
      const items = quotesList.slice(offset, offset + limit);
      res.json({ items, total, limit, offset, hasMore: offset + items.length < total });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/mobile/quotes/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const quote = await storage.getQuote(req.params.id);
      if (!quote) return res.status(404).json({ message: "Devis non trouvé" });

      const user = req.user as any;
      if ((user.role === "client" || user.role === "client_professionnel") && quote.clientId !== user.id) {
        return res.status(403).json({ message: "Accès refusé" });
      }

      const items = await storage.getQuoteItems(req.params.id);
      const media = await storage.getQuoteMedia(req.params.id);
      const client = await storage.getUser(quote.clientId);
      const service = await storage.getService(quote.serviceId);

      res.json({
        ...quote,
        items,
        media,
        client: client ? { id: client.id, email: client.email, firstName: client.firstName, lastName: client.lastName, phone: client.phone } : null,
        service,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== CREATE QUOTE (Mobile - multipart with photos) ==========
  app.post("/api/mobile/quotes", isAuthenticated, uploadImage.array("images", 10), async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({ message: "Au moins 1 photo est requise" });
      }

      // Use a more robust check for image files
      const imageFiles = files.filter(f => f.mimetype.startsWith("image/") || f.originalname.match(/\.(jpg|jpeg|png|webp|heic)$/i));
      if (imageFiles.length < 1) {
        return res.status(400).json({ message: "Au moins 1 photo est requise (formats supportés: JPG, PNG, WEBP, HEIC)" });
      }

      const { serviceId, paymentMethod, requestDetails, vehicleRegistration, vehicleMake, vehicleModel, vehicleVin, vehicleFuelType, vehicleFiscalPower, vehicleFirstRegDate, vehicleColor } = req.body;

      if (!serviceId) {
        return res.status(400).json({ message: "Le service est requis" });
      }

      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const allQuotes = await storage.getQuotes();
      const count = allQuotes.filter((q: any) => {
        const qDate = new Date(q.createdAt || '');
        return qDate >= startOfMonth;
      }).length + 1;
      const reference = `DEV-${mm}-${String(count).padStart(5, '0')}`;

      let parsedDetails = requestDetails;
      if (typeof requestDetails === "string") {
        try { parsedDetails = JSON.parse(requestDetails); } catch { parsedDetails = { message: requestDetails }; }
      }

      const quoteData: any = {
        serviceId,
        reference,
        clientId: userId,
        garageId: req.user.garageId,
        status: "pending",
        paymentMethod: paymentMethod || "wire_transfer",
        requestDetails: parsedDetails,
      };

      if (vehicleRegistration) quoteData.vehicleRegistration = vehicleRegistration;
      if (vehicleMake) quoteData.vehicleMake = vehicleMake;
      if (vehicleModel) quoteData.vehicleModel = vehicleModel;
      if (vehicleVin) quoteData.vehicleVin = vehicleVin;
      if (vehicleFuelType) quoteData.vehicleFuelType = vehicleFuelType;
      if (vehicleFiscalPower) quoteData.vehicleFiscalPower = vehicleFiscalPower;
      if (vehicleFirstRegDate) quoteData.vehicleFirstRegDate = vehicleFirstRegDate;
      if (vehicleColor) quoteData.vehicleColor = vehicleColor;

      const validatedData = insertQuoteSchema.parse(quoteData);
      const quote = await storage.createQuote(validatedData);

      const mediaResults = [];
      for (const file of files) {
        const optimized = await optimizeImageBuffer(file.buffer, file.mimetype);
        const url = await uploadToStorage(optimized, file.originalname, "quotes");
        const media = await storage.createQuoteMedia({
          quoteId: quote.id,
          fileName: file.originalname,
          filePath: url,
          fileType: file.mimetype.startsWith("image/") ? "image" : "video",
          fileSize: optimized.length,
        });
        mediaResults.push(media);
      }

      res.json({ ...quote, media: mediaResults });
    } catch (error: any) {
      console.error("[MobileCreateQuote] Error:", error);
      res.status(400).json({ message: error.message || "Erreur lors de la création du devis" });
    }
  });

  app.get("/api/mobile/quotes/:id/media", isAuthenticated, async (req: any, res: Response) => {
    try {
      const media = await storage.getQuoteMedia(req.params.id);
      res.json(media);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== INVOICES (Client) ==========
  app.get("/api/mobile/invoices", isAuthenticated, async (req: any, res: Response) => {
    try {
      const user = req.user as any;
      const garageId = user.role === "superadmin" ? undefined : user.garageId;
      const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "20"), 10) || 20, 1), 100);
      const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
      let invoicesList;
      if (user.role === "admin" || user.role === "superadmin" || user.role === "employe") {
        invoicesList = await storage.getInvoices(undefined, garageId);
      } else {
        invoicesList = await storage.getInvoices(user.id);
      }
      const total = invoicesList.length;
      const items = invoicesList.slice(offset, offset + limit);
      res.json({ items, total, limit, offset, hasMore: offset + items.length < total });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/mobile/invoices/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) return res.status(404).json({ message: "Facture non trouvée" });

      const user = req.user as any;
      if ((user.role === "client" || user.role === "client_professionnel") && invoice.clientId !== user.id) {
        return res.status(403).json({ message: "Accès refusé" });
      }

      const items = await storage.getInvoiceItems(req.params.id);
      const media = await storage.getInvoiceMedia(req.params.id);
      const client = await storage.getUser(invoice.clientId);

      res.json({
        ...invoice,
        items,
        media,
        client: client ? { id: client.id, email: client.email, firstName: client.firstName, lastName: client.lastName, phone: client.phone } : null,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/mobile/invoices/:id/media", isAuthenticated, async (req: any, res: Response) => {
    try {
      const media = await storage.getInvoiceMedia(req.params.id);
      res.json(media);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== RESERVATIONS ==========
  app.get("/api/mobile/reservations", isAuthenticated, async (req: any, res: Response) => {
    try {
      const user = req.user as any;
      const garageId = user.role === "superadmin" ? undefined : user.garageId;
      let reservationsList;
      if (user.role === "admin" || user.role === "superadmin" || user.role === "employe") {
        reservationsList = await storage.getReservations(undefined, garageId);
      } else {
        reservationsList = await storage.getReservations(user.id);
      }
      res.json(reservationsList);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/mobile/reservations/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const reservation = await storage.getReservation(req.params.id);
      if (!reservation) return res.status(404).json({ message: "Réservation non trouvée" });

      const user = req.user as any;
      if ((user.role === "client" || user.role === "client_professionnel") && reservation.clientId !== user.id) {
        return res.status(403).json({ message: "Accès refusé" });
      }

      const client = await storage.getUser(reservation.clientId);
      const service = await storage.getService(reservation.serviceId);

      res.json({
        ...reservation,
        client: client ? { id: client.id, email: client.email, firstName: client.firstName, lastName: client.lastName, phone: client.phone } : null,
        service,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== NOTIFICATIONS ==========
  app.get("/api/mobile/notifications", isAuthenticated, async (req: any, res: Response) => {
    try {
      const notifs = await storage.getNotifications(req.user.id);
      res.json(notifs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/mobile/notifications/unread-count", isAuthenticated, async (req: any, res: Response) => {
    try {
      const notifs = await storage.getNotifications(req.user.id);
      const unread = notifs.filter((n: any) => !n.isRead).length;
      res.json({ count: unread });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/mobile/notifications/:id/read", isAuthenticated, async (req: any, res: Response) => {
    try {
      const notif = await storage.getNotification(req.params.id);
      if (!notif) return res.status(404).json({ message: "Notification introuvable" });
      if (notif.userId !== req.user.id) {
        return res.status(403).json({ message: "Non autorisé" });
      }
      await storage.markNotificationAsRead(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/mobile/notifications/mark-all-read", isAuthenticated, async (req: any, res: Response) => {
    try {
      await storage.markAllNotificationsRead(req.user.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== ADMIN: CLIENTS ==========
  app.get("/api/mobile/admin/clients", isAuthenticated, isAdmin, async (req: any, res: Response) => {
    try {
      const garageId = req.user?.role === "superadmin" ? undefined : req.user?.garageId;
      const clients = garageId ? await storage.getUsersByGarage(garageId) : await storage.getUsers();
      const safeClients = clients.map((u: any) => {
        const { password, ...safe } = u;
        return safe;
      });
      res.json(safeClients);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/mobile/admin/clients/:id", isAuthenticated, isAdmin, async (req: any, res: Response) => {
    try {
      const client = await storage.getUser(req.params.id);
      if (!client) return res.status(404).json({ message: "Client introuvable" });
      const { password, ...safe } = client as any;
      res.json(safe);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== ADMIN: QUOTES MANAGEMENT ==========
  app.patch("/api/mobile/admin/quotes/:id/status", isAuthenticated, isAdmin, async (req: any, res: Response) => {
    try {
      const { status } = req.body;
      const updated = await storage.updateQuote(req.params.id, { status });
      if (!updated) return res.status(404).json({ message: "Devis non trouvé" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== ADMIN: INVOICES MANAGEMENT ==========
  app.patch("/api/mobile/admin/invoices/:id/status", isAuthenticated, isAdmin, async (req: any, res: Response) => {
    try {
      const { status } = req.body;
      const updated = await storage.updateInvoice(req.params.id, { status });
      if (!updated) return res.status(404).json({ message: "Facture non trouvée" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== ADMIN: RESERVATIONS MANAGEMENT ==========
  app.patch("/api/mobile/admin/reservations/:id/status", isAuthenticated, isAdmin, async (req: any, res: Response) => {
    try {
      const { status } = req.body;
      const updated = await storage.updateReservation(req.params.id, { status });
      if (!updated) return res.status(404).json({ message: "Réservation non trouvée" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== ADMIN: ANALYTICS ==========
  app.get("/api/mobile/admin/dashboard", isAuthenticated, isAdmin, async (req: any, res: Response) => {
    try {
      const garageId = req.user?.role === "superadmin" ? undefined : req.user?.garageId;
      
      const [quotes, invoices, reservations, users] = await Promise.all([
        storage.getQuotes(undefined, garageId),
        storage.getInvoices(undefined, garageId),
        storage.getReservations(undefined, garageId),
        garageId ? storage.getUsersByGarage(garageId) : storage.getUsers(),
      ]);

      const pendingQuotes = quotes.filter((q: any) => q.status === "pending").length;
      const pendingInvoices = invoices.filter((i: any) => i.status === "pending").length;
      const todayReservations = reservations.filter((r: any) => {
        const d = new Date(r.scheduledDate);
        const now = new Date();
        return d.toDateString() === now.toDateString();
      }).length;

      const totalRevenue = invoices
        .filter((i: any) => i.status === "paid")
        .reduce((sum: number, i: any) => sum + parseFloat(i.amount || "0"), 0);

      const paidAmount = totalRevenue;
      const pendingAmount = invoices
        .filter((i: any) => i.status === "pending" || i.status === "overdue")
        .reduce((sum: number, i: any) => sum + parseFloat(i.amount || "0"), 0);
      
      const forecastAmount = quotes
        .filter((q: any) => q.status === "pending" || q.status === "approved")
        .reduce((sum: number, q: any) => sum + parseFloat(q.quoteAmount || "0"), 0);

      res.json({
        totalClients: users.filter((u: any) => u.role === "client" || u.role === "client_professionnel").length,
        totalQuotes: quotes.length,
        totalInvoices: invoices.length,
        totalReservations: reservations.length,
        pendingQuotes,
        pendingInvoices,
        todayReservations,
        totalRevenue: totalRevenue.toFixed(2),
        paidAmount: paidAmount.toFixed(2),
        pendingAmount: pendingAmount.toFixed(2),
        forecastAmount: forecastAmount.toFixed(2),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== WHEEL SIMULATOR ==========
  app.get("/api/mobile/wheel-simulator/config", isAuthenticated, async (req: any, res: Response) => {
    try {
      const garageId = req.user?.garageId;
      if (!garageId) return res.status(400).json({ message: "Garage non spécifié" });
      const garage = await storage.getGarage(garageId);
      if (!garage) return res.status(404).json({ message: "Garage introuvable" });
      res.json(garage.simulatorSettings || {});
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/mobile/wheel-simulator/analyze", isAuthenticated, uploadImage.single("image"), async (req: any, res: Response) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ message: "Aucune image fournie" });
      
      const { analyzeWheelImage } = await import("./aiAssistant");
      const base64 = file.buffer.toString("base64");
      const text = await analyzeWheelImage(base64, file.mimetype, "Analyse cette jante et propose des options de personnalisation.");
      res.json({ analysis: text });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== AR WHEEL DETECTION ==========
  app.post("/api/mobile/ar/detect-wheels", isAuthenticated, uploadImage.single("image"), async (req: any, res: Response) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ message: "Aucune image fournie" });

      const base64 = file.buffer.toString("base64");
      const mimeType = file.mimetype || "image/jpeg";

      const GEMINI_BASE_URL = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || "http://localhost:1106/modelfarm/gemini";
      const GEMINI_API_KEY = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "dummy-key";

      const prompt = `Analyse cette photo de voiture et identifie les positions des roues/jantes visibles.
Pour chaque roue visible, retourne ses coordonnées normalisées (entre 0 et 1) par rapport à l'image:
- x: position horizontale du centre de la roue (0 = gauche, 1 = droite)
- y: position verticale du centre de la roue (0 = haut, 1 = bas)
- radius: rayon approximatif de la roue en proportion de la largeur de l'image

Réponds UNIQUEMENT en JSON valide avec ce format exact:
{"positions": [{"x": 0.25, "y": 0.7, "radius": 0.08}, {"x": 0.75, "y": 0.7, "radius": 0.08}]}

Si ce n'est pas une photo de voiture ou si aucune roue n'est visible, réponds: {"positions": []}`;

      const response = await fetch(`${GEMINI_BASE_URL}/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { inlineData: { mimeType, data: base64 } },
              { text: prompt },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
        }),
      });

      if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
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
      console.error("[Mobile AR] Wheel detection error:", error.message);
      res.json({ positions: [] });
    }
  });

  // ========== UPLOAD ==========
  app.post("/api/mobile/upload", isAuthenticated, uploadImage.single("image"), async (req: any, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, message: "Aucune image fournie" });
      }

      const folder = req.body.folder || "uploads";
      const optimizedBuffer = await optimizeImageBuffer(file.buffer, file.mimetype);
      const url = await uploadToStorage(optimizedBuffer, file.originalname, folder);

      res.json({
        success: true,
        url,
        objectPath: url,
        fileName: file.originalname,
        size: optimizedBuffer.length,
        contentType: file.mimetype,
      });
    } catch (error: any) {
      console.error("[MobileUpload] Error:", error);
      res.status(500).json({ success: false, message: "Erreur lors de l'upload", error: error.message });
    }
  });

  app.post("/api/mobile/upload/multiple", isAuthenticated, uploadImage.array("images", 10), async (req: any, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ success: false, message: "Aucune image fournie" });
      }

      const folder = req.body.folder || "uploads";
      const results = [];

      for (const file of files) {
        const optimized = await optimizeImageBuffer(file.buffer, file.mimetype);
        const url = await uploadToStorage(optimized, file.originalname, folder);
        results.push({
          url,
          fileName: file.originalname,
          size: optimized.length,
          contentType: file.mimetype,
        });
      }

      res.json({ success: true, files: results });
    } catch (error: any) {
      console.error("[MobileUpload] Error:", error);
      res.status(500).json({ success: false, message: "Erreur lors de l'upload", error: error.message });
    }
  });

  app.post("/api/mobile/quotes/:id/media", isAuthenticated, uploadImage.array("images", 10), async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const quote = await storage.getQuote(id);
      if (!quote) return res.status(404).json({ message: "Devis non trouvé" });

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "Aucune image fournie" });
      }

      const results = [];

      for (const file of files) {
        const optimized = await optimizeImageBuffer(file.buffer, file.mimetype);
        const url = await uploadToStorage(optimized, file.originalname, "quotes");
        const media = await storage.createQuoteMedia({
          quoteId: id,
          fileName: file.originalname,
          filePath: url,
          fileType: file.mimetype.startsWith("image/") ? "image" : "document",
          fileSize: optimized.length,
        });
        results.push(media);
      }

      res.json({ success: true, media: results });
    } catch (error: any) {
      console.error("[MobileQuoteMedia] Error:", error);
      res.status(500).json({ message: "Erreur lors de l'upload", error: error.message });
    }
  });

  app.post("/api/mobile/invoices/:id/media", isAuthenticated, uploadImage.array("images", 10), async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const invoice = await storage.getInvoice(id);
      if (!invoice) return res.status(404).json({ message: "Facture non trouvée" });

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "Aucune image fournie" });
      }

      const results = [];

      for (const file of files) {
        const optimized = await optimizeImageBuffer(file.buffer, file.mimetype);
        const url = await uploadToStorage(optimized, file.originalname, "invoices");
        const media = await storage.createInvoiceMedia({
          invoiceId: id,
          fileName: file.originalname,
          filePath: url,
          fileType: file.mimetype.startsWith("image/") ? "image" : "document",
          fileSize: optimized.length,
        });
        results.push(media);
      }

      res.json({ success: true, media: results });
    } catch (error: any) {
      console.error("[MobileInvoiceMedia] Error:", error);
      res.status(500).json({ message: "Erreur lors de l'upload", error: error.message });
    }
  });

  app.post("/api/mobile/upload/presigned", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { fileName, contentType, folder } = req.body;
      if (!fileName) {
        return res.status(400).json({ message: "fileName requis" });
      }

      const { isCloudflareR2Configured, getPresignedUploadUrl } = await import("./cloudflareR2Service");
      if (!isCloudflareR2Configured()) {
        return res.status(503).json({ message: "Cloudflare R2 non configuré" });
      }

      const key = `${folder || "uploads"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}_${fileName}`;
      const uploadUrl = await getPresignedUploadUrl(key, contentType || "image/jpeg", 3600);

      const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL;
      const fileUrl = publicUrl ? `${publicUrl.replace(/\/$/, "")}/${key}` : `/r2/${key}`;

      res.json({
        success: true,
        uploadUrl,
        key,
        fileUrl,
      });
    } catch (error: any) {
      console.error("[PresignedUpload] Error:", error);
      res.status(500).json({ message: "Erreur lors de la génération de l'URL", error: error.message });
    }
  });

  app.get("/api/mobile/storage/status", isAuthenticated, async (_req: any, res: Response) => {
    try {
      const { isCloudflareR2Configured } = await import("./cloudflareR2Service");
      const { isGoogleDriveConfigured } = await import("./googleDriveStorage");

      res.json({
        cloudflareR2: isCloudflareR2Configured(),
        googleDrive: isGoogleDriveConfigured(),
        localStorage: true,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== SETTINGS ==========
  app.get("/api/mobile/settings", isAuthenticated, async (_req: any, res: Response) => {
    try {
      const settings = await storage.getApplicationSettings();
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== CHAT ==========
  app.post("/api/mobile/chat/conversations", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { title, participantIds, type } = req.body;
      if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
        return res.status(400).json({ message: "Participants requis" });
      }
      
      const conversationType = type || "client_admin";
      const allParticipantIds = [...new Set([req.user.id, ...participantIds])];
      
      const conversation = await storage.createChatConversation({
        title: title || "Conversation",
        type: conversationType,
        createdById: req.user.id,
      });
      
      for (const pid of allParticipantIds) {
        await storage.addChatParticipant({ conversationId: conversation.id, userId: pid });
      }
      
      res.json(conversation);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/mobile/chat/conversations", isAuthenticated, async (req: any, res: Response) => {
    try {
      const conversations = await storage.getChatConversations(req.user.id);
      res.json(conversations);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/mobile/chat/conversations/:id/messages", isAuthenticated, async (req: any, res: Response) => {
    try {
      const participants = await storage.getChatParticipants(req.params.id);
      if (!participants.some(p => p.userId === req.user.id)) {
        return res.status(403).json({ message: "Non autorisé" });
      }
      const messages = await storage.getChatMessages(req.params.id, 50, 0);
      await storage.updateLastRead(req.params.id, req.user.id);
      res.json(messages);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/mobile/chat/conversations/:id/messages", isAuthenticated, async (req: any, res: Response) => {
    try {
      const conversationId = req.params.id;
      const participants = await storage.getChatParticipants(conversationId);
      if (!participants.some(p => p.userId === req.user.id)) {
        return res.status(403).json({ message: "Non autorisé" });
      }
      const { content, attachments } = req.body as {
        content?: string;
        attachments?: Array<{ url: string; fileName?: string; fileType?: "image" | "video" | "document"; fileSize?: number; mimeType?: string }>;
      };
      const trimmed = (content ?? "").trim();
      const atts = Array.isArray(attachments) ? attachments : [];
      if (!trimmed && atts.length === 0) {
        return res.status(400).json({ message: "Message ou pièce jointe requis" });
      }

      const message = await storage.createChatMessage({
        conversationId,
        senderId: req.user.id,
        content: trimmed || (atts.length > 0 ? "[Pièce jointe]" : ""),
      });

      const savedAttachments = [];
      for (const a of atts) {
        if (!a?.url) continue;
        const fileType: "image" | "video" | "document" =
          a.fileType === "video" || a.fileType === "document" ? a.fileType : "image";
        const saved = await storage.createChatAttachment({
          messageId: message.id,
          fileType,
          filePath: a.url,
          fileName: a.fileName || "image.jpg",
          fileSize: typeof a.fileSize === "number" ? a.fileSize : null,
          mimeType: a.mimeType || "image/jpeg",
        });
        savedAttachments.push(saved);
      }

      const sender = await storage.getUser(req.user.id);
      const senderName = `${sender?.firstName || ''} ${sender?.lastName || ''}`.trim() || sender?.email || 'Quelqu’un';

      // Broadcast realtime chat payload + persist notification (which fans out push centrally).
      const { sendWsNotification } = await import("./wsClients");
      const preview = trimmed
        ? (trimmed.length > 60 ? trimmed.slice(0, 60) + "…" : trimmed)
        : "Pièce jointe";

      for (const p of participants) {
        if (p.userId === req.user.id) continue;

        // WS push of the actual chat message payload (not a generic notification).
        sendWsNotification(p.userId, {
          type: "chat_message",
          conversationId,
          message: { ...message, sender, attachments: savedAttachments },
        });

        // Persistent notification — storage.createNotification handles WS notif + push fan-out.
        try {
          await storage.createNotification({
            userId: p.userId,
            type: "chat",
            title: `Nouveau message de ${senderName}`,
            message: preview,
            relatedId: conversationId,
          });
        } catch (e) {
          console.error("[Mobile chat send] notification error:", e);
        }
      }

      res.json({ ...message, sender, attachments: savedAttachments });
    } catch (error: any) {
      console.error("[Mobile chat send] error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Mark conversation as read
  app.post("/api/mobile/chat/conversations/:id/read", isAuthenticated, async (req: any, res: Response) => {
    try {
      const participants = await storage.getChatParticipants(req.params.id);
      if (!participants.some(p => p.userId === req.user.id)) {
        return res.status(403).json({ message: "Non autorisé" });
      }
      await storage.updateLastRead(req.params.id, req.user.id);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== AI ASSISTANT ==========
  app.post("/api/mobile/ai/assistant", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { messages } = req.body;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ message: "Messages requis" });
      }
      const { generateAssistantResponse } = await import("./aiAssistant");
      const response = await generateAssistantResponse(messages, req.user.role);
      res.json({ response });
    } catch (error: any) {
      res.status(500).json({ message: "Assistant indisponible" });
    }
  });

  // ========== VIEW LINKS ==========
  app.post("/api/mobile/quotes/:id/view-link", isAuthenticated, async (req: any, res: Response) => {
    try {
      const quote = await storage.getQuote(req.params.id);
      if (!quote) return res.status(404).json({ message: "Devis non trouvé" });
      
      const user = req.user as any;
      if (user.role !== "admin" && user.role !== "superadmin" && quote.clientId !== user.id) {
        return res.status(403).json({ message: "Non autorisé" });
      }
      
      let viewToken = quote.viewToken;
      if (!viewToken) {
        const crypto = await import("crypto");
        viewToken = crypto.randomBytes(32).toString("hex");
        await storage.updateQuote(quote.id, { viewToken });
      }
      
      res.json({ viewUrl: `${getBaseUrl(req)}/devis/${viewToken}` });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/mobile/invoices/:id/view-link", isAuthenticated, async (req: any, res: Response) => {
    try {
      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) return res.status(404).json({ message: "Facture non trouvée" });
      
      const user = req.user as any;
      if (user.role !== "admin" && user.role !== "superadmin" && invoice.clientId !== user.id) {
        return res.status(403).json({ message: "Non autorisé" });
      }
      
      let viewToken = invoice.viewToken;
      if (!viewToken) {
        const crypto = await import("crypto");
        viewToken = crypto.randomBytes(32).toString("hex");
        await storage.updateInvoice(invoice.id, { viewToken });
      }
      
      res.json({ viewUrl: `${getBaseUrl(req)}/facture/${viewToken}` });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  console.log("[Mobile] Routes mobiles enregistrées (auth JWT + session)");
}
