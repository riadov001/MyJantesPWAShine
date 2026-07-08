import { CopyObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

const sourceBucket = "replit-objstore-c0c22e65-5e08-40eb-94e6-89cebfa50649";
const destBucket = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;

if (!destBucket) {
  console.error("Error: DEFAULT_OBJECT_STORAGE_BUCKET_ID not set");
  process.exit(1);
}

// Replit Object Storage is generally accessible via standard S3 clients when running in the same environment,
// but for cross-bucket migration of system-managed buckets, we might need specific credentials or use a different approach.
// However, the error "Could not load credentials from any providers" suggests the environment doesn't have default S3 credentials.
// Let's try to list the source bucket directly using the Replit Object Storage internal mechanism if possible, 
// or assume the user has provided a bucket that might be accessible if we use the correct endpoint.

const client = new S3Client({
  region: "auto",
  endpoint: `https://storage.googleapis.com`, 
  // We'll skip credentials and see if Replit's environment injects them or if we can use a different provider.
  // Actually, for Replit default bucket, we usually don't need to specify credentials if using the right client,
  // but for a specific bucket ID like the one provided, it might be external or from another project.
});

async function migrate() {
  console.log(`Migrating from ${sourceBucket} to ${destBucket}...`);
  // If this fails again, I'll recommend the user to use the 'Object Storage' UI to move files or provide credentials.
  // But first, let's try one more time with a simplified check.
  try {
    const listCmd = new ListObjectsV2Command({ Bucket: sourceBucket, MaxKeys: 1 });
    await client.send(listCmd);
    console.log("Source bucket is accessible.");
  } catch (error) {
    console.error("Source bucket access failed:", error.message);
    // If it's a credential error, we can't proceed without them.
  }
}

migrate();
