import { useState, useRef, useMemo, Suspense, lazy } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import {
  Download, FileText, ChevronRight, ChevronLeft,
  Paintbrush, Ruler, CircleDot, Eye, Palette, Layers, Wrench,
  Check, ShoppingCart, Info, RotateCcw, Box, Type, Camera,
  Sparkles, Loader2, X, ImageIcon,
} from "lucide-react";
import {
  DEFAULT_WHEEL_PARAMS,
  SPOKE_PRESETS,
  type WheelParams,
  type WheelMaterialParams,
} from "@/lib/wheel-generator";
import type { Wheel3DViewerHandle } from "@/components/wheel-3d-viewer";

const Wheel3DViewer = lazy(() => import("@/components/wheel-3d-viewer"));

const COLORS = [
  { id: "argent", name: "Argent", hex: "#c0c0c0", price: 0 },
  { id: "noir-mat", name: "Noir Mat", hex: "#1a1a1a", price: 0 },
  { id: "noir-brillant", name: "Noir Brillant", hex: "#0d0d0d", price: 20 },
  { id: "gris-anthracite", name: "Gris Anthracite", hex: "#3d3d3d", price: 0 },
  { id: "blanc-nacre", name: "Blanc Nacré", hex: "#e8e4df", price: 30 },
  { id: "blanc-brillant", name: "Blanc Brillant", hex: "#f5f5f5", price: 20 },
  { id: "bronze", name: "Bronze", hex: "#8b6914", price: 30 },
  { id: "or-champagne", name: "Or Champagne", hex: "#c4a35a", price: 40 },
  { id: "rouge-candy", name: "Rouge Candy", hex: "#8b0000", price: 50 },
  { id: "bleu-nuit", name: "Bleu Nuit", hex: "#0a1628", price: 30 },
  { id: "gunmetal", name: "Gunmetal", hex: "#2c3539", price: 15 },
  { id: "cuivre", name: "Cuivre", hex: "#b87333", price: 35 },
];

const FINISHES = [
  { id: "mat", name: "Mat", desc: "Surface lisse sans reflets", price: 0, metalness: 0.6, roughness: 0.5, clearcoat: 0.1 },
  { id: "brillant", name: "Brillant", desc: "Vernis miroir haute brillance", price: 20, metalness: 0.9, roughness: 0.05, clearcoat: 0.8 },
  { id: "satin", name: "Satiné", desc: "Entre mat et brillant", price: 10, metalness: 0.75, roughness: 0.25, clearcoat: 0.3 },
  { id: "metallique", name: "Métallique", desc: "Paillettes métallisées", price: 30, metalness: 0.95, roughness: 0.15, clearcoat: 0.6 },
  { id: "diamond-cut", name: "Diamond Cut", desc: "Usinage diamant bicolore", price: 60, metalness: 1.0, roughness: 0.08, clearcoat: 0.9 },
  { id: "hydrographie", name: "Hydrographie", desc: "Motif carbone/bois/camouflage", price: 80, metalness: 0.4, roughness: 0.4, clearcoat: 0.2 },
];

const SIZES = [
  { id: "16", label: '16"', price: 0, scale: 0.85 },
  { id: "17", label: '17"', price: 0, scale: 0.9 },
  { id: "18", label: '18"', price: 10, scale: 0.95 },
  { id: "19", label: '19"', price: 20, scale: 1.0 },
  { id: "20", label: '20"', price: 35, scale: 1.05 },
  { id: "21", label: '21"', price: 50, scale: 1.1 },
  { id: "22", label: '22"', price: 70, scale: 1.15 },
];

const ACCESSORIES = [
  { id: "lisere", name: "Liseré couleur", desc: "Protection jante + style", price: 15 },
  { id: "centre-logo", name: "Centre logo", desc: "Cache moyeu personnalisé", price: 25 },
  { id: "valve-alu", name: "Valves aluminium", desc: "Valves sport en aluminium", price: 8 },
  { id: "sticker-perso", name: "Sticker personnalisé", desc: "Logo ou texte gravé", price: 20 },
];

