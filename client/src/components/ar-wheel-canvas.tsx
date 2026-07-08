import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle, useState } from "react";
import type { WheelOverlay } from "@/pages/ar-wheel-tryon";

interface ARWheelCanvasProps {
  carPhoto: string;
  carPhotoSize: { width: number; height: number };
  overlays: WheelOverlay[];
  selectedOverlayId: string | null;
  onSelectOverlay: (id: string | null) => void;
  onUpdateOverlay: (id: string, updates: Partial<WheelOverlay>) => void;
}

export interface ARWheelCanvasHandle {
  getCompositeCanvas: () => HTMLCanvasElement | null;
}

const ARWheelCanvas = forwardRef<ARWheelCanvasHandle, ARWheelCanvasProps>(
  ({ carPhoto, carPhotoSize, overlays, selectedOverlayId, onSelectOverlay, onUpdateOverlay }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const carImageRef = useRef<HTMLImageElement | null>(null);
    const wheelImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
    const [canvasSize, setCanvasSize] = useState({ width: 300, height: 200 });
    const isDragging = useRef(false);
    const dragOverlayId = useRef<string | null>(null);
    const dragStart = useRef({ x: 0, y: 0 });
    const initialTouchDist = useRef(0);
    const initialScale = useRef(0);
    const rafRef = useRef(0);

    useEffect(() => {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        carImageRef.current = img;
        drawCanvas();
      };
      img.src = carPhoto;
    }, [carPhoto]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const updateSize = () => {
        const rect = container.getBoundingClientRect();
        const aspect = carPhotoSize.width / carPhotoSize.height || 16 / 9;
        let w = rect.width;
        let h = w / aspect;
        if (h > rect.height) {
          h = rect.height;
          w = h * aspect;
        }
        setCanvasSize({ width: Math.round(w), height: Math.round(h) });
      };

      updateSize();
      const ro = new ResizeObserver(updateSize);
      ro.observe(container);
      return () => ro.disconnect();
    }, [carPhotoSize]);

    const drawCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const carImg = carImageRef.current;
      if (!canvas || !ctx || !carImg) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(carImg, 0, 0, canvas.width, canvas.height);

      for (const overlay of overlays) {
        if (!overlay.imageDataUrl) continue;

        let wheelImg = wheelImagesRef.current.get(overlay.imageDataUrl);
        if (!wheelImg) {
          wheelImg = new window.Image();
          wheelImg.src = overlay.imageDataUrl;
          wheelImagesRef.current.set(overlay.imageDataUrl, wheelImg);
          wheelImg.onload = () => drawCanvas();
          continue;
        }
        if (!wheelImg.complete) continue;

        const cx = overlay.x * canvas.width;
        const cy = overlay.y * canvas.height;
        const wheelSize = overlay.scale * canvas.width;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((overlay.rotation * Math.PI) / 180);

        ctx.shadowColor = "rgba(0,0,0,0.4)";
        ctx.shadowBlur = wheelSize * 0.08;
        ctx.shadowOffsetY = wheelSize * 0.03;

        ctx.drawImage(wheelImg, -wheelSize / 2, -wheelSize / 2, wheelSize, wheelSize);

        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;

        if (overlay.id === selectedOverlayId) {
          ctx.strokeStyle = "rgba(239, 68, 68, 0.8)";
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(-wheelSize / 2 - 4, -wheelSize / 2 - 4, wheelSize + 8, wheelSize + 8);
          ctx.setLineDash([]);

          const handleSize = 8;
          ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
          const corners = [
            [-wheelSize / 2 - 4, -wheelSize / 2 - 4],
            [wheelSize / 2 + 4, -wheelSize / 2 - 4],
            [-wheelSize / 2 - 4, wheelSize / 2 + 4],
            [wheelSize / 2 + 4, wheelSize / 2 + 4],
          ];
          for (const [hx, hy] of corners) {
            ctx.beginPath();
            ctx.arc(hx, hy, handleSize / 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        ctx.restore();
      }
    }, [overlays, selectedOverlayId]);

    useEffect(() => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(drawCanvas);
    }, [drawCanvas, canvasSize]);

    const getCanvasPos = useCallback((clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / rect.width,
        y: (clientY - rect.top) / rect.height,
      };
    }, []);

    const findOverlayAt = useCallback(
      (pos: { x: number; y: number }) => {
        const aspect = canvasSize.width / canvasSize.height;
        for (let i = overlays.length - 1; i >= 0; i--) {
          const o = overlays[i];
          const dx = pos.x - o.x;
          const dy = (pos.y - o.y) * aspect;
          const radius = o.scale / 2;
          if (Math.sqrt(dx * dx + dy * dy) < radius * 1.2) {
            return o.id;
          }
        }
        return null;
      },
      [overlays, canvasSize]
    );

    const handlePointerDown = useCallback(
      (e: React.PointerEvent) => {
        const pos = getCanvasPos(e.clientX, e.clientY);
        const overlayId = findOverlayAt(pos);

        if (overlayId) {
          isDragging.current = true;
          dragOverlayId.current = overlayId;
          dragStart.current = pos;
          onSelectOverlay(overlayId);
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        } else {
          onSelectOverlay(null);
        }
      },
      [getCanvasPos, findOverlayAt, onSelectOverlay]
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent) => {
        if (!isDragging.current || !dragOverlayId.current) return;
        const pos = getCanvasPos(e.clientX, e.clientY);
        const overlay = overlays.find((o) => o.id === dragOverlayId.current);
        if (!overlay) return;

        const dx = pos.x - dragStart.current.x;
        const dy = pos.y - dragStart.current.y;
        dragStart.current = pos;

        onUpdateOverlay(dragOverlayId.current, {
          x: Math.max(0, Math.min(1, overlay.x + dx)),
          y: Math.max(0, Math.min(1, overlay.y + dy)),
        });
      },
      [getCanvasPos, overlays, onUpdateOverlay]
    );

    const handlePointerUp = useCallback(() => {
      isDragging.current = false;
      dragOverlayId.current = null;
    }, []);

    const initialTouchAngle = useRef(0);
    const initialRotation = useRef(0);

    const handleTouchStart = useCallback(
      (e: React.TouchEvent) => {
        if (e.touches.length === 2 && selectedOverlayId) {
          e.preventDefault();
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          initialTouchDist.current = Math.sqrt(dx * dx + dy * dy);
          initialTouchAngle.current = Math.atan2(dy, dx);
          const overlay = overlays.find((o) => o.id === selectedOverlayId);
          initialScale.current = overlay?.scale || 0.15;
          initialRotation.current = overlay?.rotation || 0;
        }
      },
      [selectedOverlayId, overlays]
    );

    const handleTouchMove = useCallback(
      (e: React.TouchEvent) => {
        if (e.touches.length === 2 && selectedOverlayId && initialTouchDist.current > 0) {
          e.preventDefault();
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx);
          const scaleFactor = dist / initialTouchDist.current;
          const newScale = Math.max(0.05, Math.min(0.5, initialScale.current * scaleFactor));
          const angleDelta = ((angle - initialTouchAngle.current) * 180) / Math.PI;
          const newRotation = initialRotation.current + angleDelta;
          onUpdateOverlay(selectedOverlayId, { scale: newScale, rotation: newRotation });
        }
      },
      [selectedOverlayId, onUpdateOverlay]
    );

    useImperativeHandle(ref, () => ({
      getCompositeCanvas: () => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        const exportCanvas = document.createElement("canvas");
        exportCanvas.width = carPhotoSize.width || canvas.width;
        exportCanvas.height = carPhotoSize.height || canvas.height;
        const ctx = exportCanvas.getContext("2d")!;

        if (carImageRef.current) {
          ctx.drawImage(carImageRef.current, 0, 0, exportCanvas.width, exportCanvas.height);
        }

        for (const overlay of overlays) {
          if (!overlay.imageDataUrl) continue;
          const wheelImg = wheelImagesRef.current.get(overlay.imageDataUrl);
          if (!wheelImg?.complete) continue;

          const cx = overlay.x * exportCanvas.width;
          const cy = overlay.y * exportCanvas.height;
          const wheelSize = overlay.scale * exportCanvas.width;

          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate((overlay.rotation * Math.PI) / 180);
          ctx.shadowColor = "rgba(0,0,0,0.4)";
          ctx.shadowBlur = wheelSize * 0.08;
          ctx.shadowOffsetY = wheelSize * 0.03;
          ctx.drawImage(wheelImg, -wheelSize / 2, -wheelSize / 2, wheelSize, wheelSize);
          ctx.restore();
        }

        return exportCanvas;
      },
    }));

    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-black/5">
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="touch-none max-w-full max-h-full"
          style={{ width: canvasSize.width, height: canvasSize.height }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          data-testid="canvas-ar-overlay"
        />
      </div>
    );
  }
);

ARWheelCanvas.displayName = "ARWheelCanvas";
export default ARWheelCanvas;
