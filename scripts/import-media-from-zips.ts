/**
 * Import des médias depuis les 4 ZIPs de galerie vers l'Object Storage
 * et création des entrées quoteMedia en base.
 *
 * Usage : npx tsx scripts/import-media-from-zips.ts
 *
 * Lit les ZIPs depuis attached_assets/, déduplique par nom de fichier
 * (première occurrence gagne), puis upload via ObjectStorageService.
 */

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import JSZip from "jszip";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { pgTable, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL!;
if (!DATABASE_URL) throw new Error("DATABASE_URL not set");

// ---------------------------------------------------------------------------
// Inline schema tables (avoid importing full server deps)
// ---------------------------------------------------------------------------
const quotes = pgTable("quotes", {
  id: varchar("id").primaryKey(),
  reference: varchar("reference"),
});

const quoteMedia = pgTable("quote_media", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteId: varchar("quote_id").notNull(),
  fileType: varchar("file_type").notNull(),
  filePath: varchar("file_path", { length: 500 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileSize: integer("file_size"),
  createdAt: timestamp("created_at").defaultNow(),
});

const pool = new Pool({ connectionString: DATABASE_URL, max: 3 });
const db = drizzle({ client: pool });

// ---------------------------------------------------------------------------
// Object Storage upload via @replit/object-storage SDK (same as ObjectStorageService)
// ---------------------------------------------------------------------------
async function uploadBuffer(buffer: Buffer, fileName: string): Promise<string> {
  const { Client } = await import("@replit/object-storage");
  const client = new Client();
  const ext = path.extname(fileName).toLowerCase();
  const uuid = randomUUID();
  const storageName = `${uuid}${ext}`;
  const objectName = `.private/uploads/${storageName}`;
  await client.uploadFromBytes(objectName, buffer);
  return `/objects/uploads/${storageName}`;
}

// ---------------------------------------------------------------------------
// ZIP files in attached_assets/
// ---------------------------------------------------------------------------
const ZIP_FILES = [
  "attached_assets/galerie-export-2026-05-22_1779428374585.zip",
  "attached_assets/galerie-export-2026-05-22_2_1779428374585.zip",
  "attached_assets/galerie-export-2026-05-22_3_1779428374585.zip",
  "attached_assets/galerie-export-2026-05-22_4_1779428374585.zip",
];

// ---------------------------------------------------------------------------
// Collect unique files across all ZIPs (first occurrence wins = deduplication)
// ---------------------------------------------------------------------------
async function collectUniqueFiles(): Promise<Map<string, Buffer>> {
  const seen = new Map<string, Buffer>(); // fileName → buffer

  for (const zipRelPath of ZIP_FILES) {
    const fullPath = path.join(process.cwd(), zipRelPath);
    if (!fs.existsSync(fullPath)) {
      console.warn(`  ⚠️  ZIP introuvable: ${zipRelPath}`);
      continue;
    }
    console.log(`\n📦 Lecture ${path.basename(zipRelPath)}`);
    const zipData = fs.readFileSync(fullPath);
    const zip = await JSZip.loadAsync(zipData);

    for (const [entryName, entry] of Object.entries(zip.files)) {
      const baseName = path.basename(entryName);
      if (entry.dir || !baseName.match(/\.(jpg|jpeg|png|gif|webp)$/i)) continue;
      if (seen.has(baseName)) {
        console.log(`  ⏭  Doublon ignoré: ${baseName}`);
        continue;
      }
      const buffer = Buffer.from(await entry.async("arraybuffer"));
      seen.set(baseName, buffer);
      console.log(`  ✅ ${baseName} (${(buffer.length / 1024).toFixed(0)} Ko)`);
    }
  }

  return seen;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("🚀 Import médias ZIPs (attached_assets/) → Object Storage + quoteMedia\n");

  // 1. Charger la map reference→id depuis la base
  const allQuotes = await db.select({ id: quotes.id, reference: quotes.reference }).from(quotes);
  const quoteByRef = new Map(allQuotes.map((q) => [q.reference!, q.id]));
  console.log(`📊 ${allQuotes.length} devis trouvés en base`);

  // 2. Charger les entrées quoteMedia existantes (idempotence)
  const existingMedia = await db
    .select({ fileName: quoteMedia.fileName, quoteId: quoteMedia.quoteId })
    .from(quoteMedia);
  const existingKeys = new Set(existingMedia.map((m) => `${m.quoteId}:${m.fileName}`));
  console.log(`📁 ${existingMedia.length} médias déjà en base`);

  // 3. Collecter les fichiers uniques des ZIPs
  const uniqueFiles = await collectUniqueFiles();
  console.log(`\n🗂  ${uniqueFiles.size} fichiers uniques extraits des ZIPs\n`);

  let uploaded = 0, skipped = 0, missingQuote = 0, errors = 0;
  const missingRefs: string[] = [];

  for (const [fileName, buffer] of uniqueFiles) {
    // Parse "DEV-05-00031_1.jpg" → reference + index
    const m = fileName.match(/^(DEV-\d{2}-\d{5})_(\d+)\.(jpg|jpeg|png|gif|webp)$/i);
    if (!m) {
      console.warn(`  ⚠️  Format non reconnu: ${fileName}`);
      continue;
    }

    const reference = m[1];
    const quoteId = quoteByRef.get(reference);
    if (!quoteId) {
      console.warn(`  ❌ Devis absent en base: ${reference} (${fileName})`);
      if (!missingRefs.includes(reference)) missingRefs.push(reference);
      missingQuote++;
      continue;
    }

    const existKey = `${quoteId}:${fileName}`;
    if (existingKeys.has(existKey)) {
      console.log(`  ⏭  Déjà importé: ${fileName}`);
      skipped++;
      continue;
    }

    try {
      process.stdout.write(`  ⬆️  ${fileName} (${(buffer.length / 1024).toFixed(0)} Ko)... `);
      const filePath = await uploadBuffer(buffer, fileName);
      process.stdout.write(`✅ ${filePath}\n`);

      await db.insert(quoteMedia).values({
        id: randomUUID(),
        quoteId,
        fileType: "image",
        filePath,
        fileName,
        fileSize: buffer.length,
      });

      existingKeys.add(existKey);
      uploaded++;
    } catch (err: any) {
      process.stdout.write(`\n`);
      console.error(`  💥 Erreur: ${err.message}`);
      errors++;
    }
  }

  // 4. Résumé
  console.log("\n" + "═".repeat(60));
  console.log(`✅ Importés        : ${uploaded}`);
  console.log(`⏭  Déjà présents  : ${skipped}`);
  console.log(`❌ Devis manquants : ${missingQuote}${missingRefs.length ? ` (${missingRefs.join(", ")})` : ""}`);
  console.log(`💥 Erreurs         : ${errors}`);
  console.log("═".repeat(60) + "\n");

  await pool.end();
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});
