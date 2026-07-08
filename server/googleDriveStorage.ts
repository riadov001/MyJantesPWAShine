// Google Drive integration via Replit Connectors
// Uses getUncachableGoogleDriveClient() - never cache this client, tokens expire
import { google, drive_v3 } from "googleapis";
import { Readable } from "stream";

let connectionSettings: any;

async function getAccessToken() {
  if (
    connectionSettings &&
    connectionSettings.settings.expires_at &&
    new Date(connectionSettings.settings.expires_at).getTime() > Date.now()
  ) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error("X-Replit-Token not found for repl/depl");
  }

  connectionSettings = await fetch(
    "https://" +
      hostname +
      "/api/v2/connection?include_secrets=true&connector_names=google-drive",
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": xReplitToken,
      },
    }
  )
    .then((res) => res.json())
    .then((data) => data.items?.[0]);

  const accessToken =
    connectionSettings?.settings?.access_token ||
    connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error("Google Drive not connected");
  }
  return accessToken;
}

// WARNING: Never cache this client. Always call this function to get a fresh client.
async function getUncachableGoogleDriveClient(): Promise<drive_v3.Drive> {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth: oauth2Client });
}

const rootFolderCache: { id: string | null; ts: number } = { id: null, ts: 0 };
const subFolderCache: Record<string, string> = {};

const KNOWN_ROOT_FOLDER_ID = "1NwXGj35U9A-rYOhh5hNRkSs9DB3F0J5o";

async function getOrCreateRootFolder(): Promise<string> {
  // Cache for 5 minutes
  if (rootFolderCache.id && Date.now() - rootFolderCache.ts < 5 * 60 * 1000) {
    return rootFolderCache.id;
  }

  const drive = await getUncachableGoogleDriveClient();

  try {
    const folder = await drive.files.get({
      fileId: KNOWN_ROOT_FOLDER_ID,
      fields: "id,name",
    });
    if (folder.data.id) {
      rootFolderCache.id = folder.data.id;
      rootFolderCache.ts = Date.now();
      console.log(`[GoogleDrive] Root folder verified: ${rootFolderCache.id} (${folder.data.name})`);
      return rootFolderCache.id;
    }
  } catch (e: any) {
    console.warn(`[GoogleDrive] Known folder ID not accessible, searching by name...`, e.message);
  }

  const folderName = process.env.GOOGLE_DRIVE_FOLDER_NAME || "Myjantes";
  const list = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
    spaces: "drive",
  });

  if (list.data.files && list.data.files.length > 0) {
    rootFolderCache.id = list.data.files[0].id!;
    rootFolderCache.ts = Date.now();
    console.log(`[GoogleDrive] Root folder found: ${rootFolderCache.id}`);
    return rootFolderCache.id;
  }

  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });

  rootFolderCache.id = folder.data.id!;
  rootFolderCache.ts = Date.now();
  console.log(`[GoogleDrive] Root folder created: ${rootFolderCache.id}`);
  return rootFolderCache.id;
}

async function getOrCreateSubFolder(subfolderName: string): Promise<string> {
  if (subFolderCache[subfolderName]) return subFolderCache[subfolderName];

  const drive = await getUncachableGoogleDriveClient();
  const parentId = await getOrCreateRootFolder();

  const list = await drive.files.list({
    q: `'${parentId}' in parents and name='${subfolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
  });

  if (list.data.files && list.data.files.length > 0) {
    subFolderCache[subfolderName] = list.data.files[0].id!;
    return subFolderCache[subfolderName];
  }

  const folder = await drive.files.create({
    requestBody: {
      name: subfolderName,
      parents: [parentId],
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });

  subFolderCache[subfolderName] = folder.data.id!;
  console.log(`[GoogleDrive] Subfolder '${subfolderName}' created: ${subFolderCache[subfolderName]}`);
  return subFolderCache[subfolderName];
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
  };
  return mimeTypes[ext] || "application/octet-stream";
}

export async function uploadToGoogleDrive(
  fileBuffer: Buffer,
  fileName: string,
  folder: string = "uploads"
): Promise<{ fileId: string; filePath: string }> {
  const drive = await getUncachableGoogleDriveClient();
  const folderId = await getOrCreateSubFolder(folder);
  const mimeType = getMimeType(fileName);

  const stream = new Readable();
  stream.push(fileBuffer);
  stream.push(null);

  console.log(`[GoogleDrive] Uploading ${fileName} to folder '${folder}'...`);

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: "id",
  });

  const fileId = res.data.id!;
  console.log(`[GoogleDrive] Uploaded: ${fileId} (${fileName})`);

  return {
    fileId,
    filePath: `/gdrive/${fileId}/${encodeURIComponent(fileName)}`,
  };
}

export async function downloadFromGoogleDrive(
  fileId: string
): Promise<{ data: Buffer; mimeType: string }> {
  const drive = await getUncachableGoogleDriveClient();

  const meta = await drive.files.get({
    fileId,
    fields: "mimeType,size",
  });

  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );

  return {
    data: Buffer.from(response.data as ArrayBuffer),
    mimeType: meta.data.mimeType || "application/octet-stream",
  };
}

export async function deleteFromGoogleDrive(fileId: string): Promise<void> {
  const drive = await getUncachableGoogleDriveClient();
  try {
    await drive.files.delete({ fileId });
    console.log(`[GoogleDrive] File deleted: ${fileId}`);
  } catch (error: any) {
    console.error(`[GoogleDrive] Error deleting file ${fileId}:`, error.message);
  }
}

export function isGoogleDrivePath(filePath: string): boolean {
  return filePath.startsWith("/gdrive/");
}

export function extractFileId(filePath: string): string | null {
  if (!isGoogleDrivePath(filePath)) return null;
  const parts = filePath.split("/");
  return parts[2] || null;
}

export function isGoogleDriveConfigured(): boolean {
  return !!(process.env.REPLIT_CONNECTORS_HOSTNAME && (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL));
}

export function getGoogleAuthUrl(): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${process.env.PUBLIC_BASE_URL || process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:5000"}/api/admin/gdrive/callback`;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID non configuré");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.file",
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{ refreshToken: string; accessToken: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${process.env.PUBLIC_BASE_URL || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:5000")}/api/admin/gdrive/callback`;
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID/SECRET non configurés");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const data: any = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return { refreshToken: data.refresh_token, accessToken: data.access_token };
}
