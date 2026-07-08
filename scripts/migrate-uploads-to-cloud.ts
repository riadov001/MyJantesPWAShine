import { Client } from "@replit/object-storage";
import { Pool } from "@neondatabase/serverless";
import fs from "fs";
import path from "path";

const UPLOADS_DIR = "./uploads";

async function migrateUploads() {
  console.log("=== Migration des fichiers vers le cloud ===\n");
  
  // Check bucket ID
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    console.error("ERROR: DEFAULT_OBJECT_STORAGE_BUCKET_ID not set");
    process.exit(1);
  }
  
  const client = new Client({ bucketId });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  // Get all local files
  const localFiles = fs.readdirSync(UPLOADS_DIR).filter(f => !f.startsWith('.'));
  console.log(`Fichiers locaux trouvés: ${localFiles.length}\n`);
  
  let success = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const filename of localFiles) {
    const localPath = path.join(UPLOADS_DIR, filename);
    const cloudPath = `.private/uploads/${filename}`;
    
    try {
      // Check if already exists in cloud
      const existsResult = await client.exists(cloudPath);
      if (existsResult.ok && existsResult.value) {
        console.log(`⏭️  ${filename} - déjà dans le cloud`);
        skipped++;
        continue;
      }
      
      // Read local file
      const fileBuffer = fs.readFileSync(localPath);
      
      // Upload to cloud
      const uploadResult = await client.uploadFromBytes(cloudPath, fileBuffer);
      
      if (uploadResult.ok) {
        console.log(`✅ ${filename} - uploadé (${(fileBuffer.length / 1024).toFixed(1)} KB)`);
        
        // Update database paths
        const newPath = `/objects/uploads/${filename}`;
        const oldPath = `/uploads/${filename}`;
        
        await pool.query(
          `UPDATE quote_media SET file_path = $1 WHERE file_path = $2`,
          [newPath, oldPath]
        );
        await pool.query(
          `UPDATE invoice_media SET file_path = $1 WHERE file_path = $2`,
          [newPath, oldPath]
        );
        
        success++;
      } else {
        console.error(`❌ ${filename} - échec upload:`, (uploadResult as any).error);
        failed++;
      }
    } catch (err: any) {
      console.error(`❌ ${filename} - erreur:`, err.message);
      failed++;
    }
  }
  
  console.log(`\n=== Résumé ===`);
  console.log(`✅ Uploadés: ${success}`);
  console.log(`⏭️  Déjà présents: ${skipped}`);
  console.log(`❌ Échecs: ${failed}`);
  console.log(`Total: ${localFiles.length}`);
  
  await pool.end();
}

migrateUploads().catch(console.error);
