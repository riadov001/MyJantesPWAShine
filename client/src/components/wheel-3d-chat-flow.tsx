import { useState, useRef, useCallback, useEffect, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import {
  Upload, Camera, ChevronRight, ChevronLeft, RotateCcw, Download,
  Palette, Wrench, Eye, FileText, Loader2, X, Sparkles, Check,
  Image as ImageIcon, Box, Settings, Layers, Scan
} from "lucide-react";
import { SPOKE_PRESETS, DEFAULT_WHEEL_PARAMS, type WheelParams, type SpokePattern } from "@/lib/wheel-generator";
import type { Wheel3DViewerHandle } from "@/components/wheel-3d-viewer";

const Wheel3DViewer = lazy(() => import("@/components/wheel-3d-viewer"));

type WheelStep = "upload" | "generate" | "customize" | "devis";

const PHOTO_ANGLES = [
  { id: "front", label: "Face avant", desc: "Vue de face, centrée" },
  { id: "quarter", label: "3/4 avant", desc: "Angle 45°, montre la profondeur" },
  { id: "side", label: "Profil", desc: "Vue latérale de la jante" },
  { id: "detail", label: "Détail", desc: "Zoom sur les branches/finition" },
  { id: "back", label: "Arrière", desc: "Vue arrière (optionnel)" },
];

const FINISH_PRESETS = [
  { id: "mat", label: "Mat", metalness: 0.3, roughness: 0.8, clearcoat: 0.0, clearcoatRoughness: 0.8 },
  { id: "brillant", label: "Brillant", metalness: 0.6, roughness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.05 },
  { id: "chrome", label: "Chrome", metalness: 1.0, roughness: 0.05, clearcoat: 1.0, clearcoatRoughness: 0.02 },
  { id: "carbone", label: "Carbone", metalness: 0.2, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.3 },
  { id: "forge", label: "Forgé", metalness: 0.7, roughness: 0.35, clearcoat: 0.4, clearcoatRoughness: 0.2 },
  { id: "satine", label: "Satiné", metalness: 0.5, roughness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.4 },
];

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

const MAX_PHOTOS = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function compressPhoto(file: File, maxWidth = 1200, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Erreur image"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Erreur lecture"));
    reader.readAsDataURL(file);
  });
}

interface UploadedPhoto {
  dataUrl: string;
  angleId: string;
  name: string;
}

export interface Wheel3DChatFlowProps {
  onClose: () => void;
  onBack: () => void;
}

