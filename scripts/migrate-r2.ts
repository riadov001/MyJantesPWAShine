
import { Storage } from "@google-cloud/storage";
import { randomUUID } from "crypto";
import path from "path";

// SOURCE: The old bucket mentioned by the user
const OLD_BUCKET_ID = "replit-objstore-90174c67-55a1-4a48-86cd-bc7639b945a2";

// DESTINATION: The new project bucket
const NEW_BUCKET_ID = process.env.CLOUDFLARE_R2_BUCKET_OVERRIDE || "myjantes";
const R2_ENDPOINT = process.env.CLOUDFLARE_R2_PUBLIC_ENDPOINT;

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// Client for Replit's native Google Cloud Storage (Source)
const oldClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

// Client for the new Cloudflare R2 bucket (Destination)
const newClient = new Storage({
  apiEndpoint: R2_ENDPOINT,
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

async function migrate() {
  console.log(`Starting migration from ${OLD_BUCKET_ID} to ${NEW_BUCKET_ID}...`);
  const oldBucket = oldClient.bucket(OLD_BUCKET_ID);
  const newBucket = newClient.bucket(NEW_BUCKET_ID);

  try {
    // List all files in the old bucket
    const [files] = await oldBucket.getFiles();
    console.log(`Found ${files.length} files to migrate.`);

    for (const file of files) {
      console.log(`Migrating: ${file.name}`);
      try {
        const [buffer] = await file.download();
        const [metadata] = await file.getMetadata();

        const newFile = newBucket.file(file.name);
        await newFile.save(buffer, {
          metadata: {
            contentType: metadata.contentType || "application/octet-stream",
          },
        });
        console.log(`Success: ${file.name}`);
      } catch (err) {
        console.error(`Failed to migrate ${file.name}:`, err.message);
      }
    }
    console.log("Migration finished.");
  } catch (error) {
    console.error("Critical migration error:", error);
    process.exit(1);
  }
}

migrate();
