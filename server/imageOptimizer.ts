import sharp from "sharp";

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 82;
const PNG_QUALITY = 85;
const WEBP_QUALITY = 82;

export async function optimizeImageBuffer(buffer: Buffer, mimetype: string): Promise<Buffer> {
  if (!mimetype.startsWith('image/') || mimetype === 'image/gif') {
    return buffer;
  }

  try {
    const metadata = await sharp(buffer).metadata();
    const needsResize = (metadata.width && metadata.width > MAX_DIMENSION) || (metadata.height && metadata.height > MAX_DIMENSION);

    let pipeline = sharp(buffer).rotate();
    if (needsResize) {
      pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true });
    }

    let result: Buffer;
    if (mimetype === 'image/png') {
      result = await pipeline.png({ quality: PNG_QUALITY, compressionLevel: 8 }).toBuffer();
    } else if (mimetype === 'image/webp') {
      result = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
    } else {
      result = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
    }

    const originalSize = buffer.length;
    const newSize = result.length;
    if (newSize < originalSize) {
      console.log(`[ImageOptimizer] ${(originalSize / 1024).toFixed(0)}KB -> ${(newSize / 1024).toFixed(0)}KB (${((1 - newSize / originalSize) * 100).toFixed(0)}% saved)`);
      return result;
    }
    return buffer;
  } catch (error) {
    console.warn("[ImageOptimizer] Optimization skipped:", error);
    return buffer;
  }
}
