import { Client } from "@replit/object-storage";
import * as fs from 'fs';
import * as path from 'path';
import * as archiver from 'archiver';

const SOURCE_BUCKET = 'replit-objstore-8a28deb4-bbe6-4b7f-b889-f0d620677844';

async function main() {
  console.log(`[BucketExport] Bucket: ${SOURCE_BUCKET}`);
  
  const client = new Client({ bucketId: SOURCE_BUCKET });

  // List all objects
  console.log('[BucketExport] Listing objets...');
  const listResult = await client.list();
  
  if (!listResult.ok) {
    console.error('[BucketExport] Erreur listing:', listResult.error);
    return;
  }

  const objects = listResult.value;
  console.log(`[BucketExport] ${objects.length} fichiers trouvés`);
  
  if (objects.length === 0) {
    console.log('[BucketExport] Bucket vide.');
    return;
  }

  objects.forEach(o => console.log(` - ${o.name}`));

  // Download all to /tmp/bucket-media/
  const outDir = '/tmp/bucket-media';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  let downloaded = 0, errors = 0;
  for (const obj of objects) {
    try {
      const dlResult = await client.downloadAsBytes(obj.name);
      if (!dlResult.ok) {
        console.error(`[DL ERROR] ${obj.name}: ${dlResult.error}`);
        errors++;
        continue;
      }
      const fileName = obj.name.replace(/^\.private\//, '').replace(/\//g, '_');
      const outPath = path.join(outDir, fileName);
      fs.writeFileSync(outPath, Buffer.from(dlResult.value[0]));
      downloaded++;
      console.log(`[DL OK] ${obj.name} -> ${fileName} (${dlResult.value[0].length} bytes)`);
    } catch (e: any) {
      console.error(`[DL ERROR] ${obj.name}: ${e.message}`);
      errors++;
    }
  }

  console.log(`\n[BucketExport] Terminé: ${downloaded} téléchargés, ${errors} erreurs`);
  console.log(`[BucketExport] Fichiers dans: ${outDir}`);
  
  // List downloaded files
  const localFiles = fs.readdirSync(outDir);
  console.log(`[BucketExport] Fichiers locaux (${localFiles.length}):`);
  localFiles.forEach(f => {
    const stat = fs.statSync(path.join(outDir, f));
    console.log(`  ${f} (${(stat.size / 1024).toFixed(1)} Ko)`);
  });
}

main().catch(console.error);
