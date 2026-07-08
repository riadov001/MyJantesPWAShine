// Local Authentication with Email/Password + JWT for Mobile
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import type { Express, RequestHandler, Request } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

const SALT_ROUNDS = 10;
const JWT_ACCESS_EXPIRY = "7d";
const JWT_REFRESH_EXPIRY = "30d";

function getJwtSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is required for JWT authentication");
  }
  return secret;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_ACCESS_EXPIRY });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign({ ...payload, type: "refresh" }, getJwtSecret(), { expiresIn: JWT_REFRESH_EXPIRY });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any;
    return { userId: decoded.userId, email: decoded.email, role: decoded.role };
  } catch {
    return null;
  }
}

async function authenticateFromBearer(req: Request): Promise<boolean> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) return false;

  const user = await storage.getUser(payload.userId);
  if (!user) return false;

  (req as any).user = { id: user.id, email: user.email, role: user.role };
  return true;
}

function getDbConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must be set");
  console.log('[Session] Store de sessions sur DATABASE_URL (Replit built-in)');
  return url;
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: getDbConnectionString(),
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: true,
    saveUninitialized: true,
    rolling: true,
    name: "myjantes.sid",
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
      sameSite: "lax",
      path: "/",
    },
  });
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
      },
      async (email, password, done) => {
        try {
          const user = await storage.getUserByEmail(email);
          
          if (!user) {
            return done(null, false, { message: "Email ou mot de passe incorrect" });
          }

          if (!user.password) {
            // Log this for debugging
            console.warn(`[Auth] User ${email} has no password set. Using fallback or requiring reset.`);
            return done(null, false, { message: "Compte non configuré. Veuillez contacter l'administrateur ou réinitialiser votre mot de passe." });
          }

          const isValid = await verifyPassword(password, user.password);
          
          if (!isValid) {
            return done(null, false, { message: "Email ou mot de passe incorrect" });
          }

          return done(null, { id: user.id, email: user.email, role: user.role });
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return done(null, false);
      }
      done(null, { id: user.id, email: user.email, role: user.role });
    } catch (error) {
      done(error);
    }
  });

  // Web session login
  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        console.error("Auth error:", err);
        return res.status(500).json({ message: "Erreur serveur" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Authentification échouée" });
      }
      req.logIn(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Erreur de session" });
        }
        return res.json({ user });
      });
    })(req, res, next);
  });

  // Mobile JWT login - returns tokens instead of setting session cookies
  app.post("/api/mobile/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email et mot de passe requis" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user || !user.password) {
        return res.status(401).json({ message: "Email ou mot de passe incorrect" });
      }

      const isValid = await verifyPassword(password, user.password);
      if (!isValid) {
        return res.status(401).json({ message: "Email ou mot de passe incorrect" });
      }

      const payload: JwtPayload = { userId: user.id, email: user.email, role: user.role };
      const accessToken = signAccessToken(payload);
      const refreshToken = signRefreshToken(payload);

      // Log successful mobile login (without sensitive data)
      console.log(`[Mobile Login] Success for user: ${user.email} (ID: ${user.id})`);

      const { password: _, ...safeUser } = user as any;
      res.json({
        accessToken,
        refreshToken,
        tokenType: "Bearer",
        user: safeUser
      });
    } catch (error) {
      console.error("[Mobile Login] Error:", error);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  // Alias /api/mobile/login to /api/mobile/auth/login for compatibility
  app.post("/api/mobile/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email et mot de passe requis" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user || !user.password) {
        return res.status(401).json({ message: "Email ou mot de passe incorrect" });
      }

      const isValid = await verifyPassword(password, user.password);
      if (!isValid) {
        return res.status(401).json({ message: "Email ou mot de passe incorrect" });
      }

      const payload: JwtPayload = { userId: user.id, email: user.email, role: user.role };
      const accessToken = signAccessToken(payload);
      const refreshToken = signRefreshToken(payload);

      const { password: _, ...safeUser } = user as any;
      res.json({
        accessToken,
        refreshToken,
        tokenType: "Bearer",
        user: safeUser
      });
    } catch (error) {
      console.error("[Mobile Login Alias] Error:", error);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  // Mobile token refresh
  app.post("/api/mobile/refresh-token", async (req, res) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({ message: "Refresh token requis" });
      }

      const decoded = jwt.verify(refreshToken, getJwtSecret()) as any;
      if (!decoded || decoded.type !== "refresh") {
        return res.status(401).json({ message: "Token invalide" });
      }

      const user = await storage.getUser(decoded.userId);
      if (!user) {
        return res.status(401).json({ message: "Utilisateur introuvable" });
      }

      const payload: JwtPayload = { userId: user.id, email: user.email, role: user.role };
      const newAccessToken = signAccessToken(payload);
      const newRefreshToken = signRefreshToken(payload);

      res.json({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          role: user.role,
          profileImageUrl: user.profileImageUrl,
        },
      });
    } catch (error: any) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expiré, veuillez vous reconnecter" });
      }
      res.status(401).json({ message: "Token invalide" });
    }
  });

  // Register route (public)
  app.post("/api/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName, role, companyName, siret, tvaNumber, companyAddress } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email et mot de passe requis" });
      }

      const allowedRoles = ["client", "client_professionnel"];
      const userRole = role && allowedRoles.includes(role) ? role : "client";

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Cet email est déjà utilisé" });
      }

      const hashedPassword = await hashPassword(password);
      
      const userData: any = {
        email,
        password: hashedPassword,
        firstName: firstName || null,
        lastName: lastName || null,
        role: userRole,
      };

      if (userRole === "client_professionnel") {
        userData.companyName = companyName || null;
        userData.siret = siret || null;
        userData.tvaNumber = tvaNumber || null;
        userData.companyAddress = companyAddress || null;
      }
      
      const newUser = await storage.createUser(userData);

      // Also return JWT tokens for mobile registration flow
      const payload: JwtPayload = { userId: newUser.id, email: newUser.email, role: newUser.role };
      const accessToken = signAccessToken(payload);
      const refreshToken = signRefreshToken(payload);

      res.json({
        message: "Compte créé avec succès",
        userId: newUser.id,
        accessToken,
        refreshToken,
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          role: newUser.role,
        },
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Erreur lors de la création du compte" });
    }
  });

  // Logout route (web session)
  app.post("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Erreur lors de la déconnexion" });
      }
      req.session.destroy((err) => {
        if (err) {
          return res.status(500).json({ message: "Erreur de session" });
        }
        res.clearCookie("myjantes.sid");
        res.json({ message: "Déconnexion réussie" });
      });
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  const authenticated = await authenticateFromBearer(req);
  if (authenticated) {
    return next();
  }
  return res.status(401).json({ message: "Non authentifié" });
};

