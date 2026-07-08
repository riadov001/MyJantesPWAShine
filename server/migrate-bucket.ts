import { Storage } from "@google-cloud/storage";
import { db } from "./db";
import { quoteMedia, invoiceMedia, quotes, invoices } from "@shared/schema";
import { eq, sql, and } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const NEW_BUCKET = "replit-objstore-5018ac01-ad08-4800-801a-a825489cd5c9";
const NEW_PRIVATE_DIR = `/${NEW_BUCKET}/.private`;

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function getMimeType(ext: string): string {
  const mimes: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf",
  };
  return mimes[ext.toLowerCase()] || "application/octet-stream";
}

async function uploadToNewBucket(fileData: Buffer, objectName: string, contentType: string): Promise<boolean> {
  try {
    const file = storage.bucket(NEW_BUCKET).file(objectName);
    const [exists] = await file.exists();
    if (exists) {
      console.log(`  [EXISTS] ${objectName}`);
      return true;
    }
    await file.save(fileData, { metadata: { contentType } });
    console.log(`  [UPLOADED] ${objectName} (${fileData.length} bytes)`);
    return true;
  } catch (err: any) {
    console.error(`  [ERROR] Failed to upload ${objectName}: ${err.message}`);
    return false;
  }
}

function extractReference(filePath: string): { ref: string; type: "quote" | "invoice" } | null {
  const baseName = path.basename(filePath).replace(/\.[^.]+$/, "");
  
  const patterns: Array<{ regex: RegExp; type: "quote" | "invoice" }> = [
    { regex: /(DEV-\d+-\d+-\d+)/, type: "quote" },
    { regex: /(DEV-\d+-\d{5})/, type: "quote" },
    { regex: /(FACT-\d+-\d+-\d+)/, type: "invoice" },
    { regex: /(CB-\d{6})/, type: "invoice" },
    { regex: /(CB-\d{2}-\d{4})/, type: "invoice" },
    { regex: /(CBL-\d{2}-\d{4})/, type: "invoice" },
    { regex: /(ES-\d{6})/, type: "invoice" },
    { regex: /(ESP-\d{2}-\d{4})/, type: "invoice" },
    { regex: /(VI-\d{6})/, type: "invoice" },
    { regex: /(VIR-\d{2}-\d{4})/, type: "invoice" },
    { regex: /(CV-\d{6})/, type: "invoice" },
  ];
  
  for (const p of patterns) {
    const match = baseName.match(p.regex);
    if (match) return { ref: match[1], type: p.type };
  }
  
  const fullPath = filePath.replace(/^.*\//, "");
  for (const p of patterns) {
    const match = fullPath.match(p.regex);
    if (match) return { ref: match[1], type: p.type };
  }
  
  return null;
}

async function migrateLocalUploads() {
  console.log("=== STEP 1: Migrating local /uploads/ files to new bucket ===");
  
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    console.log("No uploads directory found");
    return;
  }
  
  const localFiles = fs.readdirSync(uploadsDir);
  console.log(`Found ${localFiles.length} local files to migrate`);
  
  let migrated = 0, errors = 0, skipped = 0;
  
  for (const fileName of localFiles) {
    const fullLocalPath = path.join(uploadsDir, fileName);
    const stat = fs.statSync(fullLocalPath);
    if (!stat.isFile()) continue;
    
    const ext = path.extname(fileName);
    const contentType = getMimeType(ext);
    
    const refInfo = extractReference(fileName);
    let folder = "uploads";
    if (refInfo?.type === "quote") folder = "quotes";
    else if (refInfo?.type === "invoice") folder = "invoices";
    
    const objectName = `.private/${folder}/${fileName}`;
    
    try {
      const fileData = fs.readFileSync(fullLocalPath);
      const success = await uploadToNewBucket(fileData, objectName, contentType);
      if (success) migrated++;
      else errors++;
    } catch (err: any) {
      console.error(`  [ERROR] Reading ${fileName}: ${err.message}`);
      errors++;
    }
  }
  
  console.log(`\nMigration results: ${migrated} uploaded, ${errors} errors`);
}

