import express, { type Request, Response, NextFunction } from "express";
import fileUpload from "express-fileupload";
import path from "path";
import fs from "fs";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { initBackupScheduler, updateBackupSchedule } from "./backupScheduler";
import { initDailyReportScheduler } from "./dailyReportScheduler";
import { initNotificationScheduler } from "./notificationScheduler";

const app = express();

app.use("/api/webhooks/stripe", express.raw({ type: "application/json" }));


app.use((req, res, next) => {
  const multerPaths = ['/api/ocr/', '/api/mobile/upload', '/api/mobile/quotes', '/api/mobile/invoices'];
  if (multerPaths.some(p => req.path.startsWith(p))) {
    return next();
  }
  fileUpload({
    limits: { fileSize: 500 * 1024 * 1024 },
    abortOnLimit: true,
    createParentPath: true,
    useTempFiles: true,
    tempFileDir: '/tmp/',
  })(req, res, next);
});

app.use((req, res, next) => {
  if (req.path === "/api/webhooks/stripe") return next();
  express.json({ limit: '15mb' })(req, res, next);
});
app.use(express.urlencoded({ extended: false }));

app.use('/uploads', async (req, res, next) => {
  const localPath = path.join(process.cwd(), 'uploads', req.path);
  if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
    return express.static('./uploads')(req, res, next);
  }

  try {
    const { ObjectStorageService } = await import("./objectStorage");
    const svc = new ObjectStorageService();
    const basename = path.basename(req.path);
    const { data } = await svc.getObject(`/objects/uploads/${basename}`);

    const ext = path.extname(basename).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf',
    };
    res.set({
      'Content-Type': mimeMap[ext] || 'application/octet-stream',
      'Content-Length': data.length.toString(),
      'Cache-Control': 'public, max-age=86400',
    });
    return res.send(data);
  } catch {
    next();
  }
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        if (path.startsWith("/api/auth/user")) {
          logLine += ` [Auth: ${req.isAuthenticated()}, Session: ${req.sessionID}]`;
        }

        if (logLine.length > 120) {
          logLine = logLine.slice(0, 119) + "…";
        }

        log(logLine);
      }
    });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = (err as any).status || (err as any).statusCode || 500;
    const message = (err as any).message || "Internal Server Error";

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
    console.error("[GlobalErrorHandler]", err);
  });

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  
  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    log(`serving on port ${port}`);
    
    initBackupScheduler();
    updateBackupSchedule({
      enabled: false,
      time: '21:00',
      emailEnabled: false,
      emailRecipient: ''
    });
    
    initDailyReportScheduler();
    initNotificationScheduler();

    try {
      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');

      const caCheck = await db.execute(sql.raw("SELECT SUM(CAST(amount AS DECIMAL)) as ca, COUNT(*) as cnt FROM invoices WHERE status = 'paid' AND paid_at IS NOT NULL AND EXTRACT(MONTH FROM paid_at) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM paid_at) = EXTRACT(YEAR FROM CURRENT_DATE)"));
      log(`[DataCheck] CA du mois: ${caCheck.rows[0]?.ca || 0}€ (${caCheck.rows[0]?.cnt} factures payées)`);
    } catch (err: any) {
      console.error('[DataCheck] Erreur:', err.message);
    }

    // Bootstrap: ensure rbelmahi90@gmail.com is root admin
    try {
      const { db: dbBootstrap } = await import('./db');
      const { sql: sqlBootstrap } = await import('drizzle-orm');
      const bcrypt = await import('bcrypt');
      const rootEmail = 'rbelmahi90@gmail.com';
      const rootPassword = 'Admin@2026!';
      const existingRoot = await dbBootstrap.execute(sqlBootstrap.raw(`SELECT id, role FROM users WHERE email = '${rootEmail}' LIMIT 1`));
      if (existingRoot.rows.length > 0) {
        const currentRole = existingRoot.rows[0].role;
        if (currentRole !== 'root') {
          await dbBootstrap.execute(sqlBootstrap.raw(`UPDATE users SET role = 'root' WHERE email = '${rootEmail}'`));
          log(`[Bootstrap] ${rootEmail} promu root (était: ${currentRole})`);
        } else {
          log(`[Bootstrap] ${rootEmail} est déjà root`);
        }
      } else {
        const hashedPassword = await bcrypt.default.hash(rootPassword, 10);
        await dbBootstrap.execute(sqlBootstrap.raw(`INSERT INTO users (id, email, password, role, first_name, last_name) VALUES (gen_random_uuid(), '${rootEmail}', '${hashedPassword}', 'root', 'Riad', 'Belmahi') ON CONFLICT (email) DO UPDATE SET role = 'root'`));
        log(`[Bootstrap] Compte root créé pour ${rootEmail}`);
      }
    } catch (err: any) {
      console.error('[Bootstrap] Erreur:', err.message);
    }
  });
})();
