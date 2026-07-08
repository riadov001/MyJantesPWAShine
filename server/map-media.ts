
import { db } from "./db";
import { quoteMedia, invoiceMedia, quotes, invoices } from "../shared/schema";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { ObjectStorageService } from "./objectStorage";

const storage = new ObjectStorageService();

async function mapMedia() {
  console.log("Mapping media files to records...");
  const assetsPath = path.join(process.cwd(), "attached_assets");
  const files = fs.readdirSync(assetsPath);

  // 1. Get all quotes and invoices
  const allQuotes = await db.select().from(quotes);
  const allInvoices = await db.select().from(invoices);

  for (const file of files) {
    const filePath = path.join(assetsPath, file);
    const stats = fs.statSync(filePath);
    
    // Skip if directory or not an image/video/pdf
    if (stats.isDirectory()) continue;
    
    const ext = path.extname(file).toLowerCase();
    const isImage = [".jpg", ".jpeg", ".png", ".webp"].includes(ext);
    const isVideo = [".mp4", ".mov", ".webm"].includes(ext);
    const isPdf = [".pdf"].includes(ext);

    if (!isImage && !isVideo && !isPdf) continue;

    // Logic: Look for quote or invoice references in filename
    // Example: devis-DEV-02-00025_1770393695348.pdf
    // Example: Facture-CB-000034_1770070207382.pdf
    
    // Find Quote match
    const quoteMatch = allQuotes.find(q => file.includes(q.reference));
    if (quoteMatch && (isImage || isVideo)) {
      const [existing] = await db.select().from(quoteMedia).where(eq(quoteMedia.fileName, file));
      if (!existing) {
        console.log(`Mapping ${file} to Quote ${quoteMatch.reference}`);
        let buffer = fs.readFileSync(filePath);
        
        if (isImage) {
          try {
            const { addWatermarkToImage } = await import("./imageWatermark");
            buffer = await addWatermarkToImage(buffer, quoteMatch.reference, "image/jpeg");
          } catch (wmErr) {
            console.error("Watermark failed for imported quote photo:", wmErr);
          }
        }

        const { objectPath } = await storage.uploadFileBuffer(buffer, isImage ? "image/jpeg" : "video/mp4");
        await db.insert(quoteMedia).values({
          quoteId: quoteMatch.id,
          fileName: file,
          filePath: objectPath,
          fileType: isImage ? "image" : "video",
          fileSize: buffer.length
        });
      }
    }

    // Find Invoice match
    const invoiceMatch = allInvoices.find(i => file.includes(i.invoiceNumber));
    if (invoiceMatch && (isImage || isVideo)) {
      const [existing] = await db.select().from(invoiceMedia).where(eq(invoiceMedia.fileName, file));
      if (!existing) {
        console.log(`Mapping ${file} to Invoice ${invoiceMatch.invoiceNumber}`);
        let buffer = fs.readFileSync(filePath);

        if (isImage) {
          try {
            const { addWatermarkToImage } = await import("./imageWatermark");
            buffer = await addWatermarkToImage(buffer, invoiceMatch.invoiceNumber, "image/jpeg");
          } catch (wmErr) {
            console.error("Watermark failed for imported invoice photo:", wmErr);
          }
        }

        const { objectPath } = await storage.uploadFileBuffer(buffer, isImage ? "image/jpeg" : "video/mp4");
        await db.insert(invoiceMedia).values({
          invoiceId: invoiceMatch.id,
          fileName: file,
          filePath: objectPath,
          fileType: isImage ? "image" : "video",
          fileSize: buffer.length
        });
      }
    }
    
    // Special case for random images that might be related but don't have refs? 
    // Usually they have timestamps. We only map if we're sure.
  }

  console.log("Media mapping finished.");
  process.exit(0);
}

mapMedia().catch(err => {
  console.error(err);
  process.exit(1);
});