export const isAdmin: RequestHandler = async (req, res, next) => {
  if (!(req.isAuthenticated && req.isAuthenticated())) {
    const authenticated = await authenticateFromBearer(req);
    if (!authenticated) {
      return res.status(401).json({ message: "Non authentifié" });
    }
  }

  const user = req.user as any;
  // Allow root, superadmin, admin, employe roles
  if (!user || (user.role !== "root" && user.role !== "superadmin" && user.role !== "admin" && user.role !== "employe")) {
    return res.status(403).json({ message: "Accès administrateur requis" });
  }

  next();
};

export const isSuperAdmin: RequestHandler = async (req, res, next) => {
  if (!(req.isAuthenticated && req.isAuthenticated())) {
    const authenticated = await authenticateFromBearer(req);
    if (!authenticated) {
      return res.status(401).json({ message: "Non authentifié" });
    }
  }

  const user = req.user as any;
  // Allow root and superadmin roles
  if (!user || (user.role !== "root" && user.role !== "superadmin")) {
    return res.status(403).json({ message: "Accès superadmin requis" });
  }

  next();
};

export const isRoot: RequestHandler = async (req, res, next) => {
  if (!(req.isAuthenticated && req.isAuthenticated())) {
    const authenticated = await authenticateFromBearer(req);
    if (!authenticated) {
      return res.status(401).json({ message: "Non authentifié" });
    }
  }

  const user = req.user as any;
  if (!user || user.role !== "root") {
    return res.status(403).json({ message: "Accès root requis" });
  }

  next();
};
