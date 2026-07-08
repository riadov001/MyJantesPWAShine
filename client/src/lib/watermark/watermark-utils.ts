
export async function applyWatermark(file: File, text: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error("Canvas context not available"));
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // Watermark style
        const fontSize = Math.max(20, img.width / 40);
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';

        const padding = 20;
        const watermarkText = `MyJantes - ${text}`;
        
        // Shadow for readability
        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        ctx.fillText(watermarkText, canvas.width - padding, canvas.height - padding);

        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Blob conversion failed"));
        }, 'image/jpeg', 0.8);
      };
      img.onerror = () => reject(new Error("Image loading failed"));
      img.src = event.target?.result as string;
    };
    reader.onerror = () => reject(new Error("File reading failed"));
    reader.readAsDataURL(file);
  });
}
