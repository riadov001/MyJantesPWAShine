import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import FormData from "form-data";

const UPLOADS_DIR = "./uploads";
const API_URL = process.env.REPLIT_DEV_DOMAIN 
  ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
  : "http://localhost:5000";

// Simple cookie-based auth session
async function loginAsAdmin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ 
      email: "admin@myjantes.com", 
      password: "admin123"
    });
    
    const url = new URL(`${API_URL}/api/auth/login`);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    };
    
    const protocol = url.protocol === 'https:' ? https : http;
    const req = protocol.request(options, (res) => {
      const cookies = res.headers['set-cookie'] || [];
      const sessionCookie = cookies.find(c => c.startsWith('connect.sid'));
      if (sessionCookie) {
        resolve(sessionCookie.split(';')[0]);
      } else {
        reject(new Error("No session cookie received"));
      }
    });
    
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function uploadFile(filename: string, cookie: string): Promise<boolean> {
  const filepath = path.join(UPLOADS_DIR, filename);
  const fileBuffer = fs.readFileSync(filepath);
  
  // Determine content type
  const ext = path.extname(filename).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.mp4': 'video/mp4'
  };
  const contentType = contentTypes[ext] || 'application/octet-stream';
  
  return new Promise((resolve) => {
    const boundary = '----FormBoundary' + Math.random().toString(36).substr(2);
    
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`),
      Buffer.from(`Content-Type: ${contentType}\r\n\r\n`),
      fileBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    
    const url = new URL(`${API_URL}/api/upload`);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
        "Cookie": cookie
      }
    };
    
    const protocol = url.protocol === 'https:' ? https : http;
    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve(res.statusCode === 200);
      });
    });
    
    req.on("error", () => resolve(false));
    req.write(body);
    req.end();
  });
}

async function migrate() {
  console.log("=== Migration via API ===\n");
  console.log(`API URL: ${API_URL}\n`);
  
  try {
    console.log("Connexion admin...");
    const cookie = await loginAsAdmin();
    console.log("Connecté!\n");
    
    const files = fs.readdirSync(UPLOADS_DIR).filter(f => !f.startsWith('.'));
    console.log(`Fichiers à migrer: ${files.length}\n`);
    
    let success = 0, failed = 0;
    
    for (const file of files) {
      const result = await uploadFile(file, cookie);
      if (result) {
        console.log(`✅ ${file}`);
        success++;
      } else {
        console.log(`❌ ${file}`);
        failed++;
      }
    }
    
    console.log(`\n=== Résumé ===`);
    console.log(`✅ ${success} | ❌ ${failed}`);
  } catch (err: any) {
    console.error("Erreur:", err.message);
  }
}

migrate();
