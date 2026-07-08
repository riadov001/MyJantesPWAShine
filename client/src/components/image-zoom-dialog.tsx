import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, X, RotateCw, Maximize } from "lucide-react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

interface ImageZoomDialogProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  imageAlt?: string;
}

export function ImageZoomDialog({ isOpen, onClose, imageSrc, imageAlt = "Image" }: ImageZoomDialogProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setScale(1);
      setRotation(0);
    }
  }, [isOpen]);

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale(prev => Math.min(prev + 0.25, 4));
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale(prev => Math.max(prev - 0.25, 0.25));
  };

  const handleRotate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRotation(prev => (prev + 90) % 360);
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale(1);
    setRotation(0);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[100vw] max-h-[100vh] w-screen h-screen p-0 bg-black/95 border-none rounded-none overflow-hidden">
        <VisuallyHidden>
          <DialogTitle>Visualiseur d'image</DialogTitle>
          <DialogDescription>Agrandissement de la photo avec options de zoom et rotation</DialogDescription>
        </VisuallyHidden>
        
        <div className="relative w-full h-full flex flex-col">
          {/* Toolbar */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 p-2 bg-black/60 backdrop-blur-md rounded-full border border-white/10 shadow-2xl">
            <Button
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/20 h-10 w-10 rounded-full"
              onClick={handleZoomOut}
              disabled={scale <= 0.25}
              title="Dézoomer"
            >
              <ZoomOut className="h-5 w-5" />
            </Button>
            
            <span className="text-white font-medium min-w-[3rem] text-center text-sm">
              {Math.round(scale * 100)}%
            </span>

            <Button
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/20 h-10 w-10 rounded-full"
              onClick={handleZoomIn}
              disabled={scale >= 4}
              title="Zoomer"
            >
              <ZoomIn className="h-5 w-5" />
            </Button>
            
            <div className="w-px h-6 bg-white/20" />

            <Button
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/20 h-10 w-10 rounded-full"
              onClick={handleRotate}
              title="Pivoter"
            >
              <RotateCw className="h-5 w-5" />
            </Button>

            <Button
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/20 h-10 w-10 rounded-full"
              onClick={handleReset}
              title="Réinitialiser"
            >
              <Maximize className="h-5 w-5" />
            </Button>

            <div className="w-px h-6 bg-white/20" />

            <Button
              size="icon"
              variant="ghost"
              className="text-white hover:bg-red-500/80 h-10 w-10 rounded-full"
              onClick={onClose}
              title="Fermer"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Image Container */}
          <div 
            className="flex-1 flex items-center justify-center overflow-auto bg-transparent p-4 touch-none"
            onClick={onClose}
            style={{ cursor: scale > 1 ? "grab" : "zoom-out" }}
          >
            <div 
              className="transition-transform duration-200 ease-out"
              style={{
                transform: `scale(${scale}) rotate(${rotation}deg)`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={imageSrc}
                alt={imageAlt}
                className="max-w-[90vw] max-h-[85vh] object-contain shadow-2xl select-none"
                draggable={false}
              />
            </div>
          </div>

          {/* Bottom Info */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/40 backdrop-blur-sm text-white/70 px-4 py-1.5 rounded-full text-xs pointer-events-none">
            {imageAlt}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