async function updateMediaPaths() {
  console.log("\n=== STEP 2: Updating /uploads/ paths in database to /objects/ paths ===");
  
  const allQuoteMedia = await db.select().from(quoteMedia);
  const allInvoiceMedia = await db.select().from(invoiceMedia);
  
  let updated = 0;
  
  for (const media of allQuoteMedia) {
    if (media.filePath.startsWith("/uploads/")) {
      const fileName = media.filePath.replace("/uploads/", "");
      const refInfo = extractReference(fileName);
      const folder = refInfo?.type === "quote" ? "quotes" : "uploads";
      const newPath = `/objects/${folder}/${fileName}`;
      
      const objectName = `.private/${folder}/${fileName}`;
      const file = storage.bucket(NEW_BUCKET).file(objectName);
      try {
        const [exists] = await file.exists();
        if (exists) {
          await db.update(quoteMedia).set({ filePath: newPath }).where(eq(quoteMedia.id, media.id));
          console.log(`  [UPDATED] quote_media ${media.id}: ${media.filePath} -> ${newPath}`);
          updated++;
        } else {
          console.log(`  [SKIP] File not in new bucket: ${objectName}`);
        }
      } catch (err: any) {
        console.log(`  [ERROR] Checking ${objectName}: ${err.message}`);
      }
    }
  }
  
  for (const media of allInvoiceMedia) {
    if (media.filePath.startsWith("/uploads/")) {
      const fileName = media.filePath.replace("/uploads/", "");
      const refInfo = extractReference(fileName);
      const folder = refInfo?.type === "invoice" ? "invoices" : "uploads";
      const newPath = `/objects/${folder}/${fileName}`;
      
      const objectName = `.private/${folder}/${fileName}`;
      const file = storage.bucket(NEW_BUCKET).file(objectName);
      try {
        const [exists] = await file.exists();
        if (exists) {
          await db.update(invoiceMedia).set({ filePath: newPath }).where(eq(invoiceMedia.id, media.id));
          console.log(`  [UPDATED] invoice_media ${media.id}: ${media.filePath} -> ${newPath}`);
          updated++;
        } else {
          console.log(`  [SKIP] File not in new bucket: ${objectName}`);
        }
      } catch (err: any) {
        console.log(`  [ERROR] Checking ${objectName}: ${err.message}`);
      }
    }
  }
  
  console.log(`Updated ${updated} media paths`);
}

