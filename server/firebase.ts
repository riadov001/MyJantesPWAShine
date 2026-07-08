import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

const firebaseConfig = {
  projectId: "myjantesapp-pwa-gcp",
  storageBucket: "myjantesapp-pwa-gcp.firebasestorage.app",
};

let app: ReturnType<typeof initializeApp> | undefined;

export function initializeFirebase() {
  if (getApps().length === 0) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    
    if (serviceAccountKey) {
      try {
        const serviceAccount = JSON.parse(serviceAccountKey);
        app = initializeApp({
          credential: cert(serviceAccount),
          storageBucket: firebaseConfig.storageBucket,
        });
        console.log("[Firebase] Initialized with service account");
      } catch (error) {
        console.error("[Firebase] Error parsing service account key:", error);
        app = initializeApp({
          projectId: firebaseConfig.projectId,
          storageBucket: firebaseConfig.storageBucket,
        });
        console.log("[Firebase] Initialized without credentials (limited access)");
      }
    } else {
      app = initializeApp({
        projectId: firebaseConfig.projectId,
        storageBucket: firebaseConfig.storageBucket,
      });
      console.log("[Firebase] Initialized without service account (set FIREBASE_SERVICE_ACCOUNT_KEY for full access)");
    }
  }
  return app;
}

export function getFirebaseStorage() {
  if (!app) {
    initializeFirebase();
  }
  return getStorage();
}

export async function uploadToFirebaseStorage(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  folder: string = "uploads"
): Promise<string> {
  const storage = getFirebaseStorage();
  const bucket = storage.bucket();
  
  const filePath = `${folder}/${Date.now()}_${fileName}`;
  const file = bucket.file(filePath);
  
  await file.save(fileBuffer, {
    metadata: {
      contentType: mimeType,
    },
  });
  
  await file.makePublic();
  
  const publicUrl = `https://storage.googleapis.com/${firebaseConfig.storageBucket}/${filePath}`;
  return publicUrl;
}

export async function deleteFromFirebaseStorage(fileUrl: string): Promise<void> {
  try {
    const storage = getFirebaseStorage();
    const bucket = storage.bucket();
    
    const urlPrefix = `https://storage.googleapis.com/${firebaseConfig.storageBucket}/`;
    if (fileUrl.startsWith(urlPrefix)) {
      const filePath = fileUrl.replace(urlPrefix, "");
      const file = bucket.file(filePath);
      await file.delete();
      console.log(`[Firebase] Deleted file: ${filePath}`);
    }
  } catch (error) {
    console.error("[Firebase] Error deleting file:", error);
  }
}

export { firebaseConfig };
