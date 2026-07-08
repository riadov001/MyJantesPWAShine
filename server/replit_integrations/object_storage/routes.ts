import type { Express } from "express";
import * as path from "path";
import { ObjectStorageService, ObjectNotFoundError } from "../../objectStorage";

export function registerObjectStorageRoutes(app: Express): void {
  app.get("/objects/:objectPath(*)", async (req: any, res) => {
    try {
      const { objectPath } = req.params;
      const fullPath = `/objects/${objectPath}`;

      const svc = new ObjectStorageService();
      const { data } = await svc.getObject(fullPath);

      const ext = path.extname(objectPath).toLowerCase();
      const mimeMap: Record<string, string> = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
        ".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf",
        ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
      };
      const contentType = mimeMap[ext] || "application/octet-stream";

      res.set({
        "Content-Type": contentType,
        "Content-Length": data.length.toString(),
        "Cache-Control": "public, max-age=86400",
      });

      res.send(data);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        if (!res.headersSent) res.status(404).json({ error: "Object not found" });
      } else {
        console.error("[ObjectStorage] Error serving:", error);
        if (!res.headersSent) res.status(500).json({ error: "Error serving file" });
      }
    }
  });
}
