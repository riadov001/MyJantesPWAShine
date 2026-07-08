import { Storage } from "@google-cloud/storage";
import fs from "fs";
import path from "path";
import { Pool } from "pg";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const FALLBACK_BUCKET_ID = "replit-objstore-5018ac01-ad08-4800-801a-a825489cd5c9";

const bucketId =
  process.env.APP_STORAGE_ID ||
  process.env.DEFAULT_OBJECT_STORAGE_ID ||
  process.env.OBJECT_STORAGE_BUCKET_ID ||
  process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID ||
  FALLBACK_BUCKET_ID;

console.log("Bucket:", bucketId);

const gcs = new Storage({
  apiEndpoint: "https://storage.googleapis.com",
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

const bucket = gcs.bucket(bucketId);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const quoteMap = {
  "DEV-05-00017": "a3ec7fd6-6559-48ad-85f0-ab8dd8bf4335",
  "DEV-05-00018": "01f5fff2-df99-4c11-8cc5-d4acf7c2c312",
  "DEV-05-00019": "57015cda-5276-4f92-a003-4d255a74013a",
  "DEV-05-00038": "4dfec908-22d1-4673-8975-7fadbe016d9b",
  "DEV-05-00039": "ae0a5d3e-06a7-4edd-9a1e-47e5d58cbe69",
  "DEV-05-00040": "334af53f-c5c5-4fc5-9b9a-5d11b8ff13b2",
  "DEV-05-00041": "9289c94f-e4eb-47ca-886f-78a84c4b1156",
  "DEV-05-00042": "4b3554cd-ae8d-4cc9-aea0-224b1b3c3f29",
  "DEV-05-00043": "6e4e40da-6269-4342-abf0-859fae6be6b5",
  "DEV-05-00044": "206a2d6b-12f7-463d-b950-5bea343539ef",
  "DEV-05-00045": "8e06500d-efce-4748-80aa-9f6084e94bef",
  "DEV-06-00019": "16adbdb6-fa5e-487c-9180-5311aeeffcb9",
  "DEV-06-00020": "6af09dcf-4e1f-432f-a499-bc4f1b3ea84a",
  "DEV-06-00021": "09926729-f0d4-4612-a396-ae38f3376367",
  "DEV-06-00022": "b3210486-81a2-4717-944d-e5c3dccc62e9",
  "DEV-06-00023": "1791e0ac-ce83-4cda-b1d1-16adac790adc",
};

const mimeMap = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const galleryDir = "/tmp/all_gallery";
const files = fs.readdirSync(galleryDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));

let uploaded = 0, skipped = 0, errors = 0;

for (const filename of files) {
  const filePath = path.join(galleryDir, filename);
  const ext = path.extname(filename).toLowerCase();
  const match = filename.match(/^(DEV-\d{2}-\d{5})/);
  if (!match) { console.log(`SKIP (no match): ${filename}`); skipped++; continue; }

  const ref = match[1];
  const quoteId = quoteMap[ref];
  if (!quoteId) { console.log(`SKIP (no quoteId): ${filename}`); skipped++; continue; }

  const buffer = fs.readFileSync(filePath);
  const storageKey = `.private/uploads/${filename}`;
  const objectPath = `/objects/uploads/${filename}`;
  const contentType = mimeMap[ext] || "image/jpeg";

  try {
    // Check if already exists in DB
    const existing = await pool.query(
      "SELECT id FROM quote_media WHERE quote_id = $1 AND file_name = $2",
      [quoteId, filename]
    );

    if (existing.rows.length > 0) {
      console.log(`SKIP (already in DB): ${filename}`);
      skipped++;
      continue;
    }

    // Upload to GCS
    const file = bucket.file(storageKey);
    await file.save(buffer, { metadata: { contentType } });

    // Insert into quote_media
    await pool.query(
      `INSERT INTO quote_media (id, quote_id, file_type, file_path, file_name, file_size, created_at)
       VALUES (gen_random_uuid(), $1, 'image', $2, $3, $4, NOW())
       ON CONFLICT DO NOTHING`,
      [quoteId, objectPath, filename, buffer.length]
    );

    console.log(`✅ ${filename} → ${objectPath} (${buffer.length} bytes)`);
    uploaded++;
  } catch (err) {
    console.log(`❌ ${filename}: ${err.message}`);
    errors++;
  }
}

await pool.end();
console.log(`\n=== Résultat: ${uploaded} uploadés, ${skipped} ignorés, ${errors} erreurs ===`);
