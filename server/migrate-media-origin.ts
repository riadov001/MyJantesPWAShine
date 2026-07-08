import { Client } from "@replit/object-storage";
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_ID || process.env.OBJECT_STORAGE_BUCKET_ID || "replit-objstore-5018ac01-ad08-4800-801a-a825489cd5c9";
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

const client = new Client({ bucketId: BUCKET_ID });

function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (Array.isArray(value) && value.length > 0) return Buffer.isBuffer(value[0]) ? value[0] : Buffer.from(value[0] as Uint8Array);
  return Buffer.from(value as ArrayBuffer);
}

function extractReference(fileName: string): { ref: string; type: "quote" | "invoice" } | null {
  const patterns: Array<{ regex: RegExp; type: "quote" | "invoice" }> = [
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
    const match = fileName.match(p.regex);
    if (match) return { ref: match[1], type: p.type };
  }
  return null;
}

async function step1_uploadFiles(): Promise<Map<string, string>> {
  console.log("=== STEP 1: Upload local files to object storage ===");
  const uploaded = new Map<string, string>();

  if (!fs.existsSync(UPLOADS_DIR)) {
    console.log("No /uploads/ directory found, skipping.");
    return uploaded;
  }

  const files = fs.readdirSync(UPLOADS_DIR).filter(f => {
    const full = path.join(UPLOADS_DIR, f);
    return fs.statSync(full).isFile() && /\.(jpg|jpeg|png|gif|webp|pdf|mp4|webm|mov)$/i.test(f);
  });

  console.log(`Found ${files.length} media files to upload`);
  let count = 0, skipped = 0, errors = 0;

  for (const fileName of files) {
    const storagePath = `.private/uploads/${fileName}`;
    const objectPath = `/objects/uploads/${fileName}`;

    try {
      const existsResult = await client.exists(storagePath);
      if (existsResult.ok && existsResult.value) {
        uploaded.set(fileName, objectPath);
        skipped++;
        continue;
      }

      const buffer = fs.readFileSync(path.join(UPLOADS_DIR, fileName));
      const result = await client.uploadFromBytes(storagePath, buffer);
      if (result.ok) {
        uploaded.set(fileName, objectPath);
        count++;
        if (count % 25 === 0) console.log(`  Uploaded ${count}...`);
      } else {
        errors++;
      }
    } catch (err: any) {
      errors++;
      if (!err.message?.includes("Data,")) console.error(`  [ERROR] ${fileName}: ${err.message?.substring(0, 80)}`);
    }
  }

  console.log(`Upload done: ${count} new, ${skipped} existed, ${errors} errors\n`);
  return uploaded;
}

