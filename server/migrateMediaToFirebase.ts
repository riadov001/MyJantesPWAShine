import { db } from "./db";
import { quoteMedia, invoiceMedia } from "@shared/schema";
import { eq } from "drizzle-orm";
import { uploadToFirebaseStorage, initializeFirebase } from "./firebase";
import * as fs from "fs";
import * as path from "path";

async function migrateMediaToFirebase() {
  console.log("[Migration] Starting media migration to Firebase Storage...");
  
  // Initialize Firebase
  initializeFirebase();
  
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  // Migrate quote media
  console.log("\n[Migration] Migrating quote media...");
  const quoteMediaItems = await db.select().from(quoteMedia);
  
  for (const item of quoteMediaItems) {
    if (!item.filePath) {
      skippedCount++;
      continue;
    }
    
    // Skip if already on Firebase
    if (item.filePath.startsWith("https://storage.googleapis.com/")) {
      console.log(`[Migration] Skipping ${item.fileName} - already on Firebase`);
      skippedCount++;
      continue;
    }
    
    // Check if local file exists
    const localPath = item.filePath.startsWith('/') ? `.${item.filePath}` : item.filePath;
    
    if (!fs.existsSync(localPath)) {
      console.log(`[Migration] File not found: ${localPath}`);
      errorCount++;
      continue;
    }
    
    try {
      // Read file content
      const fileBuffer = fs.readFileSync(localPath);
      const mimeType = getMimeType(item.fileName);
      
      // Upload to Firebase
      const firebaseUrl = await uploadToFirebaseStorage(
        fileBuffer,
        item.fileName,
        mimeType,
        "quotes"
      );
      
      // Update database record
      await db.update(quoteMedia)
        .set({ filePath: firebaseUrl })
        .where(eq(quoteMedia.id, item.id));
      
      console.log(`[Migration] Migrated quote media: ${item.fileName} -> ${firebaseUrl}`);
      successCount++;
    } catch (error) {
      console.error(`[Migration] Error migrating ${item.fileName}:`, error);
      errorCount++;
    }
  }

  // Migrate invoice media
  console.log("\n[Migration] Migrating invoice media...");
  const invoiceMediaItems = await db.select().from(invoiceMedia);
  
  for (const item of invoiceMediaItems) {
    if (!item.filePath) {
      skippedCount++;
      continue;
    }
    
    // Skip if already on Firebase
    if (item.filePath.startsWith("https://storage.googleapis.com/")) {
      console.log(`[Migration] Skipping ${item.fileName} - already on Firebase`);
      skippedCount++;
      continue;
    }
    
    // Check if local file exists
    const localPath = item.filePath.startsWith('/') ? `.${item.filePath}` : item.filePath;
    
    if (!fs.existsSync(localPath)) {
      console.log(`[Migration] File not found: ${localPath}`);
      errorCount++;
      continue;
    }
    
    try {
      // Read file content
      const fileBuffer = fs.readFileSync(localPath);
      const mimeType = getMimeType(item.fileName);
      
      // Upload to Firebase
      const firebaseUrl = await uploadToFirebaseStorage(
        fileBuffer,
        item.fileName,
        mimeType,
        "invoices"
      );
      
      // Update database record
      await db.update(invoiceMedia)
        .set({ filePath: firebaseUrl })
        .where(eq(invoiceMedia.id, item.id));
      
      console.log(`[Migration] Migrated invoice media: ${item.fileName} -> ${firebaseUrl}`);
      successCount++;
    } catch (error) {
      console.error(`[Migration] Error migrating ${item.fileName}:`, error);
      errorCount++;
    }
  }

  console.log("\n[Migration] ========== MIGRATION COMPLETE ==========");
  console.log(`[Migration] Success: ${successCount}`);
  console.log(`[Migration] Errors: ${errorCount}`);
  console.log(`[Migration] Skipped: ${skippedCount}`);
  console.log("[Migration] ==========================================\n");
  
  return { successCount, errorCount, skippedCount };
}

function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

// Run migration
migrateMediaToFirebase()
  .then((result) => {
    console.log("[Migration] Migration finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("[Migration] Migration failed:", error);
    process.exit(1);
  });
