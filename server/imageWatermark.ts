import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";

const LOGO_PATH = path.join(process.cwd(), "attached_assets", "logo-myjantes-n2iUZrkN_1759796960103.png");

export async function addWatermarkToImage(
  imageBuffer: Buffer,
  reference: string,
  mimeType: string
): Promise<Buffer> {
  try {
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    
    if (!metadata.width || !metadata.height) {
      console.log("[Watermark] Could not get image dimensions, returning original");
      return imageBuffer;
    }

    const width = metadata.width;
    const height = metadata.height;

    const compositeOperations: sharp.OverlayOptions[] = [];

    if (fs.existsSync(LOGO_PATH)) {
      const logoSize = Math.max(120, Math.min(width, height) * 0.3);
      const logoBuffer = await sharp(LOGO_PATH)
        .resize(Math.round(logoSize), Math.round(logoSize), { fit: "inside" })
        .ensureAlpha()
        .toBuffer();

      const logoMeta = await sharp(logoBuffer).metadata();
      const logoW = logoMeta.width || Math.round(logoSize);
      const logoH = logoMeta.height || Math.round(logoSize);

      const padding = 25;
      compositeOperations.push({
        input: logoBuffer,
        left: width - logoW - padding,
        top: height - logoH - padding,
        blend: "over"
      });
    }

    const fontSize = Math.max(20, Math.round(width * 0.06));
    const textPadding = 20;
    const textSvg = `
      <svg width="${width}" height="${fontSize + textPadding * 2}">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="3" dy="3" stdDeviation="3" flood-color="black" flood-opacity="0.9"/>
          </filter>
        </defs>
        <rect x="0" y="0" width="${width}" height="${fontSize + textPadding * 2}" fill="rgba(0,0,0,0.3)"/>
        <text 
          x="${width - 25}" 
          y="${fontSize + textPadding - 5}" 
          font-family="Arial, sans-serif" 
          font-size="${fontSize}" 
          font-weight="bold"
          fill="white" 
          text-anchor="end"
          filter="url(#shadow)"
        >${reference}</text>
      </svg>
    `;

    compositeOperations.push({
      input: Buffer.from(textSvg),
      gravity: "south",
      blend: "over"
    });

    let result = image.composite(compositeOperations);

    if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
      result = result.jpeg({ quality: 90 });
    } else if (mimeType === "image/png") {
      result = result.png();
    } else if (mimeType === "image/webp") {
      result = result.webp({ quality: 90 });
    }

    const outputBuffer = await result.toBuffer();
    console.log(`[Watermark] Added logo watermark (40% opacity, bottom-right) for: ${reference}`);
    return outputBuffer;

  } catch (error) {
    console.error("[Watermark] Error processing image:", error);
    return imageBuffer;
  }
}