async function linkOrphanedPhotos() {
  console.log("\n=== STEP 3: Analyzing filenames and linking photos to quotes/invoices ===");
  
  const allQuoteMedia = await db.select().from(quoteMedia);
  const allInvoiceMedia = await db.select().from(invoiceMedia);
  const allQuotes = await db.select({ id: quotes.id, reference: quotes.reference }).from(quotes);
  const allInvoices = await db.select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber }).from(invoices);
  
  const quotesByRef = new Map<string, string>();
  for (const q of allQuotes) {
    if (q.reference) quotesByRef.set(q.reference, q.id);
  }
  
  const invoicesByRef = new Map<string, string>();
  for (const inv of allInvoices) {
    if (inv.invoiceNumber) invoicesByRef.set(inv.invoiceNumber, inv.id);
  }
  
  const quoteMediaByQuoteId = new Map<string, typeof allQuoteMedia>();
  for (const m of allQuoteMedia) {
    const existing = quoteMediaByQuoteId.get(m.quoteId) || [];
    existing.push(m);
    quoteMediaByQuoteId.set(m.quoteId, existing);
  }
  
  const invoiceMediaByInvId = new Map<string, typeof allInvoiceMedia>();
  for (const m of allInvoiceMedia) {
    const existing = invoiceMediaByInvId.get(m.invoiceId) || [];
    existing.push(m);
    invoiceMediaByInvId.set(m.invoiceId, existing);
  }
  
  console.log("\n--- Checking mismatched quote media ---");
  let fixedQuote = 0;
  for (const media of allQuoteMedia) {
    const refInfo = extractReference(media.filePath);
    if (!refInfo || refInfo.type !== "quote") continue;
    
    const correctQuoteId = quotesByRef.get(refInfo.ref);
    if (!correctQuoteId) continue;
    
    if (media.quoteId !== correctQuoteId) {
      console.log(`  [FIX] ${media.filePath} (ref ${refInfo.ref}): ${media.quoteId} -> ${correctQuoteId}`);
      await db.update(quoteMedia).set({ quoteId: correctQuoteId }).where(eq(quoteMedia.id, media.id));
      fixedQuote++;
    }
  }
  console.log(`Fixed ${fixedQuote} mismatched quote media entries`);
  
  console.log("\n--- Checking mismatched invoice media ---");
  let fixedInvoice = 0;
  for (const media of allInvoiceMedia) {
    const refInfo = extractReference(media.filePath);
    if (!refInfo || refInfo.type !== "invoice") continue;
    
    const correctInvoiceId = invoicesByRef.get(refInfo.ref);
    if (!correctInvoiceId) continue;
    
    if (media.invoiceId !== correctInvoiceId) {
      console.log(`  [FIX] ${media.filePath} (ref ${refInfo.ref}): ${media.invoiceId} -> ${correctInvoiceId}`);
      await db.update(invoiceMedia).set({ invoiceId: correctInvoiceId }).where(eq(invoiceMedia.id, media.id));
      fixedInvoice++;
    }
  }
  console.log(`Fixed ${fixedInvoice} mismatched invoice media entries`);

  console.log("\n--- Scanning local files for unlinked photos ---");
  const uploadsDir = path.join(process.cwd(), "uploads");
  let newLinks = 0;
  
  if (fs.existsSync(uploadsDir)) {
    const localFiles = fs.readdirSync(uploadsDir);
    
    const allQuoteMediaPaths = new Set(allQuoteMedia.map(m => {
      if (m.filePath.startsWith("/uploads/")) return m.filePath.replace("/uploads/", "");
      if (m.filePath.startsWith("/objects/uploads/")) return m.filePath.replace("/objects/uploads/", "");
      if (m.filePath.startsWith("/objects/quotes/")) return m.filePath.replace("/objects/quotes/", "");
      return m.filePath;
    }));
    
    const allInvoiceMediaPaths = new Set(allInvoiceMedia.map(m => {
      if (m.filePath.startsWith("/uploads/")) return m.filePath.replace("/uploads/", "");
      if (m.filePath.startsWith("/objects/uploads/")) return m.filePath.replace("/objects/uploads/", "");
      if (m.filePath.startsWith("/objects/invoices/")) return m.filePath.replace("/objects/invoices/", "");
      return m.filePath;
    }));
    
    for (const fileName of localFiles) {
      if (allQuoteMediaPaths.has(fileName) || allInvoiceMediaPaths.has(fileName)) continue;
      
      const refInfo = extractReference(fileName);
      if (!refInfo) continue;
      
      const ext = path.extname(fileName);
      const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
      if (!isImage) continue;
      
      if (refInfo.type === "quote") {
        const quoteId = quotesByRef.get(refInfo.ref);
        if (!quoteId) {
          console.log(`  [SKIP] No quote found for reference ${refInfo.ref} (file: ${fileName})`);
          continue;
        }
        
        const folder = "quotes";
        const newPath = `/objects/${folder}/${fileName}`;
        
        await db.insert(quoteMedia).values({
          quoteId,
          filePath: newPath,
          fileType: "image" as any,
          fileName: fileName,
          fileSize: fs.statSync(path.join(uploadsDir, fileName)).size,
        });
        console.log(`  [LINKED] ${fileName} -> quote ${refInfo.ref} (${quoteId})`);
        newLinks++;
        
      } else {
        const invoiceId = invoicesByRef.get(refInfo.ref);
        if (!invoiceId) {
          console.log(`  [SKIP] No invoice found for reference ${refInfo.ref} (file: ${fileName})`);
          continue;
        }
        
        const folder = "invoices";
        const newPath = `/objects/${folder}/${fileName}`;
        
        await db.insert(invoiceMedia).values({
          invoiceId,
          filePath: newPath,
          fileType: "image" as any,
          fileName: fileName,
          fileSize: fs.statSync(path.join(uploadsDir, fileName)).size,
        });
        console.log(`  [LINKED] ${fileName} -> invoice ${refInfo.ref} (${invoiceId})`);
        newLinks++;
      }
    }
  }
  
  console.log(`\nCreated ${newLinks} new media links from unlinked files`);
}

