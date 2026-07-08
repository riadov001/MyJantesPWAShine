// Uses @google-cloud/storage with Replit sidecar credentials.
// Works in both development and production deployments.
import { Storage } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  ObjectAclPolicy,
  ObjectPermission,
} from "./objectAcl";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const FALLBACK_BUCKET_ID = "replit-objstore-5018ac01-ad08-4800-801a-a825489cd5c9";

function getBucketId(): string {
  return (
    process.env.APP_STORAGE_ID ||
    process.env.DEFAULT_OBJECT_STORAGE_ID ||
    process.env.OBJECT_STORAGE_BUCKET_ID ||
    process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ||
    process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID ||
    process.env.FALLBACK_OBJECT_STORAGE_ID ||
    FALLBACK_BUCKET_ID
  );
}

function createGCSClient(): Storage {
  return new Storage({
    apiEndpoint: "https://storage.googleapis.com",
    credentials: {
      audience: "replit",
      subject_token_type: "access_token",
      token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
      type: "external_account",
      credential_source: {
        url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
        format: {
          type: "json",
          subject_token_field_name: "access_token",
        },
      },
      universe_domain: "googleapis.com",
    } as any,
    projectId: "",
  });
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  private gcs: Storage;
  private bucketId: string;

  constructor(bucketId?: string) {
    this.bucketId = bucketId || getBucketId();
    this.gcs = createGCSClient();
  }

  private bucket() {
    return this.gcs.bucket(this.bucketId);
  }

  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
      ".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf",
      ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
      ".doc": "application/msword",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".zip": "application/zip",
    };
    return mimeTypes[ext.toLowerCase()] || "application/octet-stream";
  }

  async uploadFileBuffer(
    buffer: Buffer,
    fileName: string,
    folder: string = "uploads"
  ): Promise<string> {
    const objectId = randomUUID();
    const ext = path.extname(fileName);
    const storageName = `${objectId}${ext}`;
    const objectName = `.private/${folder}/${storageName}`;

    console.log(`[ObjectStorage] Uploading: ${objectName}, size: ${buffer.length} bytes`);

    try {
      const { Client } = await import("@replit/object-storage");
      const client = new Client();
      await client.uploadFromBytes(objectName, buffer);
    } catch (sdkErr: any) {
      console.warn(`[ObjectStorage] SDK upload failed, falling back to GCS: ${sdkErr.message}`);
      const file = this.bucket().file(objectName);
      await file.save(buffer, {
        metadata: { contentType: this.getMimeType(ext) },
      });
    }

    const objectPath = `/objects/${folder}/${storageName}`;
    console.log(`[ObjectStorage] Upload OK: ${objectPath}`);
    return objectPath;
  }

  private toBuffer(value: unknown): Buffer {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (Array.isArray(value) && value.length > 0) {
      return Buffer.isBuffer(value[0]) ? value[0] : Buffer.from(value[0] as Uint8Array);
    }
    return Buffer.from(value as ArrayBuffer);
  }

  private resolveStoragePaths(objectPath: string): string[] {
    const paths: string[] = [];

    if (objectPath.startsWith("/objects/")) {
      const entityId = objectPath.slice("/objects/".length);
      paths.push(`.private/${entityId}`);
    }

    paths.push(objectPath.startsWith("/") ? objectPath.slice(1) : objectPath);

    if (!objectPath.startsWith(".private/") && !objectPath.startsWith("/")) {
      paths.push(`.private/${objectPath}`);
    }

    return Array.from(new Set(paths));
  }

  async getObject(objectPath: string): Promise<{ data: Buffer; exists: boolean }> {
    // Try @replit/object-storage SDK first (same as upload path)
    const sdkPaths = this.resolveStoragePaths(objectPath);
    for (const storagePath of sdkPaths) {
      try {
        const { Client } = await import("@replit/object-storage");
        const client = new Client();
        const result = await client.downloadAsBytes(storagePath);
        if (result && result.ok && result.value) {
          return { data: this.toBuffer(result.value), exists: true };
        }
      } catch {
        // try next
      }
    }

    // Fallback: GCS client
    for (const storagePath of sdkPaths) {
      try {
        const file = this.bucket().file(storagePath);
        const [exists] = await file.exists();
        if (!exists) continue;
        const [contents] = await file.download();
        return { data: Buffer.from(contents), exists: true };
      } catch {
        // try next path
      }
    }
    throw new ObjectNotFoundError();
  }

  async deleteObject(storagePath: string): Promise<void> {
    try {
      const clean = storagePath.startsWith("/")
        ? storagePath.slice(1)
        : storagePath;
      await this.bucket().file(clean).delete();
    } catch (err: any) {
      console.warn(`[ObjectStorage] Delete failed for ${storagePath}:`, err.message);
    }
  }

  async objectExists(objectPath: string): Promise<boolean> {
    // Try SDK first (same bucket as upload)
    for (const storagePath of this.resolveStoragePaths(objectPath)) {
      try {
        const { Client } = await import("@replit/object-storage");
        const client = new Client();
        const result = await client.exists(storagePath);
        if (result && result.ok && result.value) return true;
      } catch {
        // continue
      }
    }
    // Fallback: GCS
    for (const storagePath of this.resolveStoragePaths(objectPath)) {
      try {
        const [exists] = await this.bucket().file(storagePath).exists();
        if (exists) return true;
      } catch {
        // continue
      }
    }
    return false;
  }

  async listFiles(prefix?: string, limit = 1000): Promise<string[]> {
    try {
      const opts: any = { maxResults: limit };
      if (prefix) opts.prefix = prefix;
      const [files] = await this.bucket().getFiles(opts);
      return files.map((f) => f.name.replace(/^\.private\//, ""));
    } catch {
      return [];
    }
  }

  async downloadObject(objectPath: string, res: Response) {
    try {
      const { data } = await this.getObject(objectPath);
      const ext = path.extname(objectPath).toLowerCase();
      res.set({
        "Content-Type": this.getMimeType(ext),
        "Content-Length": data.length.toString(),
        "Cache-Control": "private, max-age=3600",
      });
      res.send(data);
    } catch (error) {
      if (!res.headersSent) {
        if (error instanceof ObjectNotFoundError) {
          res.status(404).json({ error: "Object not found" });
        } else {
          console.error("Error downloading file:", error);
          res.status(500).json({ error: "Error downloading file" });
        }
      }
    }
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (rawPath.startsWith("/objects/")) return rawPath;
    return rawPath;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/objects/")) return normalizedPath;

    const entityId = normalizedPath.slice("/objects/".length);
    const aclStoragePath = `.private/${entityId}.acl`;
    const file = this.bucket().file(aclStoragePath);
    await file.save(JSON.stringify(aclPolicy), {
      metadata: { contentType: "application/json" },
    });
    return normalizedPath;
  }

  async getObjectAclPolicy(objectPath: string): Promise<ObjectAclPolicy | null> {
    if (!objectPath.startsWith("/objects/")) return null;
    const entityId = objectPath.slice("/objects/".length);
    const aclStoragePath = `.private/${entityId}.acl`;
    try {
      const file = this.bucket().file(aclStoragePath);
      const [exists] = await file.exists();
      if (!exists) return null;
      const [contents] = await file.download();
      return JSON.parse(contents.toString()) as ObjectAclPolicy;
    } catch {
      return null;
    }
  }

  async canAccessObjectEntity({
    userId,
    objectPath,
    requestedPermission,
  }: {
    userId?: string;
    objectPath: string;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    const aclPolicy = await this.getObjectAclPolicy(objectPath);
    if (!aclPolicy) return false;
    if (aclPolicy.owner === userId) return true;
    if (
      aclPolicy.visibility === "public" &&
      requestedPermission === ObjectPermission.READ
    ) {
      return true;
    }
    return false;
  }

  async uploadFromLocalDir(
    localDir: string,
    storagePrefix: string = ".private/uploads",
    options?: { skipExisting?: boolean; fileFilter?: (name: string) => boolean }
  ): Promise<{ uploaded: number; skipped: number; errors: string[] }> {
    const skipExisting = options?.skipExisting ?? true;
    const fileFilter =
      options?.fileFilter ??
      ((name: string) =>
        /\.(jpg|jpeg|png|gif|webp|pdf|mp4|webm|mov)$/i.test(name));

    if (!fs.existsSync(localDir)) {
      throw new Error(`Directory not found: ${localDir}`);
    }

    const files = fs
      .readdirSync(localDir)
      .filter((f) => {
        const full = path.join(localDir, f);
        return fs.statSync(full).isFile() && fileFilter(f);
      });

    let uploaded = 0, skipped = 0;
    const errors: string[] = [];

    for (const fileName of files) {
      const storagePath = `${storagePrefix}/${fileName}`;
      try {
        if (skipExisting) {
          const [exists] = await this.bucket().file(storagePath).exists();
          if (exists) { skipped++; continue; }
        }
        const buffer = fs.readFileSync(path.join(localDir, fileName));
        const file = this.bucket().file(storagePath);
        await file.save(buffer);
        uploaded++;
      } catch (err: any) {
        errors.push(`${fileName}: ${err.message}`);
      }
    }

    return { uploaded, skipped, errors };
  }

  async copyBetweenBuckets(
    sourceBucketId: string,
    sourcePrefix: string,
    destPrefix: string,
    options?: { skipExisting?: boolean }
  ): Promise<{ copied: number; skipped: number; missing: number; errors: string[] }> {
    const sourceGcs = createGCSClient();
    const sourceBucket = sourceGcs.bucket(sourceBucketId);
    const skipExisting = options?.skipExisting ?? true;

    let copied = 0, skipped = 0, missing = 0;
    const errors: string[] = [];

    const [files] = await sourceBucket.getFiles({ prefix: sourcePrefix });

    for (const srcFile of files) {
      const destPath = srcFile.name.replace(sourcePrefix, destPrefix);
      try {
        if (skipExisting) {
          const [exists] = await this.bucket().file(destPath).exists();
          if (exists) { skipped++; continue; }
        }
        const [buffer] = await srcFile.download();
        const destFile = this.bucket().file(destPath);
        await destFile.save(buffer);
        copied++;
      } catch (err: any) {
        if (err.code === 404) { missing++; } else { errors.push(`${srcFile.name}: ${err.message}`); }
      }
    }

    return { copied, skipped, missing, errors };
  }
}

export { ObjectPermission } from "./objectAcl";