async function step2_matchAndLink(db: Pool, uploadedFiles: Map<string, string>) {
  console.log("=== STEP 2: Match files to quotes/invoices ===");

  const { rows: allQuoteMedia } = await db.query("SELECT id, quote_id, file_path, file_name FROM quote_media");
  const { rows: allInvoiceMedia } = await db.query("SELECT id, invoice_id, file_path, file_name FROM invoice_media");
  const { rows: allQuotes } = await db.query("SELECT id, reference FROM quotes WHERE reference IS NOT NULL");
  const { rows: allInvoices } = await db.query("SELECT id, invoice_number FROM invoices WHERE invoice_number IS NOT NULL");

  const quotesByRef = new Map(allQuotes.map((q: any) => [q.reference, q.id]));
  const invoicesByRef = new Map(allInvoices.map((i: any) => [i.invoice_number, i.id]));

  const linkedFiles = new Set<string>();
  for (const m of allQuoteMedia) linkedFiles.add(m.file_name);
  for (const m of allInvoiceMedia) linkedFiles.add(m.file_name);
  for (const m of allQuoteMedia) linkedFiles.add(path.basename(m.file_path));
  for (const m of allInvoiceMedia) linkedFiles.add(path.basename(m.file_path));

  let pathsUpdated = 0;
  for (const media of [...allQuoteMedia, ...allInvoiceMedia]) {
    const table = allQuoteMedia.includes(media) ? "quote_media" : "invoice_media";
    const baseName = path.basename(media.file_path);

    if (uploadedFiles.has(baseName)) {
      const newPath = uploadedFiles.get(baseName)!;
      if (newPath !== media.file_path) {
        await db.query(`UPDATE ${table} SET file_path = $1 WHERE id = $2`, [newPath, media.id]);
        pathsUpdated++;
      }
      continue;
    }
    if (media.file_name && uploadedFiles.has(media.file_name)) {
      const newPath = uploadedFiles.get(media.file_name)!;
      if (newPath !== media.file_path) {
        await db.query(`UPDATE ${table} SET file_path = $1 WHERE id = $2`, [newPath, media.id]);
        pathsUpdated++;
      }
    }
  }
  console.log(`Updated ${pathsUpdated} existing media paths\n`);

  console.log("=== STEP 3: Create new associations for unlinked files ===");
  let newLinks = 0, noRef = 0, noEntity = 0;

  for (const [fileName, objectPath] of uploadedFiles) {
    if (linkedFiles.has(fileName)) continue;

    const refInfo = extractReference(fileName);
    if (!refInfo) { noRef++; continue; }

    const fileSize = fs.existsSync(path.join(UPLOADS_DIR, fileName))
      ? fs.statSync(path.join(UPLOADS_DIR, fileName)).size : 0;

    if (refInfo.type === "quote") {
      const quoteId = quotesByRef.get(refInfo.ref);
      if (!quoteId) { noEntity++; continue; }
      await db.query(
        `INSERT INTO quote_media (id, quote_id, file_path, file_type, file_name, file_size)
         VALUES (gen_random_uuid(), $1, $2, 'image', $3, $4)`,
        [quoteId, objectPath, fileName, fileSize]
      );
      console.log(`  [LINKED] ${fileName} -> quote ${refInfo.ref}`);
      newLinks++;
    } else {
      const invoiceId = invoicesByRef.get(refInfo.ref);
      if (!invoiceId) { noEntity++; continue; }
      await db.query(
        `INSERT INTO invoice_media (id, invoice_id, file_path, file_type, file_name, file_size)
         VALUES (gen_random_uuid(), $1, $2, 'image', $3, $4)`,
        [invoiceId, objectPath, fileName, fileSize]
      );
      console.log(`  [LINKED] ${fileName} -> invoice ${refInfo.ref}`);
      newLinks++;
    }
  }

  console.log(`\nNew links: ${newLinks}, No reference pattern: ${noRef}, Entity not found: ${noEntity}\n`);
}

async function step3_summary(db: Pool) {
  console.log("=== SUMMARY ===");
  const { rows } = await db.query(`
    SELECT storage_type, SUM(cnt)::int as total FROM (
      SELECT CASE
        WHEN file_path LIKE '/objects/%' THEN 'object_storage'
        WHEN file_path LIKE '/gdrive/%' THEN 'gdrive'
        WHEN file_path LIKE '/uploads/%' THEN 'legacy_uploads'
        ELSE 'other'
      END as storage_type, COUNT(*) as cnt
      FROM quote_media GROUP BY 1
      UNION ALL
      SELECT CASE
        WHEN file_path LIKE '/objects/%' THEN 'object_storage'
        WHEN file_path LIKE '/gdrive/%' THEN 'gdrive'
        WHEN file_path LIKE '/uploads/%' THEN 'legacy_uploads'
        ELSE 'other'
      END, COUNT(*)
      FROM invoice_media GROUP BY 1
    ) t GROUP BY 1 ORDER BY 2 DESC
  `);
  for (const r of rows) console.log(`  ${r.storage_type}: ${r.total}`);
}

async function main() {
  console.log(`=== MEDIA MIGRATION ===`);
  console.log(`Bucket: ${BUCKET_ID}\n`);

  const db = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const uploadedFiles = await step1_uploadFiles();
    await step2_matchAndLink(db, uploadedFiles);
    await step3_summary(db);
  } finally {
    await db.end();
  }

  console.log("\n=== COMPLETE ===");
  process.exit(0);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
