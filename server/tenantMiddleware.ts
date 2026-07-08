import { Request, Response, NextFunction } from "express";
import { pool } from "./db";
import { getSchemaName } from "./tenantContext";

declare global {
  namespace Express {
    interface Request {
      tenantSchema?: string;
      tenantGarageId?: string;
      tenantGarageSlug?: string;
    }
  }
}

export function tenantMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      if (!user) {
        return next();
      }

      let garageSlug: string | null = null;
      let garageId: string | null = null;

      if (user.role === "superadmin") {
        const selectedGarageId = req.headers["x-garage-id"] as string
          || req.query.garageId as string
          || (req as any).session?.selectedGarageId;

        if (selectedGarageId) {
          const result = await pool.query(
            `SELECT id, slug FROM garages WHERE id = $1`,
            [selectedGarageId]
          );
          if (result.rows.length > 0) {
            garageId = result.rows[0].id;
            garageSlug = result.rows[0].slug;
          }
        }
      } else if (user.garageId) {
        const result = await pool.query(
          `SELECT id, slug FROM garages WHERE id = $1`,
          [user.garageId]
        );
        if (result.rows.length > 0) {
          garageId = result.rows[0].id;
          garageSlug = result.rows[0].slug;
        }
      }

      if (garageSlug) {
        req.tenantSchema = getSchemaName(garageSlug);
        req.tenantGarageId = garageId!;
        req.tenantGarageSlug = garageSlug;
      }

      next();
    } catch (error) {
      console.error("[TenantMiddleware] Error resolving tenant:", error);
      next();
    }
  };
}

export function requireTenant() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.tenantSchema) {
      return res.status(400).json({ message: "Aucun garage sélectionné. Veuillez sélectionner un garage." });
    }
    next();
  };
}
