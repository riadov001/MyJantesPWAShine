import type { Request } from "express";

export function getBaseUrl(req?: Request): string {
  if (req) {
    const host = req.headers["x-forwarded-host"] || req.get("host");
    if (host) {
      const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
      return `${proto}://${host}`;
    }
  }

  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  }

  if (process.env.REPLIT_DOMAINS) {
    const domain = process.env.REPLIT_DOMAINS.split(",")[0].trim();
    if (domain) return `https://${domain}`;
  }

  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }

  return "https://localhost:5000";
}

/**
 * Returns the canonical external URL to use in emails and public links.
 * Always prioritises PUBLIC_BASE_URL so that emails sent from the dev
 * environment still contain links that work in production.
 */
export function getExternalBaseUrl(req?: Request): string {
  // Toujours utiliser le domaine production pour les emails et liens publics
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  }
  return "https://apps.myjantes.fr";
}

export function buildUrl(req: Request, path: string): string {
  const base = getBaseUrl(req);
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

export function buildExternalUrl(path: string, req?: Request): string {
  const base = getExternalBaseUrl(req);
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}
