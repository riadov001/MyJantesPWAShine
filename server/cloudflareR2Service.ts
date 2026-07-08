function getAccountId(): string {
  const realId = process.env.CLOUDFLARE_R2_REAL_ACCOUNT_ID;
  if (realId) return realId;
  const id = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  if (!id) throw new Error("Cloudflare R2 account ID not configured");
  return id;
}

function getBucketName(): string {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_OVERRIDE || process.env.CLOUDFLARE_R2_BUCKET_NAME;
  if (!bucket) throw new Error("CLOUDFLARE_R2_BUCKET_NAME not configured");
  return bucket;
}

function getApiToken(): string {
  const token = process.env.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("Cloudflare API token not configured (CF_API_TOKEN or CLOUDFLARE_API_TOKEN)");
  return token;
}

function getPublicUrl(key: string): string {
  const customDomain = process.env.CLOUDFLARE_R2_PUBLIC_URL;
  if (customDomain) {
    return `${customDomain.replace(/\/$/, "")}/${key}`;
  }
  return `/r2/${key}`;
}

function getMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    pdf: "application/pdf",
    json: "application/json",
    zip: "application/zip",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

function r2ApiUrl(key?: string): string {
  const accountId = getAccountId();
  const bucket = getBucketName();
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects`;
  if (key) return `${base}/${encodeURIComponent(key)}`;
  return base;
}

export function isCloudflareR2Configured(): boolean {
  const hasToken = !!(process.env.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN);
  const hasAccount = !!(process.env.CLOUDFLARE_R2_REAL_ACCOUNT_ID || process.env.CLOUDFLARE_R2_ACCOUNT_ID);
  const hasBucket = !!(process.env.CLOUDFLARE_R2_BUCKET_OVERRIDE || process.env.CLOUDFLARE_R2_BUCKET_NAME);
  return hasToken && hasAccount && hasBucket;
}

export async function uploadToR2(
  fileBuffer: Buffer,
  fileName: string,
  folder: string = "uploads",
  contentType?: string
): Promise<{ key: string; url: string }> {
  const token = getApiToken();
  const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}_${fileName}`;
  const key = `${folder}/${uniqueName}`;
  const mime = contentType || getMimeType(fileName);

  const response = await fetch(r2ApiUrl(key), {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": mime,
    },
    body: fileBuffer,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`R2 upload failed (${response.status}): ${errText}`);
  }

  const url = getPublicUrl(key);
  console.log(`[CloudflareR2] Uploaded: ${key} (${fileBuffer.length} bytes, ${mime})`);
  return { key, url };
}

export async function downloadFromR2(key: string): Promise<{ data: Buffer; contentType: string }> {
  const token = getApiToken();

  const response = await fetch(r2ApiUrl(key), {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`R2 download failed (${response.status}): ${await response.text()}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    data: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type") || getMimeType(key),
  };
}

export async function deleteFromR2(key: string): Promise<void> {
  const token = getApiToken();

  const response = await fetch(r2ApiUrl(key), {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`R2 delete failed (${response.status}): ${errText}`);
  }

  console.log(`[CloudflareR2] Deleted: ${key}`);
}

export async function listR2Files(prefix: string = "", maxKeys: number = 100): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
  const token = getApiToken();
  const accountId = getAccountId();
  const bucket = getBucketName();

  const params = new URLSearchParams();
  if (prefix) params.set("prefix", prefix);
  params.set("per_page", String(maxKeys));

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`R2 list failed (${response.status}): ${errText}`);
  }

  const data = await response.json() as any;
  if (!data.success) {
    throw new Error(`R2 list API error: ${JSON.stringify(data.errors)}`);
  }

  return (data.result || []).map((item: any) => ({
    key: item.key || item.Key || "",
    size: item.size || item.Size || 0,
    lastModified: new Date(item.last_modified || item.LastModified || Date.now()),
  }));
}

export async function fileExistsOnR2(key: string): Promise<boolean> {
  try {
    const token = getApiToken();

    const response = await fetch(r2ApiUrl(key), {
      method: "HEAD",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function getPresignedUploadUrl(
  _key: string,
  _contentType: string = "image/jpeg",
  _expiresIn: number = 3600
): Promise<string> {
  throw new Error("Presigned URLs require S3-compatible endpoint which is not available. Use direct upload via /api/upload instead.");
}

export async function getPresignedDownloadUrl(
  key: string,
  _expiresIn: number = 3600
): Promise<string> {
  return getPublicUrl(key);
}

export function extractR2Key(filePath: string): string | null {
  if (filePath.startsWith("/r2/")) {
    return filePath.slice(4);
  }
  const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL;
  if (publicUrl && filePath.startsWith(publicUrl)) {
    return filePath.slice(publicUrl.length).replace(/^\//, "");
  }
  return null;
}

export function isR2Path(filePath: string): boolean {
  if (filePath.startsWith("/r2/")) return true;
  const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL;
  if (publicUrl && filePath.startsWith(publicUrl)) return true;
  return false;
}