const SERVICE_TYPES = [
  { id: "renovation", name: "Rénovation complète", base: 99, desc: "Décapage + peinture + vernis" },
  { id: "personnalisation", name: "Personnalisation", base: 160, desc: "Changement couleur/finition" },
  { id: "diamond-cut", name: "Diamond Cut", base: 140, desc: "Usinage diamant + vernis" },
  { id: "reparation", name: "Réparation + peinture", base: 120, desc: "Redressage + rénovation" },
];

type Step = "design" | "color" | "finish" | "size" | "options" | "service";

function compressImage(file: File, maxW = 1200, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        let w = img.width, h = img.height;
        if (w > maxW) { h = (h * maxW) / w; w = maxW; }
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        if (!ctx) return reject(new Error("Canvas error"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Load error"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Read error"));
    reader.readAsDataURL(file);
  });
}

export default function WheelConfigurator() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const viewerRef = useRef<Wheel3DViewerHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeStep, setActiveStep] = useState<Step>("design");

  const [serviceType, setServiceType] = useState(SERVICE_TYPES[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [finish, setFinish] = useState(FINISHES[0]);
  const [size, setSize] = useState(SIZES[3]);
  const [wheelCount, setWheelCount] = useState(4);
  const [accessories, setAccessories] = useState<string[]>([]);
  const [lisereColor, setLisereColor] = useState("#ff0000");
  const [lisereThickness, setLisereThickness] = useState(3);
  const [gravureText, setGravureText] = useState("");

  const [spokePresetIdx, setSpokePresetIdx] = useState(0);
  const [rimDepth, setRimDepth] = useState(DEFAULT_WHEEL_PARAMS.rimDepth);
  const [lipWidth, setLipWidth] = useState(DEFAULT_WHEEL_PARAMS.lipWidth);
  const [clientPhoto, setClientPhoto] = useState<string | undefined>(undefined);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    description: string;
    spokeCount?: number;
    color?: string;
    finish?: string;
  } | null>(null);
  const [aiHubRadius, setAiHubRadius] = useState<number | null>(null);
  const [aiSpokeWidth, setAiSpokeWidth] = useState<number | null>(null);

  const wheelParams: WheelParams = useMemo(() => {
    const preset = SPOKE_PRESETS[spokePresetIdx]?.params || {};
    const s = size.scale;
    return {
      ...DEFAULT_WHEEL_PARAMS,
      ...preset,
      rimDepth,
      lipWidth,
      outerRadius: DEFAULT_WHEEL_PARAMS.outerRadius * s,
      hubRadius: (aiHubRadius ?? DEFAULT_WHEEL_PARAMS.hubRadius) * s,
      ...(aiSpokeWidth != null ? { spokeWidth: aiSpokeWidth } : {}),
    };
  }, [spokePresetIdx, rimDepth, lipWidth, size, aiHubRadius, aiSpokeWidth]);

  const materialParams: WheelMaterialParams = useMemo(() => ({
    color: color.hex,
    metalness: finish.metalness,
    roughness: finish.roughness,
    clearcoat: finish.clearcoat,
    clearcoatRoughness: finish.roughness * 0.3,
  }), [color, finish]);

  const perWheel = serviceType.base + color.price + finish.price + size.price;
  const accTotal = accessories.reduce((s, id) => {
    const a = ACCESSORIES.find(x => x.id === id);
    return s + (a ? a.price * wheelCount : 0);
  }, 0);
  const totalHT = perWheel * wheelCount + accTotal;
  const tva = Math.round(totalHT * 20) / 100;
  const totalTTC = totalHT + tva;

  const handleFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Fichier trop volumineux", description: "Maximum 10 MB", variant: "destructive" });
      return;
    }
    try {
      const dataUrl = await compressImage(file);
      setClientPhoto(dataUrl);

      if (user) {
        setIsAnalyzing(true);
        setAnalysisResult(null);
        try {
          const base64 = dataUrl.split(",")[1];
          const mimeMatch = dataUrl.match(/^data:(image\/[^;]+);/);
          const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
          const response = await apiRequest("POST", "/api/ai/analyze-wheel-params", {
            imageBase64: base64,
            imageMimeType: mimeType,
          });
          const data = await response.json();
          if (data.params) {
            const p = data.params;
            if (p.spokeCount || p.spokePattern) {
              const matchIdx = SPOKE_PRESETS.findIndex(
                (sp) => sp.pattern === p.spokePattern && sp.params.spokeCount === p.spokeCount
              );
              if (matchIdx >= 0) {
                setSpokePresetIdx(matchIdx);
              } else {
                const fallback = SPOKE_PRESETS.findIndex(
                  (sp) => sp.pattern === p.spokePattern
                );
                if (fallback >= 0) setSpokePresetIdx(fallback);
                else {
                  const countMatch = SPOKE_PRESETS.findIndex(
                    (sp) => sp.params.spokeCount === p.spokeCount
                  );
                  if (countMatch >= 0) setSpokePresetIdx(countMatch);
                }
              }
            }
            if (p.rimDepth) setRimDepth(p.rimDepth);
            if (p.hubRadius) setAiHubRadius(p.hubRadius);
            if (p.spokeWidth) setAiSpokeWidth(p.spokeWidth);
            if (p.lipWidth) setLipWidth(p.lipWidth);
            if (p.color) {
              const matchColor = COLORS.find(
                (c) => c.hex.toLowerCase() === p.color.toLowerCase()
              );
              if (matchColor) setColor(matchColor);
            }
            if (p.finish) {
              const finishMap: Record<string, string> = {
                mat: "mat", brillant: "brillant", chrome: "brillant",
                carbone: "hydrographie", forge: "metallique", satine: "satin",
              };
              const finishId = finishMap[p.finish] || p.finish;
              const matchFinish = FINISHES.find((f) => f.id === finishId);
              if (matchFinish) setFinish(matchFinish);
            }
            setAnalysisResult({
              description: p.description || "Jante analysée par IA",
              spokeCount: p.spokeCount,
              color: p.color,
              finish: p.finish,
            });
            toast({ title: "Analyse IA terminée", description: p.description || "Les paramètres 3D ont été adaptés à votre jante" });
          }
        } catch (err: any) {
          console.error("AI analysis error:", err);
          toast({ title: "Photo chargée", description: "L'analyse IA n'est pas disponible, vous pouvez ajuster manuellement" });
        } finally {
          setIsAnalyzing(false);
        }
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger l'image", variant: "destructive" });
    }
  };

  const clearPhoto = () => {
    setClientPhoto(undefined);
    setAnalysisResult(null);
    setAiHubRadius(null);
    setAiSpokeWidth(null);
  };

  const exportPNG = () => {
    const dataUrl = viewerRef.current?.exportPNG(2048);
    if (!dataUrl) {
      toast({ title: "Erreur", description: "Impossible d'exporter l'image", variant: "destructive" });
      return;
    }
    const link = document.createElement("a");
    link.download = `myjantes-3d-${color.id}-${finish.id}-${size.id}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Image HD téléchargée" });
  };

  const exportGLB = async () => {
    const blob = await viewerRef.current?.exportGLB();
    if (!blob || blob.size === 0) {
      toast({ title: "Erreur", description: "Impossible d'exporter le modèle 3D", variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `myjantes-3d-${color.id}-${finish.id}-${size.id}.glb`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: "Modèle 3D téléchargé", description: "Format GLB compatible avec la plupart des logiciels 3D" });
  };

  const requestQuote = async () => {
    if (!user) {
      toast({ title: "Connexion requise", description: "Connectez-vous pour demander un devis", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const preset = SPOKE_PRESETS[spokePresetIdx];
      const summary = [
        `Service : ${serviceType.name}`,
        `Design : ${preset?.label || "Standard"}`,
        `Couleur : ${color.name}`,
        `Finition : ${finish.name}`,
        `Taille : ${size.label}`,
        `Jantes : ${wheelCount}`,
        accessories.length > 0 ? `Options : ${accessories.map(id => ACCESSORIES.find(a => a.id === id)?.name).filter(Boolean).join(", ")}` : null,
        gravureText ? `Gravure : ${gravureText}` : null,
        `Prix estimé TTC : ${totalTTC.toFixed(2)} €`,
      ].filter(Boolean).join("\n");

      let wheelImageUrl: string | undefined;
      try {
        const pngDataUrl = viewerRef.current?.exportPNG(1024);
        if (pngDataUrl) {
          const pngBase64 = pngDataUrl.split(",")[1];
          const uploadRes = await apiRequest("POST", "/api/upload-base64", {
            base64: pngBase64,
            mimeType: "image/png",
            fileName: `configurateur-3d-${color.id}-${finish.id}.png`,
          });
          const uploadData = await uploadRes.json();
          wheelImageUrl = uploadData.objectPath || uploadData.url || uploadData.filePath;
        }
      } catch (uploadErr) {
        console.error("3D render upload error:", uploadErr);
      }

      let bgPhotoUrl: string | undefined;
      if (clientPhoto) {
        try {
          const bgBase64 = clientPhoto.split(",")[1];
          const bgMime = clientPhoto.match(/^data:(image\/[^;]+);/)?.[1] || "image/jpeg";
          const bgUploadRes = await apiRequest("POST", "/api/upload-base64", {
            base64: bgBase64,
            mimeType: bgMime,
            fileName: `configurateur-photo-client.jpg`,
          });
          const bgUploadData = await bgUploadRes.json();
          bgPhotoUrl = bgUploadData.objectPath || bgUploadData.url || bgUploadData.filePath;
        } catch (bgErr) {
          console.error("Background photo upload error:", bgErr);
        }
      }

      const response = await apiRequest("POST", "/api/configurator/quote-request", {
        configuration: {
          serviceType: serviceType.id,
          color: color.id,
          colorName: color.name,
          finish: finish.id,
          finishName: finish.name,
          size: size.id,
          wheelCount,
          accessories,
          spokeDesign: preset?.label,
          gravureText,
          estimatedPriceHT: totalHT,
          estimatedTVA: tva,
          estimatedTotalTTC: totalTTC,
          summary,
          wheelImageUrl,
          bgPhotoUrl,
          wheelImageIncluded: !!wheelImageUrl,
        }
      });
      const quoteData = await response.json();
      toast({ title: "Demande envoyée !", description: "Votre demande de devis a été créée. Vous pouvez la retrouver dans vos devis." });
      const isAdmin = user.role === "admin" || user.role === "superadmin";
      navigate(isAdmin ? "/admin/quotes" : "/quotes");
    } catch (err: any) {
      console.error("Quote request error:", err);
      toast({ title: "Erreur", description: err.message || "Impossible d'envoyer la demande", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps: { id: Step; icon: any; label: string }[] = [
    { id: "design", icon: Box, label: "Design" },
    { id: "color", icon: Palette, label: "Couleur" },
    { id: "finish", icon: Layers, label: "Finition" },
    { id: "size", icon: Ruler, label: "Taille" },
    { id: "options", icon: CircleDot, label: "Options" },
    { id: "service", icon: Wrench, label: "Service" },
  ];

  const stepIdx = steps.findIndex(s => s.id === activeStep);
  const canPrev = stepIdx > 0;
  const canNext = stepIdx < steps.length - 1;

  return (
    <div className="flex flex-col h-full bg-background" data-testid="wheel-configurator-page">
      <div className="flex items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-3 border-b shrink-0">
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold truncate" data-testid="text-configurator-title">
            <Paintbrush className="h-4 w-4 inline mr-1.5 -mt-0.5" />
            Configurateur 3D
          </h1>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={exportPNG} data-testid="button-download-png">
            <Download className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">PNG</span>
          </Button>
          <Button variant="outline" size="sm" onClick={exportGLB} data-testid="button-download-glb">
            <Box className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">3D</span>
          </Button>
          <Button size="sm" onClick={requestQuote} disabled={isSubmitting} data-testid="button-request-quote">
            <ShoppingCart className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">{isSubmitting ? "Envoi..." : "Devis"}</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        <div className="relative flex flex-col lg:flex-1 min-h-[280px] sm:min-h-[360px] lg:min-h-0" data-testid="preview-area-3d">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center bg-zinc-950">
              <div className="text-white/50 text-sm">Chargement du viewer 3D...</div>
            </div>
          }>
            <Wheel3DViewer
              ref={viewerRef}
              wheelParams={wheelParams}
              materialParams={materialParams}
              lisereEnabled={accessories.includes("lisere")}
              lisereColor={lisereColor}
              lisereThickness={lisereThickness}
              gravureText={gravureText}
              className="flex-1"
            />
          </Suspense>

          <div className="absolute top-3 left-3 z-20" data-testid="photo-panel">
            {clientPhoto ? (
              <div className="flex flex-col gap-1.5 max-w-[180px]">
                <div className="relative group">
                  <img
                    src={clientPhoto}
                    alt="Photo client"
                    className="w-[120px] h-[90px] sm:w-[160px] sm:h-[120px] object-cover rounded-md border-2 border-white/30 shadow-lg"
                    data-testid="img-client-photo"
                  />
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute -top-1.5 -right-1.5 h-6 w-6 rounded-full shadow-md"
                    onClick={clearPhoto}
                    data-testid="button-clear-photo"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                  {isAnalyzing && (
                    <div className="absolute inset-0 bg-black/50 rounded-md flex items-center justify-center">
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                    </div>
                  )}
                </div>
                {isAnalyzing && (
                  <Badge variant="secondary" className="text-[10px] w-fit" data-testid="badge-analyzing">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Analyse IA...
                  </Badge>
                )}
                {analysisResult && !isAnalyzing && (
                  <div className="space-y-1">
                    <Badge variant="secondary" className="text-[10px] w-fit" data-testid="badge-analysis-result">
                      <Sparkles className="h-3 w-3 mr-1" />
                      IA
                    </Badge>
                    <p className="text-[10px] text-white/90 bg-black/60 rounded px-1.5 py-1 leading-tight" data-testid="text-analysis-desc">
                      {analysisResult.description}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {analysisResult.spokeCount && (
                        <Badge variant="outline" className="text-[9px] bg-black/50 text-white/80 border-white/20">
                          {analysisResult.spokeCount} branches
                        </Badge>
                      )}
                      {analysisResult.finish && (
                        <Badge variant="outline" className="text-[9px] bg-black/50 text-white/80 border-white/20">
                          {analysisResult.finish}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isAnalyzing}
                data-testid="button-upload-photo"
              >
                <Camera className="h-3.5 w-3.5 mr-1" />
                Ajouter une photo
              </Button>
            )}
          </div>

          <div className="absolute bottom-3 right-3 z-20 pointer-events-auto">
            <Badge variant="secondary">
              Glisser pour tourner
            </Badge>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            data-testid="input-file-photo"
          />
        </div>

        <div className="flex-1 lg:w-[400px] lg:max-w-[420px] flex flex-col border-t lg:border-t-0 lg:border-l min-h-0">
          <div className="flex border-b shrink-0 overflow-x-auto">
            {steps.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveStep(s.id)}
                className={`flex items-center gap-1 px-2.5 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2 flex-1 justify-center ${
                  activeStep === s.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground"
                }`}
                data-testid={`tab-${s.id}`}
              >
                <s.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            ))}
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-3 sm:p-4 space-y-3">
              {activeStep === "design" && (
                <>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Style de branches</p>
                  <div className="grid grid-cols-2 gap-2">
                    {SPOKE_PRESETS.map((preset, i) => (
                      <Card
                        key={i}
                        className={`p-3 cursor-pointer transition-all hover-elevate ${
                          spokePresetIdx === i ? "ring-2 ring-primary" : ""
                        }`}
                        onClick={() => setSpokePresetIdx(i)}
                        data-testid={`button-spoke-${i}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            spokePresetIdx === i ? "bg-primary text-primary-foreground" : "bg-muted"
                          }`}>
                            {preset.params.spokeCount || 5}
                          </div>
                          <span className="text-sm font-medium">{preset.label}</span>
                        </div>
                      </Card>
                    ))}
                  </div>
                  <Separator />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Géométrie</p>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Profondeur de jante</Label>
                        <span className="text-xs text-muted-foreground">{(rimDepth * 100).toFixed(0)}%</span>
                      </div>
                      <Slider
                        value={[rimDepth]}
                        onValueChange={([v]) => setRimDepth(v)}
                        min={0.1}
                        max={0.5}
                        step={0.02}
                        data-testid="slider-rim-depth"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Largeur du rebord</Label>
                        <span className="text-xs text-muted-foreground">{(lipWidth * 100).toFixed(0)}%</span>
                      </div>
                      <Slider
                        value={[lipWidth]}
                        onValueChange={([v]) => setLipWidth(v)}
                        min={0.02}
                        max={0.12}
                        step={0.005}
                        data-testid="slider-lip-width"
                      />
                    </div>
                  </div>
                </>
              )}

              {activeStep === "color" && (
                <>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Couleur</p>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {COLORS.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setColor(c)}
                        className={`relative flex flex-col items-center gap-1 p-1.5 rounded-md transition-all ${
                          color.id === c.id ? "ring-2 ring-primary bg-primary/5" : ""
                        }`}
                        data-testid={`button-color-${c.id}`}
                      >
                        <div
                          className="w-9 h-9 rounded-full border-2 transition-transform"
                          style={{
                            backgroundColor: c.hex,
                            borderColor: color.id === c.id ? "hsl(var(--primary))" : "rgba(128,128,128,0.3)",
                            transform: color.id === c.id ? "scale(1.1)" : "scale(1)",
                          }}
                        >
                          {color.id === c.id && (
                            <div className="w-full h-full flex items-center justify-center">
                              <Check className="h-4 w-4 text-white drop-shadow-md" />
                            </div>
                          )}
                        </div>
                        <span className="text-[9px] leading-tight text-center">{c.name}</span>
                        {c.price > 0 && <span className="text-[9px] text-primary font-semibold">+{c.price}€</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {activeStep === "finish" && (
                <>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Finition</p>
                  <div className="space-y-2">
                    {FINISHES.map((f) => (
                      <Card
                        key={f.id}
                        className={`p-3 cursor-pointer transition-all hover-elevate ${
                          finish.id === f.id ? "ring-2 ring-primary" : ""
                        }`}
                        onClick={() => setFinish(f)}
                        data-testid={`button-finish-${f.id}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{f.name}</p>
                            <p className="text-xs text-muted-foreground">{f.desc}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex gap-0.5">
                              {[...Array(3)].map((_, i) => (
                                <div key={i} className={`w-1.5 h-3 rounded-sm ${
                                  i < Math.ceil(f.metalness * 3) ? "bg-foreground/60" : "bg-foreground/15"
                                }`} />
                              ))}
                            </div>
                            {f.price > 0 && (
                              <Badge variant="secondary" className="text-xs">+{f.price}€</Badge>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </>
              )}

              {activeStep === "size" && (
                <>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Diamètre</p>
                  <div className="grid grid-cols-4 gap-2">
                    {SIZES.map((s) => (
                      <Button
                        key={s.id}
                        variant={size.id === s.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSize(s)}
                        className="flex-col gap-0"
                        data-testid={`button-size-${s.id}`}
                      >
                        <span className="text-sm font-bold">{s.label}</span>
                        {s.price > 0 && <span className="text-[10px] opacity-70">+{s.price}€</span>}
                      </Button>
                    ))}
                  </div>
                  <Separator />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nombre de jantes</p>
                  <div className="flex gap-2">
                    {[1, 2, 4].map((n) => (
                      <Button
                        key={n}
                        variant={wheelCount === n ? "default" : "outline"}
                        size="sm"
                        onClick={() => setWheelCount(n)}
                        className="flex-1"
                        data-testid={`button-count-${n}`}
                      >
                        {n} jante{n > 1 ? "s" : ""}
                      </Button>
                    ))}
                  </div>
                </>
              )}

              {activeStep === "options" && (
                <>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Accessoires</p>
                  <div className="space-y-2">
                    {ACCESSORIES.map((acc) => {
                      const sel = accessories.includes(acc.id);
                      return (
                        <Card
                          key={acc.id}
                          className={`p-3 cursor-pointer transition-all hover-elevate ${
                            sel ? "ring-2 ring-primary" : ""
                          }`}
                          onClick={() => setAccessories(prev => sel ? prev.filter(x => x !== acc.id) : [...prev, acc.id])}
                          data-testid={`button-acc-${acc.id}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                                sel ? "bg-primary border-primary" : "border-muted-foreground/30"
                              }`}>
                                {sel && <Check className="h-3 w-3 text-primary-foreground" />}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{acc.name}</p>
                                <p className="text-xs text-muted-foreground">{acc.desc}</p>
                              </div>
                            </div>
                            <Badge variant="secondary" className="shrink-0 text-xs">+{acc.price}€/j.</Badge>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                  {accessories.includes("lisere") && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium">Couleur du liseré</p>
                      <div className="flex gap-2 flex-wrap">
                        {["#ff0000", "#00ff00", "#0066ff", "#ffcc00", "#ff6600", "#ffffff", "#000000"].map((c) => (
                          <button
                            key={c}
                            onClick={() => setLisereColor(c)}
                            className={`w-7 h-7 rounded-full border-2 transition-transform ${lisereColor === c ? "border-primary scale-110" : "border-muted-foreground/30"}`}
                            style={{ backgroundColor: c }}
                            data-testid={`button-lisere-${c}`}
                          />
                        ))}
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Épaisseur</Label>
                          <span className="text-xs text-muted-foreground">{lisereThickness}mm</span>
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
                    </div>
                  )}
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Type className="h-4 w-4 text-muted-foreground" />
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Gravure personnalisée</p>
                    </div>
                    <Input
                      value={gravureText}
                      onChange={(e) => setGravureText(e.target.value.slice(0, 20))}
                      placeholder="Votre texte (max 20 car.)"
                      className="text-sm"
                      data-testid="input-gravure"
                    />
                  </div>
                </>
              )}

              {activeStep === "service" && (
                <>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type de service</p>
                  <div className="space-y-2">
                    {SERVICE_TYPES.map((svc) => (
                      <Card
                        key={svc.id}
                        className={`p-3 cursor-pointer transition-all hover-elevate ${
                          serviceType.id === svc.id ? "ring-2 ring-primary" : ""
                        }`}
                        onClick={() => setServiceType(svc)}
                        data-testid={`button-service-${svc.id}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{svc.name}</p>
                            <p className="text-xs text-muted-foreground">{svc.desc}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold">{svc.base} €</p>
                            <p className="text-[10px] text-muted-foreground">/jante</p>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </>
              )}
            </div>
          </ScrollArea>

          <div className="border-t shrink-0">
            <div className="flex items-center justify-between px-3 py-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!canPrev}
                onClick={() => canPrev && setActiveStep(steps[stepIdx - 1].id)}
                data-testid="button-step-prev"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Préc.
              </Button>
              <span className="text-xs text-muted-foreground">{stepIdx + 1}/{steps.length}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={!canNext}
                onClick={() => canNext && setActiveStep(steps[stepIdx + 1].id)}
                data-testid="button-step-next"
              >
                Suiv.
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            <div className="px-3 pb-3 space-y-2">
              <div className="space-y-0.5 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground truncate">{serviceType.name} x{wheelCount}</span>
                  <span className="font-medium shrink-0">{(serviceType.base * wheelCount).toFixed(2)} €</span>
                </div>
                {color.price > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">+ {color.name}</span>
                    <span>+{(color.price * wheelCount).toFixed(2)} €</span>
                  </div>
                )}
                {finish.price > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">+ {finish.name}</span>
                    <span>+{(finish.price * wheelCount).toFixed(2)} €</span>
                  </div>
                )}
                {size.price > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">+ Taille {size.label}</span>
                    <span>+{(size.price * wheelCount).toFixed(2)} €</span>
                  </div>
                )}
                {accessories.map(id => {
                  const a = ACCESSORIES.find(x => x.id === id);
                  if (!a) return null;
                  return (
                    <div key={id} className="flex justify-between gap-2">
                      <span className="text-muted-foreground">+ {a.name}</span>
                      <span>+{(a.price * wheelCount).toFixed(2)} €</span>
                    </div>
                  );
                })}
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Total HT : {totalHT.toFixed(2)} € | TVA : {tva.toFixed(2)} €</p>
                  <p className="text-lg font-bold" data-testid="text-total-price">{totalTTC.toFixed(2)} € <span className="text-xs font-normal text-muted-foreground">TTC</span></p>
                </div>
              </div>
              <Button
                className="w-full"
                onClick={requestQuote}
                disabled={isSubmitting}
                data-testid="button-request-quote-bottom"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                {isSubmitting ? "Envoi en cours..." : "Demander un devis"}
              </Button>
              <p className="text-[10px] text-center text-muted-foreground flex items-center justify-center gap-1">
                <Info className="h-3 w-3" />
                Prix indicatif — Devis final après expertise
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
