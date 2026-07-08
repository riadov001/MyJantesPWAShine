import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import {
  Camera,
  Upload,
  RotateCcw,
  Download,
  Share2,
  Loader2,
  Plus,
  Minus,
  Move,
  ZoomIn,
  Sparkles,
  ChevronLeft,
  Eye,
  Paintbrush,
} from "lucide-react";
import { Link } from "wouter";
import {
  DEFAULT_WHEEL_PARAMS,
  SPOKE_PRESETS,
  type WheelParams,
  type WheelMaterialParams,
} from "@/lib/wheel-generator";
import ARWheelCanvas from "@/components/ar-wheel-canvas";
import ARWheelRenderer from "@/components/ar-wheel-renderer";

export interface WheelOverlay {
  id: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  imageDataUrl: string | null;
}

const COLOR_PRESETS = [
  { name: "Argent", hex: "#c0c0c0" },
  { name: "Noir Mat", hex: "#2a2a2a" },
  { name: "Noir Brillant", hex: "#1a1a1a" },
  { name: "Blanc", hex: "#f0f0f0" },
  { name: "Gunmetal", hex: "#4a4a50" },
  { name: "Bronze", hex: "#a87830" },
  { name: "Or", hex: "#d4a843" },
  { name: "Rouge", hex: "#b01020" },
  { name: "Bleu", hex: "#2040a0" },
  { name: "Anthracite", hex: "#383840" },
];

type Step = "capture" | "customize" | "preview";