export function Wheel3DChatFlow({ onClose, onBack }: Wheel3DChatFlowProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, isAdmin } = useAuth() as any;

  const { data: activeServicesData } = useQuery<any[]>({
    queryKey: ["/api/services"],
  });
  const activeServices = (activeServicesData || []).filter((s: any) => s.isActive !== false);
  const viewerRef = useRef<Wheel3DViewerHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<WheelStep>("upload");
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRendering, setIsRendering] = useState(false);

  const [spokePreset, setSpokePreset] = useState(0);
  const [wheelParams, setWheelParams] = useState<WheelParams>(DEFAULT_WHEEL_PARAMS);
  const [color, setColor] = useState("#c0c0c0");
  const [finishPreset, setFinishPreset] = useState(FINISH_PRESETS[0]);
  const [metalness, setMetalness] = useState(0.8);
  const [roughness, setRoughness] = useState(0.2);
  const [clearcoat, setClearcoat] = useState(0.5);
  const [clearcoatRoughness, setClearcoatRoughness] = useState(0.1);
  const [lisereEnabled, setLisereEnabled] = useState(false);
  const [lisereColor, setLisereColor] = useState("#ff0000");
  const [lisereThickness, setLisereThickness] = useState(3);
  const [gravureText, setGravureText] = useState("");

  const [photoTextureEnabled, setPhotoTextureEnabled] = useState(false);
  const [photoTextureOpacity, setPhotoTextureOpacity] = useState(0.85);

  const [customizeTab, setCustomizeTab] = useState<"couleur" | "finition" | "geometrie" | "options">("couleur");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [bgPhotoIndex, setBgPhotoIndex] = useState<number>(0);
  const [showBgPhoto, setShowBgPhoto] = useState(true);

  const { data: simulatorConfig } = useQuery<any>({
    queryKey: ["/api/mobile/wheel-simulator/config"],
    enabled: !!user?.garageId,
  });

  useEffect(() => {
    if (simulatorConfig?.colors && simulatorConfig.colors.length > 0) {
      // Use dynamic colors from settings if available
    }
  }, [simulatorConfig]);

  const dynamicColors = simulatorConfig?.colors || COLOR_PRESETS;
  const maxPhotos = simulatorConfig?.maxPhotos || 5;

  const materialParams = {
    color,
    metalness,
    roughness,
    clearcoat,
    clearcoatRoughness,
  };

  const applyFinish = (preset: typeof FINISH_PRESETS[number]) => {
    setFinishPreset(preset);
    setMetalness(preset.metalness);
    setRoughness(preset.roughness);
    setClearcoat(preset.clearcoat);
    setClearcoatRoughness(preset.clearcoatRoughness);
  };

  const applySpokePreset = (index: number) => {
    setSpokePreset(index);
    const preset = SPOKE_PRESETS[index];
    setWheelParams((prev) => ({ ...prev, ...preset.params }));
  };

  const handleFileAdd = useCallback(async (files: FileList | File[]) => {
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      toast({ title: "Maximum atteint", description: `${MAX_PHOTOS} photos maximum`, variant: "destructive" });
      return;
    }
    const toProcess = Array.from(files).slice(0, remaining);
    for (const file of toProcess) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        toast({ title: "Format invalide", description: `${file.name} : JPG, PNG ou WEBP uniquement`, variant: "destructive" });
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast({ title: "Fichier trop volumineux", description: `${file.name} : max 10 MB (sera compressé)` });
      }
      try {
        const dataUrl = await compressPhoto(file);
        const angleId = PHOTO_ANGLES[photos.length + toProcess.indexOf(file)]?.id || "extra";
        setPhotos((prev) => [...prev, { dataUrl, angleId, name: file.name }]);
      } catch {
        toast({ title: "Erreur", description: `Impossible de traiter ${file.name}`, variant: "destructive" });
      }
    }
  }, [photos, toast]);

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (bgPhotoIndex >= next.length && next.length > 0) {
        setBgPhotoIndex(next.length - 1);
      } else if (next.length === 0) {
        setBgPhotoIndex(0);
      }
      return next;
    });
  };

  const [analysisResult, setAnalysisResult] = useState<string>("");

  const handleGenerate3D = async () => {
    setIsGenerating(true);
    setAnalysisResult("");

    if (photos.length > 0) {
      try {
        const frontPhoto = photos.find((p) => p.angleId === "front") || photos[0];
        const base64 = frontPhoto.dataUrl.split(",")[1];
        const mimeMatch = frontPhoto.dataUrl.match(/data:(image\/\w+);/);
        const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";

        const res = await apiRequest("POST", "/api/ai/analyze-wheel-params", {
          imageBase64: base64,
          imageMimeType: mimeType,
        });
        const data = await res.json();

        if (data.params) {
          const p = data.params;
          setWheelParams((prev) => ({
            ...prev,
            spokeCount: p.spokeCount,
            spokeWidth: p.spokeWidth,
            rimDepth: p.rimDepth,
            hubRadius: p.hubRadius,
            lipWidth: p.lipWidth,
            spokePattern: p.spokePattern || "straight",
            dishDepth: p.dishDepth ?? prev.dishDepth,
            spokeCurvature: p.spokeCurvature ?? prev.spokeCurvature,
            spokeSplitRatio: p.spokeSplitRatio ?? prev.spokeSplitRatio,
            lipStepCount: p.lipStepCount ?? prev.lipStepCount,
          }));

          const bestPreset = SPOKE_PRESETS.findIndex(
            (sp) => sp.pattern === p.spokePattern && sp.params.spokeCount === p.spokeCount
          );
          if (bestPreset >= 0) {
            setSpokePreset(bestPreset);
          } else {
            const fallback = SPOKE_PRESETS.findIndex((sp) => sp.pattern === p.spokePattern);
            if (fallback >= 0) setSpokePreset(fallback);
          }

          setColor(p.color);

          const matchFinish = FINISH_PRESETS.find((f) => f.id === p.finish);
          if (matchFinish) applyFinish(matchFinish);

          setPhotoTextureEnabled(true);

          setAnalysisResult(p.description || "Jante analysée avec succès");
          toast({ title: "Analyse terminée", description: `${p.description} — ${p.spokeCount} branches ${p.spokePattern}, finition ${p.finish}` });
        } else {
          toast({ title: "Analyse partielle", description: "Paramètres par défaut appliqués. Ajustez manuellement." });
        }
      } catch {
        toast({ title: "Analyse indisponible", description: "Paramètres par défaut appliqués. Ajustez manuellement.", variant: "destructive" });
      }
    }

    setIsGenerating(false);
    setStep("customize");
  };

  const handleReset = () => {
    setColor("#c0c0c0");
    applyFinish(FINISH_PRESETS[0]);
    setLisereEnabled(false);
    setGravureText("");
    applySpokePreset(0);
    setPhotoTextureEnabled(false);
    setPhotoTextureOpacity(0.85);
  };

  const handleExportPNG = () => {
    const dataUrl = viewerRef.current?.exportPNG(2048);
    if (!dataUrl) {
      toast({ title: "Erreur", description: "Impossible d'exporter l'image", variant: "destructive" });
      return;
    }
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const link = document.createElement("a");
    link.download = `jante-myjantes-${datePart}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "PNG exporté" });
  };

  const handleExportGLB = async () => {
    const blob = await viewerRef.current?.exportGLB();
    if (!blob || blob.size === 0) {
      toast({ title: "Erreur", description: "Impossible d'exporter le modèle 3D", variant: "destructive" });
      return;
    }
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `jante-myjantes-${datePart}.glb`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: "Modèle 3D exporté (.glb)" });
  };

  const handleHDRender = async () => {
    setIsRendering(true);
    try {
      const pngData = viewerRef.current?.exportPNG(2048);
      if (!pngData) throw new Error("Pas d'image");
      const base64 = pngData.split(",")[1];
      const res = await apiRequest("POST", "/api/ai/render-hd", {
        imageBase64: base64,
        params: {
          color,
          finish: finishPreset.label,
          metalness,
          roughness,
          lisereEnabled,
          lisereColor,
          gravureText,
        },
      });
      const data = await res.json();
      if (data.imageBase64) {
        const link = document.createElement("a");
        const now = new Date();
        const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
        link.download = `jante-hd-myjantes-${datePart}.png`;
        link.href = `data:image/png;base64,${data.imageBase64}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast({ title: "Rendu HD exporté" });
      } else {
        toast({ title: "Rendu disponible", description: data.message || "Le rendu a été généré" });
      }
    } catch {
      toast({ title: "Erreur rendu HD", description: "Impossible de générer le rendu. Réessayez.", variant: "destructive" });
    } finally {
      setIsRendering(false);
    }
  };

  const [isCreatingDevis, setIsCreatingDevis] = useState(false);

  const handleCreateDevis = async () => {
    setIsCreatingDevis(true);
    try {
      const renderPng = viewerRef.current?.exportPNG(2048);

      const uploadedMedia: Array<{ key: string; type: string; name: string }> = [];

      const uploadPromises = photos.map(async (p, i) => {
        const b64 = p.dataUrl.split(",")[1];
        const mimeMatch = p.dataUrl.match(/data:(image\/\w+);/);
        const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
        const ext = mime.split("/")[1] || "jpg";
        try {
          const res = await apiRequest("POST", "/api/upload-base64", {
            base64: b64,
            mimeType: mime,
            fileName: `photo-${p.angleId}-${Date.now()}.${ext}`,
          });
          const data = await res.json();
          if (data.objectPath) {
            uploadedMedia.push({
              key: data.objectPath,
              type: mime,
              name: `Photo ${p.angleId} - ${p.name}`,
            });
          }
        } catch (err) {
          console.error(`Upload photo ${i} failed:`, err);
        }
      });

      if (renderPng) {
        uploadPromises.push(
          (async () => {
            try {
              const b64 = renderPng.split(",")[1];
              const res = await apiRequest("POST", "/api/upload-base64", {
                base64: b64,
                mimeType: "image/png",
                fileName: `rendu-3d-${Date.now()}.png`,
              });
              const data = await res.json();
              if (data.objectPath) {
                uploadedMedia.push({
                  key: data.objectPath,
                  type: "image/png",
                  name: "Rendu 3D configurateur",
                });
              }
            } catch (err) {
              console.error("Upload 3D render failed:", err);
            }
          })()
        );
      }

      await Promise.all(uploadPromises);

      if (uploadedMedia.length === 0 && photos.length > 0) {
        toast({ title: "Erreur", description: "Impossible d'envoyer les photos. Veuillez réessayer.", variant: "destructive" });
        return;
      }

      const devisSimu = {
        photos: photos.map((p) => ({ dataUrl: p.dataUrl, angle: p.angleId })),
        uploadedMedia,
        config: {
          color,
          colorName: COLOR_PRESETS.find((c) => c.hex === color)?.name || "Personnalisé",
          finish: finishPreset.label,
          metalness,
          roughness,
          spokePreset: SPOKE_PRESETS[spokePreset].label,
          spokePattern: wheelParams.spokePattern,
          dishDepth: wheelParams.dishDepth,
          lisereEnabled,
          lisereColor,
          gravureText,
        },
        selectedServiceIds: selectedServices,
        selectedServiceNames: selectedServices
          .map((id) => activeServices.find((s: any) => s.id === id)?.name)
          .filter(Boolean),
        timestamp: new Date().toISOString(),
      };
      sessionStorage.setItem("devisSimu", JSON.stringify(devisSimu));
      onClose();
      if (isAdmin) {
        toast({ title: "Configuration sauvegardée", description: "Ouverture du formulaire de devis..." });
        navigate("/admin/quotes?openDialog=true&fromSimulator=true");
      } else {
        toast({
          title: "Configuration sauvegardée",
          description: "Votre configuration 3D a été enregistrée. Demandez un devis depuis la page Mes Devis.",
        });
        navigate("/quotes");
      }
    } catch (err) {
      console.error("Error creating devis:", err);
      toast({ title: "Erreur", description: "Impossible de préparer le devis.", variant: "destructive" });
    } finally {
      setIsCreatingDevis(false);
    }
  };

  const toggleService = (id: string) => {
    setSelectedServices((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const steps: { id: WheelStep; label: string; icon: any }[] = [
    { id: "upload", label: "Photos", icon: Camera },
    { id: "generate", label: "3D", icon: Box },
    { id: "customize", label: "Style", icon: Palette },
    { id: "devis", label: "Devis", icon: FileText },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === step);

  const frontPhotoUrl = photoTextureEnabled && photos.length > 0
    ? (photos.find((p) => p.angleId === "front") || photos[0])?.dataUrl
    : null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b bg-muted/30">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const isActive = s.id === step;
          const isDone = i < currentStepIndex;
          return (
            <button
              key={s.id}
              onClick={() => {
                if (i <= currentStepIndex || isDone) setStep(s.id);
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors flex-1 justify-center ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : isDone
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground"
              }`}
              disabled={i > currentStepIndex && !isDone}
              data-testid={`step-${s.id}`}
            >
              {isDone ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          );
        })}
      </div>

      <ScrollArea className="flex-1">
        {step === "upload" && (
          <div className="p-3 space-y-3">
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">Photographiez votre jante</p>
              <p className="text-xs text-muted-foreground">
                Jusqu'à {MAX_PHOTOS} photos sous différents angles pour une reconstruction fidèle
              </p>
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {PHOTO_ANGLES.slice(0, maxPhotos).map((angle, i) => {
                const photo = photos[i];
                return (
                  <div key={angle.id} className="relative">
                    {photo ? (
                      <div className="aspect-square rounded-md overflow-hidden border-2 border-primary relative group">
                        <img src={photo.dataUrl} alt={angle.label} className="w-full h-full object-cover" />
                        <button
                          onClick={() => removePhoto(i)}
                          className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5 invisible group-hover:visible"
                          data-testid={`button-remove-photo-${i}`}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] text-center py-0.5">
                          {angle.label}
                        </div>
                      </div>
                    ) : (
                      <div className="aspect-square rounded-md border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center">
                        <Camera className="h-3 w-3 text-muted-foreground mb-0.5" />
                        <span className="text-[7px] text-muted-foreground text-center leading-tight">{angle.label}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <Card className="p-2">
              <p className="text-[10px] font-medium mb-1.5 text-muted-foreground">Conseils pour une reconstruction fidèle</p>
              <div className="flex items-center gap-3 justify-center">
                <div className="text-center">
                  <div className="w-10 h-10 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center mb-0.5">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-[8px] text-muted-foreground">Face</span>
                </div>
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <div className="text-center">
                  <div className="w-10 h-10 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center mb-0.5 rotate-[30deg]">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-[8px] text-muted-foreground">3/4</span>
                </div>
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <div className="text-center">
                  <div className="w-10 h-10 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center mb-0.5 rotate-90">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-[8px] text-muted-foreground">Profil</span>
                </div>
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <div className="text-center">
                  <div className="w-10 h-10 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center mb-0.5">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-[8px] text-muted-foreground">Détail</span>
                </div>
              </div>
            </Card>

            <div
              className="border-2 border-dashed border-muted-foreground/30 rounded-md p-4 text-center transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files.length) handleFileAdd(e.dataTransfer.files);
              }}
            >
              <Upload className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground" />
              <p className="text-xs font-medium mb-0.5">Glissez vos photos ici</p>
              <p className="text-[10px] text-muted-foreground mb-2">JPG, PNG, WEBP — Max 10 MB par photo</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-upload-photos"
              >
                <Camera className="h-3.5 w-3.5 mr-1.5" />
                Ajouter des photos
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) handleFileAdd(e.target.files);
                  e.target.value = "";
                }}
                data-testid="input-photos"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setPhotos([]);
                  setStep("generate");
                }}
                data-testid="button-skip-photos"
              >
                Passer cette étape
              </Button>
              <Button
                size="sm"
                className="flex-1"
                disabled={photos.length === 0}
                onClick={() => setStep("generate")}
                data-testid="button-photos-next"
              >
                Continuer
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === "generate" && (
          <div className="p-3 space-y-3">
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">
                {photos.length > 0 ? "Reconstruction 3D de votre jante" : "Génération du modèle 3D"}
              </p>
              <p className="text-xs text-muted-foreground">
                {photos.length > 0
                  ? "L'IA va analyser vos photos pour reconstruire fidèlement votre jante en 3D"
                  : "Choisissez un style de jante comme base pour votre modèle 3D"}
              </p>
            </div>

            {photos.length > 0 && (
              <Card className="p-2 space-y-2">
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {photos.map((p, i) => (
                    <div key={i} className="w-16 h-16 rounded-md overflow-hidden border shrink-0">
                      <img src={p.dataUrl} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <Scan className="h-3.5 w-3.5 text-primary shrink-0" />
                  <p className="text-[10px] text-muted-foreground">
                    L'IA détectera : style de branches, courbure, profondeur, couleur et finition
                  </p>
                </div>
              </Card>
            )}

            <div className="grid grid-cols-2 gap-1.5">
              {SPOKE_PRESETS.map((preset, i) => (
                <Button
                  key={preset.label}
                  variant="outline"
                  size="sm"
                  className={`text-[10px] justify-start ${spokePreset === i ? "ring-2 ring-primary" : ""}`}
                  onClick={() => applySpokePreset(i)}
                  data-testid={`button-spoke-${i}`}
                >
                  <Box className="h-3 w-3 mr-1 shrink-0" />
                  {preset.label}
                </Button>
              ))}
            </div>

            <Button
              className="w-full"
              onClick={handleGenerate3D}
              disabled={isGenerating}
              data-testid="button-generate-3d"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {photos.length > 0 ? "Analyse IA et reconstruction..." : "Génération en cours..."}
                </>
              ) : (
                <>
                  {photos.length > 0 ? <Sparkles className="h-4 w-4 mr-2" /> : <Box className="h-4 w-4 mr-2" />}
                  {photos.length > 0 ? "Reconstruire en 3D depuis les photos" : "Générer le modèle 3D"}
                </>
              )}
            </Button>
            {photos.length > 0 && (
              <p className="text-[10px] text-muted-foreground text-center">
                La photo sera aussi projetée sur la face de la jante 3D pour un rendu photoréaliste
              </p>
            )}
          </div>
        )}

        {step === "customize" && (
          <div className="space-y-0">
            <div className="h-[220px] sm:h-[250px] relative bg-[#1a1a2e]">
              <Suspense
                fallback={
                  <div className="w-full h-full flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-white/60" />
                  </div>
                }
              >
                <Wheel3DViewer
                  ref={viewerRef}
                  wheelParams={wheelParams}
                  materialParams={materialParams}
                  lisereEnabled={lisereEnabled}
                  lisereColor={lisereColor}
                  lisereThickness={lisereThickness}
                  gravureText={gravureText}
                  backgroundImage={showBgPhoto && photos.length > 0 ? photos[bgPhotoIndex]?.dataUrl : undefined}
                  photoTexture={frontPhotoUrl}
                  photoTextureOpacity={photoTextureOpacity}
                  className="h-full"
                />
              </Suspense>
              <div className="absolute top-1.5 right-1.5 flex gap-1">
                {photos.length > 0 && (
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 bg-black/40 border-white/20 text-white"
                      onClick={() => setPhotoTextureEnabled(!photoTextureEnabled)}
                      data-testid="button-toggle-photo-texture"
                      title={photoTextureEnabled ? "Masquer texture photo" : "Projeter photo sur jante"}
                    >
                      <Scan className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 bg-black/40 border-white/20 text-white"
                      onClick={() => setShowBgPhoto(!showBgPhoto)}
                      data-testid="button-toggle-bg-photo"
                      title={showBgPhoto ? "Masquer la photo fond" : "Afficher la photo fond"}
                    >
                      <ImageIcon className="h-3 w-3" />
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 bg-black/40 border-white/20 text-white"
                  onClick={handleReset}
                  data-testid="button-reset-3d"
                  title="Réinitialiser"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              </div>
              {photos.length > 1 && showBgPhoto && (
                <div className="absolute top-1.5 left-1.5 flex gap-1">
                  {photos.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => setBgPhotoIndex(i)}
                      className={`w-8 h-8 rounded-md overflow-hidden border-2 transition-all ${
                        bgPhotoIndex === i ? "border-primary scale-110" : "border-white/30 opacity-70"
                      }`}
                      data-testid={`button-bg-photo-${i}`}
                    >
                      <img src={p.dataUrl} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
              <div className="absolute bottom-1.5 left-1.5 flex flex-col gap-0.5">
                {analysisResult && (
                  <Badge variant="outline" className="text-[9px] bg-green-600/70 border-green-400/40 text-white">
                    <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                    {analysisResult}
                  </Badge>
                )}
                {photoTextureEnabled && photos.length > 0 && (
                  <Badge variant="outline" className="text-[9px] bg-blue-600/70 border-blue-400/40 text-white">
                    <Scan className="h-2.5 w-2.5 mr-0.5" />
                    Photo projetée sur la face
                  </Badge>
                )}
                <Badge variant="outline" className="text-[9px] bg-black/50 border-white/20 text-white">
                  {wheelParams.spokePattern !== "straight" ? `${wheelParams.spokePattern} — ` : ""}
                  Rotation 360° — Zoom scroll
                </Badge>
              </div>
            </div>

            <div className="flex border-b">
              {(["couleur", "finition", "geometrie", "options"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setCustomizeTab(tab)}
                  className={`flex-1 text-xs py-2 font-medium border-b-2 transition-colors ${
                    customizeTab === tab
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground"
                  }`}
                  data-testid={`tab-${tab}`}
                >
                  {tab === "couleur" ? "Couleur" : tab === "finition" ? "Finition" : tab === "geometrie" ? "3D" : "Options"}
                </button>
              ))}
            </div>

            <div className="p-3 space-y-3">
              {customizeTab === "couleur" && (
                <>
                  <div>
                    <Label className="text-xs mb-1.5 block">Couleur principale</Label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {dynamicColors.map((c: any) => (
                        <button
                          key={c.hex}
                          onClick={() => setColor(c.hex)}
                          className={`aspect-square rounded-md border-2 transition-all ${
                            color === c.hex ? "border-primary scale-110" : "border-transparent"
                          }`}
                          style={{ backgroundColor: c.hex }}
                          title={c.name}
                          data-testid={`color-${c.name}`}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Couleur personnalisée</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="w-8 h-8 rounded-md border cursor-pointer"
                        data-testid="input-custom-color"
                      />
                      <Input
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="flex-1 text-xs font-mono"
                        data-testid="input-color-hex"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Style de branches</Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {SPOKE_PRESETS.map((preset, i) => (
                        <Button
                          key={preset.label}
                          variant="outline"
                          size="sm"
                          className={`text-[10px] justify-start ${spokePreset === i ? "ring-2 ring-primary" : ""}`}
                          onClick={() => applySpokePreset(i)}
                          data-testid={`spoke-style-${i}`}
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {customizeTab === "finition" && (
                <>
                  <div>
                    <Label className="text-xs mb-1.5 block">Préréglage de finition</Label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {FINISH_PRESETS.map((f) => (
                        <Button
                          key={f.id}
                          variant="outline"
                          size="sm"
                          className={`text-[10px] ${finishPreset.id === f.id ? "ring-2 ring-primary" : ""}`}
                          onClick={() => applyFinish(f)}
                          data-testid={`finish-${f.id}`}
                        >
                          {f.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs">Metallic</Label>
                        <span className="text-[10px] text-muted-foreground font-mono">{metalness.toFixed(2)}</span>
                      </div>
                      <Slider
                        value={[metalness * 100]}
                        onValueChange={([v]) => setMetalness(v / 100)}
                        max={100}
                        step={1}
                        data-testid="slider-metalness"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs">Rugosité</Label>
                        <span className="text-[10px] text-muted-foreground font-mono">{roughness.toFixed(2)}</span>
                      </div>
                      <Slider
                        value={[roughness * 100]}
                        onValueChange={([v]) => setRoughness(v / 100)}
                        max={100}
                        step={1}
                        data-testid="slider-roughness"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs">Brillance (clearcoat)</Label>
                        <span className="text-[10px] text-muted-foreground font-mono">{clearcoat.toFixed(2)}</span>
                      </div>
                      <Slider
                        value={[clearcoat * 100]}
                        onValueChange={([v]) => setClearcoat(v / 100)}
                        max={100}
                        step={1}
                        data-testid="slider-clearcoat"
                      />
                    </div>
                  </div>
                </>
              )}

              {customizeTab === "geometrie" && (
                <>
                  <div>
                    <Label className="text-xs mb-1.5 block">Profondeur du plat (dish)</Label>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted-foreground">Plat</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{wheelParams.dishDepth.toFixed(2)}</span>
                      <span className="text-[10px] text-muted-foreground">Concave</span>
                    </div>
                    <Slider
                      value={[wheelParams.dishDepth * 100]}
                      onValueChange={([v]) => setWheelParams((prev) => ({ ...prev, dishDepth: v / 100 }))}
                      min={0}
                      max={40}
                      step={1}
                      data-testid="slider-dish-depth"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs">Courbure des branches</Label>
                      <span className="text-[10px] text-muted-foreground font-mono">{wheelParams.spokeCurvature.toFixed(2)}</span>
                    </div>
                    <Slider
                      value={[wheelParams.spokeCurvature * 100]}
                      onValueChange={([v]) => setWheelParams((prev) => ({ ...prev, spokeCurvature: v / 100 }))}
                      min={0}
                      max={80}
                      step={1}
                      data-testid="slider-spoke-curvature"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs">Largeur des branches</Label>
                      <span className="text-[10px] text-muted-foreground font-mono">{wheelParams.spokeWidth.toFixed(3)}</span>
                    </div>
                    <Slider
                      value={[wheelParams.spokeWidth * 1000]}
                      onValueChange={([v]) => setWheelParams((prev) => ({ ...prev, spokeWidth: v / 1000 }))}
                      min={20}
                      max={200}
                      step={1}
                      data-testid="slider-spoke-width"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs">Nombre de branches</Label>
                      <span className="text-[10px] text-muted-foreground font-mono">{wheelParams.spokeCount}</span>
                    </div>
                    <Slider
                      value={[wheelParams.spokeCount]}
                      onValueChange={([v]) => setWheelParams((prev) => ({ ...prev, spokeCount: v }))}
                      min={3}
                      max={20}
                      step={1}
                      data-testid="slider-spoke-count"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs">Profondeur jante</Label>
                      <span className="text-[10px] text-muted-foreground font-mono">{wheelParams.barrelDepth.toFixed(2)}</span>
                    </div>
                    <Slider
                      value={[wheelParams.barrelDepth * 100]}
                      onValueChange={([v]) => setWheelParams((prev) => ({ ...prev, barrelDepth: v / 100 }))}
                      min={15}
                      max={60}
                      step={1}
                      data-testid="slider-barrel-depth"
                    />
                  </div>
                  {photos.length > 0 && (
                    <div>
                      <Label className="text-xs mb-1.5 block">Texture photo</Label>
                      <div className="flex items-center gap-2 mb-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className={`text-xs ${photoTextureEnabled ? "ring-2 ring-primary" : ""}`}
                          onClick={() => setPhotoTextureEnabled(!photoTextureEnabled)}
                          data-testid="button-toggle-photo-texture-2"
                        >
                          <Scan className="h-3 w-3 mr-1" />
                          {photoTextureEnabled ? "Texture activée" : "Texture désactivée"}
                        </Button>
                      </div>
                      {photoTextureEnabled && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <Label className="text-[10px]">Opacité</Label>
                            <span className="text-[10px] text-muted-foreground font-mono">{(photoTextureOpacity * 100).toFixed(0)}%</span>
                          </div>
                          <Slider
                            value={[photoTextureOpacity * 100]}
                            onValueChange={([v]) => setPhotoTextureOpacity(v / 100)}
                            min={10}
                            max={100}
                            step={5}
                            data-testid="slider-photo-opacity"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {customizeTab === "options" && (
                <>
                  <div>
                    <Label className="text-xs mb-1.5 block">Liseré</Label>
                    <div className="flex items-center gap-2 mb-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className={`text-xs ${lisereEnabled ? "ring-2 ring-primary" : ""}`}
                        onClick={() => setLisereEnabled(!lisereEnabled)}
                        data-testid="button-toggle-lisere"
                      >
                        {lisereEnabled ? "Activé" : "Désactivé"}
                      </Button>
                      {lisereEnabled && (
                        <input
                          type="color"
                          value={lisereColor}
                          onChange={(e) => setLisereColor(e.target.value)}
                          className="w-7 h-7 rounded border cursor-pointer"
                          data-testid="input-lisere-color"
                        />
                      )}
                    </div>
                    {lisereEnabled && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <Label className="text-[10px]">Épaisseur</Label>
                          <span className="text-[10px] text-muted-foreground">{lisereThickness}</span>
                        </div>
                        <Slider
                          value={[lisereThickness]}
                          onValueChange={([v]) => setLisereThickness(v)}
                          min={1}
                          max={8}
                          step={1}
                          data-testid="slider-lisere-thickness"
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Gravure texte</Label>
                    <Input
                      value={gravureText}
                      onChange={(e) => setGravureText(e.target.value)}
                      placeholder="Texte gravé (max 20 car.)"
                      maxLength={20}
                      className="text-xs"
                      data-testid="input-gravure"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="border-t p-2 flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPNG}
                className="flex-1 text-[10px]"
                data-testid="button-export-png"
              >
                <Download className="h-3 w-3 mr-1" />
                PNG
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportGLB}
                className="flex-1 text-[10px]"
                data-testid="button-export-glb"
              >
                <Box className="h-3 w-3 mr-1" />
                GLB
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleHDRender}
                disabled={isRendering}
                className="flex-1 text-[10px]"
                data-testid="button-hd-render"
              >
                {isRendering ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                HD
              </Button>
              <Button
                size="sm"
                onClick={() => setStep("devis")}
                className="flex-1 text-[10px]"
                data-testid="button-to-devis"
              >
                <FileText className="h-3 w-3 mr-1" />
                Devis
              </Button>
            </div>
          </div>
        )}

        {step === "devis" && (
          <div className="p-3 space-y-3">
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">Créer votre devis</p>
              <p className="text-xs text-muted-foreground">
                Sélectionnez les services souhaités. Le prix sera défini par le garage.
              </p>
            </div>

            {photos.length > 0 && (
              <div>
                <Label className="text-xs mb-1.5 block">Photos jointes ({photos.length})</Label>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {photos.map((p, i) => (
                    <div key={i} className="w-12 h-12 rounded-md overflow-hidden border shrink-0">
                      <img src={p.dataUrl} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Card className="p-2">
              <p className="text-[10px] font-medium text-muted-foreground mb-1">Configuration</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                <span className="text-muted-foreground">Couleur</span>
                <span className="font-medium flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full border" style={{ backgroundColor: color }} />
                  {COLOR_PRESETS.find((c) => c.hex === color)?.name || color}
                </span>
                <span className="text-muted-foreground">Finition</span>
                <span className="font-medium">{finishPreset.label}</span>
                <span className="text-muted-foreground">Branches</span>
                <span className="font-medium">{SPOKE_PRESETS[spokePreset]?.label || `${wheelParams.spokeCount} branches`}</span>
                <span className="text-muted-foreground">Style</span>
                <span className="font-medium">{wheelParams.spokePattern}</span>
                {wheelParams.dishDepth > 0.05 && (
                  <>
                    <span className="text-muted-foreground">Profondeur</span>
                    <span className="font-medium">{(wheelParams.dishDepth * 100).toFixed(0)}%</span>
                  </>
                )}
                {lisereEnabled && (
                  <>
                    <span className="text-muted-foreground">Liseré</span>
                    <span className="font-medium flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full border" style={{ backgroundColor: lisereColor }} />
                      Oui
                    </span>
                  </>
                )}
                {gravureText && (
                  <>
                    <span className="text-muted-foreground">Gravure</span>
                    <span className="font-medium">{gravureText}</span>
                  </>
                )}
              </div>
            </Card>

            <div>
              <Label className="text-xs mb-1.5 block">Services disponibles</Label>
              {activeServices.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucun service disponible</p>
              ) : (
                <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                  {activeServices.map((svc: any) => (
                    <Button
                      key={svc.id}
                      variant="outline"
                      size="sm"
                      className={`w-full justify-start text-left text-xs ${
                        selectedServices.includes(svc.id) ? "ring-2 ring-primary bg-primary/5" : ""
                      }`}
                      onClick={() => toggleService(svc.id)}
                      data-testid={`service-${svc.id}`}
                    >
                      <div className="flex items-center gap-2 w-full">
                        {selectedServices.includes(svc.id) ? (
                          <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                        ) : (
                          <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{svc.name}</p>
                          {svc.category && (
                            <p className="text-[10px] text-muted-foreground truncate">{svc.category}</p>
                          )}
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Button
                className="w-full"
                onClick={handleCreateDevis}
                disabled={isCreatingDevis}
                data-testid="button-create-devis"
              >
                {isCreatingDevis ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Envoi des photos et préparation...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Créer le devis
                  </>
                )}
              </Button>
              <p className="text-[9px] text-muted-foreground text-center">
                Le prix sera défini par le garage après analyse de votre demande
              </p>
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
