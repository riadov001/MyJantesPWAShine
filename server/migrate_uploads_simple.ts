
import fs from "fs";
import path from "path";
import { ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";

async function migrate() {
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    console.log("No uploads directory found.");
    return;
  }

  const files = fs.readdirSync(uploadsDir);
  console.log(`Found ${files.length} files to migrate.`);

  const objStore = new ObjectStorageService();
  const privateDir = objStore.getPrivateObjectDir();
  const { objectStorageClient } = await import("./replit_integrations/object_storage/objectStorage");
  
  const bucketName = privateDir.split('/')[1];
  const bucket = objectStorageClient.bucket(bucketName);

  for (const file of files) {
    const filePath = path.join(uploadsDir, file);
    if (fs.statSync(filePath).isDirectory()) continue;
    if (file.endsWith('.pdf')) continue;

    const fileData = fs.readFileSync(filePath);
    const contentType = file.endsWith(".jpeg") || file.endsWith(".jpg") ? "image/jpeg" : 
                        file.endsWith(".png") ? "image/png" : "application/octet-stream";

    try {
      console.log(`Migrating ${file}...`);
      const destName = `uploads/${file}`;
      const blob = bucket.file(destName);
      
      // Directly using the bucket client to avoid sidecar auth issues in script
      await blob.save(fileData, {
        metadata: { contentType },
        resumable: false
      });
      console.log(`Successfully migrated ${file}`);
    } catch (error) {
      console.error(`Failed to migrate ${file}:`, error.message);
    }
  }

  console.log("Migration complete.");
}

migrate().catch(console.error);
