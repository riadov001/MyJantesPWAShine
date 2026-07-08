/**
 * Migration: DEFAULT_OBJECT_STORAGE_ID_OLD → DEFAULT_OBJECT_STORAGE_ID
 * Uses @replit/object-storage Client with explicit bucketId to access both buckets.
 * Run with: node scripts/migrate-storage-buckets.mjs
 */

import { Client } from "@replit/object-storage";
import { Storage } from "@google-cloud/storage";

const SIDECAR = "http://127.0.0.1:1106";

const OLD_BUCKET = process.env.DEFAULT_OBJECT_STORAGE_ID_OLD;
const NEW_BUCKET = process.env.DEFAULT_OBJECT_STORAGE_ID;

if (!OLD_BUCKET || !NEW_BUCKET) {
  console.error("❌  Missing env vars:");
  if (!OLD_BUCKET) console.error("   DEFAULT_OBJECT_STORAGE_ID_OLD is not set");
  if (!NEW_BUCKET)  console.error("   DEFAULT_OBJECT_STORAGE_ID is not set");
  process.exit(1);
}

console.log("=== Object Storage Migration ===");
console.log(`Source (old): ${OLD_BUCKET}`);
console.log(`Dest   (new): ${NEW_BUCKET}`);
console.log("");

// Use the sidecar ADC credentials (same as @replit/object-storage uses internally)
function createGCS(bucketId) {
  const gcs = new Storage({
    apiEndpoint: "https://storage.googleapis.com",
    credentials: {
      audience: "replit",
      subject_token_type: "access_token",
      token_url: `${SIDECAR}/token`,
      type: "external_account",
      credential_source: {
        url: `${SIDECAR}/credential`,
        format: { type: "json", subject_token_field_name: "access_token" },
      },
      universe_domain: "googleapis.com",
    },
    projectId: "",
  });
  return gcs.bucket(bucketId);
}

async function main() {
  const srcBucket = createGCS(OLD_BUCKET);
  const dstBucket = createGCS(NEW_BUCKET);

  // Also create @replit/object-storage clients for SDK-based access
  const srcClient = new Client({ bucketId: OLD_BUCKET });
  const dstClient = new Client({ bucketId: NEW_BUCKET });

  // 1. List all objects in the old bucket via GCS
  console.log("📋  Listing files in old bucket…");
  let allFiles = [];
  try {
    [allFiles] = await srcBucket.getFiles();
    console.log(`Found ${allFiles.length} file(s) in old bucket.\n`);
  } catch (gcsErr) {
    console.warn("GCS list failed:", gcsErr.message);
    console.log("Trying @replit/object-storage SDK list…");
    try {
      const result = await srcClient.list();
      if (result.ok) {
        // Build synthetic file-like objects from SDK list
        const names = result.value.map((o) => o.name);
        console.log(`Found ${names.length} file(s) via SDK.\n`);
        // Fall through to SDK-based copy loop
        await migrateViaSdk(names, srcClient, dstClient);
        return;
      } else {
        console.error("SDK list also failed:", result.error);
        process.exit(1);
      }
    } catch (sdkErr) {
      console.error("SDK list error:", sdkErr.message);
      process.exit(1);
    }
  }

  if (allFiles.length === 0) {
    console.log("ℹ️   Old bucket is empty — nothing to migrate.");
    process.exit(0);
  }

  // Print a breakdown by folder
  const folderMap = new Map();
  for (const f of allFiles) {
    const parts = f.name.split("/");
    const dir = parts.length > 1 ? parts.slice(0, 2).join("/") : "(root)";
    folderMap.set(dir, (folderMap.get(dir) || 0) + 1);
  }
  for (const [dir, cnt] of folderMap) {
    console.log(`  ${dir}: ${cnt} file(s)`);
  }
  console.log("");

  // 2. Copy each file via GCS
  await migrateViaGCS(allFiles, srcBucket, dstBucket);
}

async function migrateViaGCS(allFiles, srcBucket, dstBucket) {
  let copied = 0, skipped = 0, errors = 0;
  const errorList = [];

  for (let i = 0; i < allFiles.length; i++) {
    const srcFile = allFiles[i];
    const name = srcFile.name;
    const dstFile = dstBucket.file(name);
    const progress = `[${i + 1}/${allFiles.length}]`;

    try {
      const [exists] = await dstFile.exists();
      if (exists) {
        console.log(`${progress} ⏭  SKIP (exists): ${name}`);
        skipped++;
        continue;
      }

      const [buffer] = await srcFile.download();
      const [srcMeta] = await srcFile.getMetadata();
      const contentType = srcMeta.contentType || "application/octet-stream";

      await dstFile.save(buffer, { metadata: { contentType }, resumable: false });
      console.log(`${progress} ✅  COPIED (${buffer.length} bytes): ${name}`);
      copied++;
    } catch (err) {
      console.error(`${progress} ❌  ERROR: ${name} — ${err.message}`);
      errors++;
      errorList.push({ name, error: err.message });
    }
  }

  printSummary(copied, skipped, errors, errorList);
}

async function migrateViaSdk(names, srcClient, dstClient) {
  let copied = 0, skipped = 0, errors = 0;
  const errorList = [];

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const progress = `[${i + 1}/${names.length}]`;

    try {
      // Check if exists in destination
      const existsResult = await dstClient.exists(name);
      if (existsResult.ok && existsResult.value) {
        console.log(`${progress} ⏭  SKIP (exists): ${name}`);
        skipped++;
        continue;
      }

      // Download from source
      const dlResult = await srcClient.downloadAsBytes(name);
      if (!dlResult.ok) {
        throw new Error(dlResult.error || "Download failed");
      }
      const buffer = Buffer.isBuffer(dlResult.value)
        ? dlResult.value
        : Buffer.from(dlResult.value);

      // Upload to destination
      const ulResult = await dstClient.uploadFromBytes(name, buffer);
      if (!ulResult.ok) {
        throw new Error(ulResult.error || "Upload failed");
      }

      console.log(`${progress} ✅  COPIED (${buffer.length} bytes): ${name}`);
      copied++;
    } catch (err) {
      console.error(`${progress} ❌  ERROR: ${name} — ${err.message}`);
      errors++;
      errorList.push({ name, error: err.message });
    }
  }

  printSummary(copied, skipped, errors, errorList);
}

function printSummary(copied, skipped, errors, errorList) {
  console.log("\n=== Migration Complete ===");
  console.log(`✅  Copied:  ${copied}`);
  console.log(`⏭  Skipped: ${skipped} (already in destination)`);
  console.log(`❌  Errors:  ${errors}`);
  if (errorList.length > 0) {
    console.log("\nFailed files:");
    for (const e of errorList) {
      console.log(`  ${e.name}: ${e.error}`);
    }
  }
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