export default function ARWheelTryOn() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<any>(null);

  const [step, setStep] = useState<Step>("capture");
  const [carPhoto, setCarPhoto] = useState<string | null>(null);
  const [carPhotoSize, setCarPhotoSize] = useState({ width: 0, height: 0 });
  const [overlays, setOverlays] = useState<WheelOverlay[]>([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [wheelImageReady, setWheelImageReady] = useState(false);

  const [wheelParams, setWheelParams] = useState<WheelParams>(DEFAULT_WHEEL_PARAMS);
  const [color, setColor] = useState("#c0c0c0");
  const [metalness, setMetalness] = useState(0.8);
  const [roughness, setRoughness] = useState(0.2);
  const [clearcoat, setClearcoat] = useState(0.5);
  const [spokePreset, setSpokePreset] = useState(0);
  const [wheelImage, setWheelImage] = useState<string | null>(null);

  const { data: simulatorConfig } = useQuery<any>({
    queryKey: ["/api/mobile/wheel-simulator/config"],
    enabled: !!user?.garageId,
  });

  const dynamicColors = simulatorConfig?.colors || COLOR_PRESETS;

  const materialParams: WheelMaterialParams = {
    color,
    metalness,
    roughness,
    clearcoat,
    clearcoatRoughness: 0.1,
  };

  const handlePhotoCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const img = new window.Image();
      img.onload = () => {
        setCarPhotoSize({ width: img.naturalWidth, height: img.naturalHeight });
        setCarPhoto(dataUrl);
        setStep("customize");
        setOverlays([]);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleWheelImageGenerated = useCallback((dataUrl: string) => {
    setWheelImage(dataUrl);
    setWheelImageReady(true);
    setOverlays((prev) =>
      prev.map((o) => ({ ...o, imageDataUrl: dataUrl }))
    );
  }, []);

  const addOverlay = useCallback(() => {
    if (!wheelImage) {
      toast({ title: "Patientez", description: "Le rendu de la jante est en cours..." });
      return;
    }
    const newOverlay: WheelOverlay = {
      id: `wheel-${Date.now()}`,
      x: 0.25 + Math.random() * 0.3,
      y: 0.6,
      scale: 0.18,
      rotation: 0,
      imageDataUrl: wheelImage,
    };
    setOverlays((prev) => [...prev, newOverlay]);
    setSelectedOverlayId(newOverlay.id);
  }, [wheelImage, toast]);

  const removeSelectedOverlay = useCallback(() => {
    if (!selectedOverlayId) return;
    setOverlays((prev) => prev.filter((o) => o.id !== selectedOverlayId));
    setSelectedOverlayId(null);
  }, [selectedOverlayId]);

  const updateOverlay = useCallback((id: string, updates: Partial<WheelOverlay>) => {
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, ...updates } : o)));
  }, []);

  const detectWheelPositions = useCallback(async () => {
    if (!carPhoto) return;
    setIsDetecting(true);
    try {
      const blob = await fetch(carPhoto).then((r) => r.blob());
      const formData = new FormData();
      formData.append("image", blob, "car.jpg");
      formData.append("mode", "ar_detect");

      const res = await fetch("/api/ar/detect-wheels", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) throw new Error("Détection échouée");
      const data = await res.json();

      if (data.positions && data.positions.length > 0) {
        const newOverlays: WheelOverlay[] = data.positions.map((pos: any, i: number) => ({
          id: `wheel-detect-${Date.now()}-${i}`,
          x: pos.x,
          y: pos.y,
          scale: pos.radius || 0.12,
          rotation: 0,
          imageDataUrl: wheelImage,
        }));
        setOverlays(newOverlays);
        setSelectedOverlayId(newOverlays[0]?.id || null);
        toast({ title: "Jantes détectées", description: `${newOverlays.length} position(s) trouvée(s)` });
      } else {
        toast({ title: "Aucune jante détectée", description: "Placez les jantes manuellement" });
      }
    } catch (err) {
      toast({ title: "Erreur de détection", description: "Placez les jantes manuellement", variant: "destructive" });
    } finally {
      setIsDetecting(false);
    }
  }, [carPhoto, wheelImage, toast]);

  const applySpokePreset = useCallback((index: number) => {
    setSpokePreset(index);
    const preset = SPOKE_PRESETS[index];
    setWheelParams((prev) => ({ ...prev, ...preset.params }));
  }, []);

  const handleExport = useCallback(() => {
    const canvas = canvasRef.current?.getCompositeCanvas();
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `myjantes-ar-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast({ title: "Image téléchargée" });
  }, [toast]);

  const handleShare = useCallback(async () => {
    const canvas = canvasRef.current?.getCompositeCanvas();
    if (!canvas) return;
    try {
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b: Blob) => resolve(b), "image/png")
      );
      if (navigator.share) {
        const file = new File([blob], "myjantes-ar.png", { type: "image/png" });
        await navigator.share({ title: "MyJantes - Essai AR", files: [file] });
      } else {
        handleExport();
      }
    } catch {
      handleExport();
    }
  }, [handleExport]);

  const reset = useCallback(() => {
    setCarPhoto(null);
    setOverlays([]);
    setSelectedOverlayId(null);
    setStep("capture");
  }, []);

  if (step === "capture") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-b from-background to-muted/30">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-2">
              <Eye className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold" data-testid="text-ar-title">Essai Virtuel de Jantes</h1>
            <p className="text-muted-foreground text-sm">
              Photographiez votre véhicule et visualisez vos nouvelles jantes en réalité augmentée
            </p>
          </div>

          <Card>
            <CardContent className="p-6 space-y-4">
              <Button
                className="w-full"
                size="lg"
                onClick={() => cameraInputRef.current?.click()}
                data-testid="button-camera-capture"
              >
                <Camera className="mr-2 h-5 w-5" />
                Prendre une photo
              </Button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoCapture}
              />

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">ou</span>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full"
                size="lg"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-photo-upload"
              >
                <Upload className="mr-2 h-5 w-5" />
                Importer depuis la galerie
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoCapture}
              />
            </CardContent>
          </Card>

          <div className="text-center">
            <Link href="/configurateur">
              <Button variant="ghost" size="sm" data-testid="link-configurator">
                <ChevronLeft className="mr-1 h-4 w-4" />
                Retour au configurateur
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <header className="flex items-center justify-between gap-2 p-2 border-b bg-background/95 backdrop-blur-sm z-30">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={reset} data-testid="button-reset-ar">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-sm font-semibold truncate">Essai Virtuel AR</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={detectWheelPositions}
            disabled={isDetecting || !wheelImageReady}
            data-testid="button-ai-detect"
          >
            {isDetecting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
            Auto
          </Button>
          <Button variant="outline" size="sm" onClick={addOverlay} disabled={!wheelImageReady} data-testid="button-add-wheel">
            <Plus className="mr-1 h-3.5 w-3.5" />
            Jante
          </Button>
          {selectedOverlayId && (
            <Button variant="outline" size="sm" onClick={removeSelectedOverlay} data-testid="button-remove-wheel">
              <Minus className="mr-1 h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-hidden relative">
        <ARWheelCanvas
          ref={canvasRef}
          carPhoto={carPhoto!}
          carPhotoSize={carPhotoSize}
          overlays={overlays}
          selectedOverlayId={selectedOverlayId}
          onSelectOverlay={setSelectedOverlayId}
          onUpdateOverlay={updateOverlay}
        />

        {!wheelImageReady && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20">
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Génération du rendu 3D...
            </Badge>
          </div>
        )}

        {overlays.length === 0 && wheelImageReady && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="text-center p-4 bg-background/80 backdrop-blur-sm rounded-lg">
              <Move className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Appuyez sur <strong>+ Jante</strong> ou <strong>Auto</strong> pour placer les jantes
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="border-t bg-background z-20">
        <div className="p-2 space-y-2 max-h-[35vh] overflow-y-auto">
          <div>
            <Label className="text-xs mb-1 block font-medium">Style de jante</Label>
            <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
              {SPOKE_PRESETS.slice(0, 8).map((preset, i) => (
                <Button
                  key={preset.label}
                  variant="outline"
                  size="sm"
                  className={`text-[10px] whitespace-nowrap shrink-0 ${spokePreset === i ? "ring-2 ring-primary" : ""}`}
                  onClick={() => applySpokePreset(i)}
                  data-testid={`spoke-preset-${i}`}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs mb-1 block font-medium">Couleur</Label>
            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {dynamicColors.map((c: any) => (
                <button
                  key={c.hex}
                  onClick={() => setColor(c.hex)}
                  className={`shrink-0 w-7 h-7 rounded-full border-2 transition-all ${
                    color === c.hex ? "border-primary scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c.hex }}
                  title={c.name}
                  data-testid={`ar-color-${c.name}`}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="shrink-0 w-7 h-7 rounded-full cursor-pointer border"
                data-testid="ar-color-custom"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground">Métallique</Label>
              <Slider value={[metalness]} min={0} max={1} step={0.05} onValueChange={([v]) => setMetalness(v)} />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Rugosité</Label>
              <Slider value={[roughness]} min={0} max={1} step={0.05} onValueChange={([v]) => setRoughness(v)} />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Vernis</Label>
              <Slider value={[clearcoat]} min={0} max={1} step={0.05} onValueChange={([v]) => setClearcoat(v)} />
            </div>
          </div>

          {selectedOverlayId && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Taille de la jante</Label>
                <Slider
                  value={[overlays.find((o) => o.id === selectedOverlayId)?.scale || 0.15]}
                  min={0.05}
                  max={0.4}
                  step={0.005}
                  onValueChange={([v]) => updateOverlay(selectedOverlayId, { scale: v })}
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Rotation</Label>
                <Slider
                  value={[overlays.find((o) => o.id === selectedOverlayId)?.rotation || 0]}
                  min={-180}
                  max={180}
                  step={1}
                  onValueChange={([v]) => updateOverlay(selectedOverlayId, { rotation: v })}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 p-2 border-t">
          <Button className="flex-1" onClick={handleExport} data-testid="button-export-ar">
            <Download className="mr-2 h-4 w-4" />
            Télécharger
          </Button>
          <Button variant="outline" className="flex-1" onClick={handleShare} data-testid="button-share-ar">
            <Share2 className="mr-2 h-4 w-4" />
            Partager
          </Button>
        </div>
      </div>

      <div className="hidden">
        <ARWheelRenderer
          wheelParams={wheelParams}
          materialParams={materialParams}
          onImageGenerated={handleWheelImageGenerated}
        />
      </div>
    </div>
  );
}