async function verifyResults() {
  console.log("\n=== STEP 4: Verification ===");
  
  const [newFiles] = await storage.bucket(NEW_BUCKET).getFiles();
  console.log(`New bucket has ${newFiles.length} files total`);
  
  const dirs = new Map<string, number>();
  for (const f of newFiles) {
    const parts = f.name.split("/");
    const dir = parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts[0];
    dirs.set(dir, (dirs.get(dir) || 0) + 1);
  }
  for (const [dir, count] of dirs) {
    console.log(`  ${dir}: ${count} files`);
  }
  
  const qmResult = await db.select({
    type: sql<string>`CASE 
      WHEN file_path LIKE '/objects/%' THEN 'objects'
      WHEN file_path LIKE '/uploads/%' THEN 'uploads'
      WHEN file_path LIKE '/gdrive/%' THEN 'gdrive'
      WHEN file_path LIKE '/r2/%' THEN 'r2'
      ELSE 'other'
    END`,
    count: sql<number>`COUNT(*)`,
  }).from(quoteMedia).groupBy(sql`1`);
  
  console.log("\nQuote media by storage type:");
  for (const r of qmResult) {
    console.log(`  ${r.type}: ${r.count}`);
  }
  
  const imResult = await db.select({
    type: sql<string>`CASE 
      WHEN file_path LIKE '/objects/%' THEN 'objects'
      WHEN file_path LIKE '/uploads/%' THEN 'uploads'
      WHEN file_path LIKE '/gdrive/%' THEN 'gdrive'
      WHEN file_path LIKE '/r2/%' THEN 'r2'
      ELSE 'other'
    END`,
    count: sql<number>`COUNT(*)`,
  }).from(invoiceMedia).groupBy(sql`1`);
  
  console.log("\nInvoice media by storage type:");
  for (const r of imResult) {
    console.log(`  ${r.type}: ${r.count}`);
  }
  
  const quotesNoMedia = await db.select({ 
    reference: quotes.reference 
  }).from(quotes)
    .leftJoin(quoteMedia, eq(quoteMedia.quoteId, quotes.id))
    .groupBy(quotes.id, quotes.reference)
    .having(sql`COUNT(${quoteMedia.id}) = 0`);
  
  console.log(`\nQuotes with 0 media: ${quotesNoMedia.length}`);
  if (quotesNoMedia.length > 0 && quotesNoMedia.length <= 30) {
    for (const q of quotesNoMedia) {
      console.log(`  ${q.reference}`);
    }
  }
}

async function main() {
  console.log("=== BUCKET MIGRATION SCRIPT ===");
  console.log(`New bucket: ${NEW_BUCKET}`);
  console.log(`New private dir: ${NEW_PRIVATE_DIR}`);
  console.log("");
  
  try {
    await migrateLocalUploads();
    await updateMediaPaths();
    await linkOrphanedPhotos();
    await verifyResults();
    
    console.log("\n=== MIGRATION COMPLETE ===");
  } catch (err: any) {
    console.error("Migration failed:", err);
  }
  
  process.exit(0);
}

main();
