import { useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import {
  Bot, X, Send, Loader2, Sparkles, Wrench, Palette, HelpCircle,
  MessageCircle, Upload, Image as ImageIcon, ChevronLeft, Camera, Paintbrush, ExternalLink, Box, RotateCcw
} from "lucide-react";
import { useLocation } from "wouter";
import { Wheel3DChatFlow } from "@/components/wheel-3d-chat-flow";

import conceptClassicSilver from "@assets/wheels/concept-classic-silver.png";
import conceptSportBlack from "@assets/wheels/concept-sport-black.png";
import conceptDiamondCut from "@assets/wheels/concept-diamond-cut.png";
import conceptBronzeGold from "@assets/wheels/concept-bronze-gold.png";
import conceptGunmetal from "@assets/wheels/concept-gunmetal.png";
import conceptWhitePearl from "@assets/wheels/concept-white-pearl.png";


interface Message {
  role: "user" | "assistant";
  content: string;
  imagePreview?: string;
}

interface WheelConcept {
  src: string;
  label: string;
  style: string;
}

const WHEEL_CONCEPTS: WheelConcept[] = [
  { src: conceptClassicSilver, label: "Classique Argent", style: "Alliage 5 branches argent" },
  { src: conceptSportBlack, label: "Sport Noir Mat", style: "Multi-branches noir mat" },
  { src: conceptDiamondCut, label: "Diamond Cut", style: "Face usinée + flancs noirs" },
  { src: conceptBronzeGold, label: "Bronze Doré", style: "7 branches bronze métallisé" },
  { src: conceptGunmetal, label: "Gunmetal", style: "Y-branches gris anthracite satiné" },
  { src: conceptWhitePearl, label: "Blanc Nacré", style: "10 branches blanc brillant" },
];

const SUGGESTION_CATEGORIES = [
  {
    icon: Wrench,
    label: "Réparation",
    suggestions: [
      "Ma jante est voilée, que faire ?",
      "J'ai une fissure sur ma jante alu",
      "Mes jantes sont rayées par le trottoir",
    ],
  },
  {
    icon: Palette,
    label: "Personnalisation",
    suggestions: [
      "Je veux changer la couleur de mes jantes",
      "C'est quoi le Diamond Cut ?",
      "Peut-on agrandir la taille de mes jantes ?",
    ],
  },
  {
    icon: HelpCircle,
    label: "Aide",
    suggestions: [
      "Comment demander un devis ?",
      "Quels services proposez-vous ?",
      "Comment suivre ma réservation ?",
    ],
  },
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function compressImage(file: File, maxWidth = 1200, quality = 0.8): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = (h * maxWidth) / w;
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas non supporté"));
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const base64 = dataUrl.split(",")[1];
        resolve({ base64, mimeType: "image/jpeg" });
      };
      img.onerror = () => reject(new Error("Erreur de chargement de l'image"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Erreur de lecture du fichier"));
    reader.readAsDataURL(file);
  });
}

function imageToBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas non supporté"));
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      resolve({ base64: dataUrl.split(",")[1], mimeType: "image/jpeg" });
    };
    img.onerror = () => reject(new Error("Erreur de chargement"));
    img.src = url;
  });
}

function formatAIResponse(content: string) {
  const lines = content.split('\n');
  const elements: JSX.Element[] = [];

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<br key={`br-${i}`} />);
      return;
    }
    if (trimmed.startsWith('```')) return;

    if (trimmed.startsWith('###')) {
      elements.push(
        <p key={i} className="font-bold text-xs mt-2 mb-1">{trimmed.replace(/^###\s*/, '')}</p>
      );
    } else if (trimmed.startsWith('##')) {
      elements.push(
        <p key={i} className="font-bold text-sm mt-2 mb-1">{trimmed.replace(/^##\s*/, '')}</p>
      );
    } else if (trimmed.startsWith('- **') || trimmed.startsWith('* **')) {
      const match = trimmed.match(/^[-*]\s*\*\*(.+?)\*\*[:\s]*(.*)/);
      if (match) {
        elements.push(
          <p key={i} className="ml-2 text-xs leading-relaxed">
            <span className="font-semibold">{match[1]}</span>
            {match[2] ? `: ${match[2]}` : ''}
          </p>
        );
      } else {
        elements.push(<p key={i} className="ml-2 text-xs">{trimmed.replace(/^[-*]\s*/, '')}</p>);
      }
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      elements.push(<p key={i} className="ml-2 text-xs leading-relaxed">{trimmed.replace(/^[-*]\s*/, '')}</p>);
    } else if (trimmed.match(/^\d+\.\s/)) {
      elements.push(<p key={i} className="ml-2 text-xs leading-relaxed">{trimmed}</p>);
    } else if (trimmed.startsWith('┌') || trimmed.startsWith('│') || trimmed.startsWith('└') || trimmed.startsWith('╱') || trimmed.startsWith('╲') || trimmed.startsWith('Extérieur') || trimmed.startsWith('Rebord')) {
      elements.push(
        <pre key={i} className="text-[10px] font-mono leading-tight">{line}</pre>
      );
    } else {
      const boldParts = trimmed.split(/\*\*(.+?)\*\*/g);
      elements.push(
        <p key={i} className="text-xs leading-relaxed">
          {boldParts.map((part, idx) =>
            idx % 2 === 1 ? <strong key={idx}>{part}</strong> : <span key={idx}>{part}</span>
          )}
        </p>
      );
    }
  });

  return <div className="space-y-0.5">{elements}</div>;
}

type ChatView = "chat" | "configurator" | "concepts" | "wheel3d";

export function AIAssistant() {
  const [, navigate] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [chatView, setChatView] = useState<ChatView>("chat");
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadData, setUploadData] = useState<{ base64: string; mimeType: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (uploadPreview && uploadPreview.startsWith("blob:")) {
        URL.revokeObjectURL(uploadPreview);
      }
    };
  }, [uploadPreview]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: content.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    setActiveCategory(null);

    try {
      const res = await apiRequest("POST", "/api/ai/assistant", { messages: newMessages });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Je rencontre un souci technique momentané. Réessayez dans quelques instants, ou contactez directement le garage via la section Messages."
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading]);

  const analyzeWheel = useCallback(async (base64: string, mimeType: string, prompt: string, preview?: string) => {
    const userMessage: Message = {
      role: "user",
      content: prompt,
      imagePreview: preview,
    };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setChatView("chat");
    setUploadPreview(null);
    setUploadData(null);

    try {
      const res = await apiRequest("POST", "/api/ai/analyze-wheel", {
        imageBase64: base64,
        imageMimeType: mimeType,
        prompt,
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "L'analyse de l'image a échoué. Veuillez réessayer avec une autre photo, ou décrivez votre jante en texte."
      }]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Format non supporté. Veuillez envoyer une image au format JPG, PNG ou WEBP."
      }]);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "L'image est trop volumineuse (max 10 MB). Elle sera compressée automatiquement."
      }]);
    }

    try {
      const { base64, mimeType } = await compressImage(file);
      const previewUrl = URL.createObjectURL(file);
      setUploadPreview(previewUrl);
      setUploadData({ base64, mimeType });
      setChatView("configurator");
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Erreur lors du traitement de l'image. Veuillez réessayer."
      }]);
    }
  }, []);

  const handleConceptSelect = useCallback(async (concept: WheelConcept) => {
    try {
      setIsLoading(true);
      setChatView("chat");
      const userMsg: Message = {
        role: "user",
        content: `Je souhaite personnaliser mes jantes dans le style "${concept.label}" (${concept.style}). Quelles sont les options ?`,
        imagePreview: concept.src,
      };
      setMessages(prev => [...prev, userMsg]);

      const { base64, mimeType } = await imageToBase64(concept.src);
      const res = await apiRequest("POST", "/api/ai/analyze-wheel", {
        imageBase64: base64,
        imageMimeType: mimeType,
        prompt: `Le client s'intéresse au style de jante "${concept.label}" (${concept.style}). Décris cette jante, ses caractéristiques, les options de personnalisation possibles et comment MyJantes peut réaliser ce type de finition. Propose des variantes de couleur et de finition.`,
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Erreur lors de l'analyse du modèle. Veuillez réessayer."
      }]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadData && uploadPreview) {
      analyzeWheel(uploadData.base64, uploadData.mimeType, input || "Analyse cette jante et propose des options de personnalisation.", uploadPreview);
    } else {
      sendMessage(input);
    }
  };

  if (!isOpen) {
    return (
      <div className="fixed bottom-20 sm:bottom-6 right-6 z-[9999] flex flex-col items-end gap-3 group">
        <div className="bg-background/95 backdrop-blur-sm border shadow-xl rounded-lg p-3 max-w-[200px] animate-in fade-in slide-in-from-bottom-2 duration-500 hidden sm:block">
          <p className="text-[11px] font-medium leading-tight">
            Besoin d'aide ? <br/>
            <span className="text-primary text-[10px]">Simulateur 3D inclus !</span>
          </p>
        </div>
        <Button
          onClick={() => setIsOpen(true)}
          size="icon"
          className="h-16 w-16 rounded-full shadow-2xl hover:scale-110 transition-all duration-300 bg-primary text-primary-foreground border-4 border-background relative overflow-hidden"
          data-testid="button-ai-assistant-open"
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-primary via-primary to-white/20 animate-pulse" />
          <div className="relative flex flex-col items-center justify-center">
            <Bot className="h-6 w-6 mb-0.5" />
            <span className="text-[8px] font-bold uppercase tracking-tighter">AI 3D</span>
          </div>
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-foreground opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-primary-foreground text-primary text-[10px] font-bold items-center justify-center">!</span>
          </span>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-[9998] bg-black/40 sm:hidden" onClick={() => setIsOpen(false)} />
      <Card className="fixed bottom-0 left-0 right-0 h-[100dvh] sm:h-auto sm:inset-auto sm:bottom-6 sm:right-6 z-[9999] sm:w-[400px] sm:h-[580px] sm:max-h-[calc(100vh-3rem)] flex flex-col shadow-2xl overflow-hidden sm:rounded-xl rounded-t-xl sm:rounded-xl border-0 sm:border">
        <div className="flex items-center justify-between gap-2 p-3 border-b bg-primary text-primary-foreground sm:rounded-t-xl">
          <div className="flex items-center gap-2">
            {chatView !== "chat" && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { setChatView("chat"); setUploadPreview(null); setUploadData(null); }}
                className="text-primary-foreground no-default-hover-elevate"
                data-testid="button-configurator-back"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <Sparkles className="h-5 w-5" />
            <div>
              <h3 className="font-semibold text-sm">
                {chatView === "chat" ? "Assistant MyJantes" : chatView === "configurator" ? "Configurateur" : chatView === "wheel3d" ? "Simulateur 3D" : "Modèles"}
              </h3>
              <p className="text-xs opacity-80">
                {chatView === "chat" ? "Expert jantes - En ligne" : chatView === "configurator" ? "Analysez votre jante" : chatView === "wheel3d" ? "Configurez votre jante en 3D" : "Styles de référence"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setMessages([]);
                setChatView("chat");
                setUploadPreview(null);
                setUploadData(null);
              }}
              className="text-primary-foreground no-default-hover-elevate"
              data-testid="button-ai-assistant-clear"
              title="Nouvelle conversation"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="text-primary-foreground no-default-hover-elevate"
              data-testid="button-ai-assistant-close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {chatView === "concepts" && (
          <ScrollArea className="flex-1 p-3">
            <p className="text-xs text-muted-foreground mb-3">Sélectionnez un modèle de jante pour explorer les options de personnalisation :</p>
            <div className="grid grid-cols-2 gap-2">
              {WHEEL_CONCEPTS.map((concept, i) => (
                <Button
                  key={i}
                  variant="outline"
                  onClick={() => handleConceptSelect(concept)}
                  className="flex flex-col items-stretch text-left"
                  data-testid={`button-wheel-concept-${i}`}
                  disabled={isLoading}
                >
                  <div className="aspect-square rounded-md overflow-hidden bg-muted mb-1.5 w-full">
                    <img src={concept.src} alt={concept.label} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <p className="text-xs font-medium truncate">{concept.label}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{concept.style}</p>
                </Button>
              ))}
            </div>
          </ScrollArea>
        )}

        {chatView === "wheel3d" && (
          <Wheel3DChatFlow
            onClose={() => setIsOpen(false)}
            onBack={() => setChatView("chat")}
          />
        )}

        {chatView === "configurator" && (
          <ScrollArea className="flex-1 p-3">
            <div className="space-y-3">
              {uploadPreview ? (
                <div className="space-y-3">
                  <div className="rounded-md overflow-hidden border aspect-square bg-muted">
                    <img src={uploadPreview} alt="Votre jante" className="w-full h-full object-cover" />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">Photo prête pour analyse</p>
                  <div className="space-y-1.5">
                    <Button
                      variant="outline"
                      onClick={() => analyzeWheel(uploadData!.base64, uploadData!.mimeType, "Analyse cette jante : identifie le type, l'état, et propose des options de personnalisation (couleurs, finitions, diamond cut).", uploadPreview)}
                      className="w-full justify-start text-left text-xs flex-col items-start"
                      data-testid="button-analyze-full"
                      disabled={isLoading}
                    >
                      <span className="font-medium">Analyse complète</span>
                      <span className="text-muted-foreground font-normal">Type, état, options de personnalisation</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => analyzeWheel(uploadData!.base64, uploadData!.mimeType, "Évalue l'état de cette jante : rayures, voile, fissures, corrosion. Propose des réparations et un devis estimatif.", uploadPreview)}
                      className="w-full justify-start text-left text-xs flex-col items-start"
                      data-testid="button-analyze-repair"
                      disabled={isLoading}
                    >
                      <span className="font-medium">Diagnostic réparation</span>
                      <span className="text-muted-foreground font-normal">État, dommages, réparations nécessaires</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => analyzeWheel(uploadData!.base64, uploadData!.mimeType, "Propose des options de personnalisation pour cette jante : changement de couleur (noir mat, blanc, bronze, rouge, etc.), finitions (mat, brillant, satiné, diamond cut), hydrographie. Décris visuellement le rendu attendu pour chaque option.", uploadPreview)}
                      className="w-full justify-start text-left text-xs flex-col items-start"
                      data-testid="button-analyze-custom"
                      disabled={isLoading}
                    >
                      <span className="font-medium">Personnalisation</span>
                      <span className="text-muted-foreground font-normal">Couleurs, finitions, rendu visuel</span>
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => { setUploadPreview(null); setUploadData(null); }}
                    data-testid="button-change-photo"
                  >
                    Changer de photo
                  </Button>
                </div>
              ) : (
                <div
                  className={`border-2 border-dashed rounded-md p-6 text-center transition-colors ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'}`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                >
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium mb-1">Déposez votre photo ici</p>
                  <p className="text-xs text-muted-foreground mb-3">JPG, PNG ou WEBP - Max 10 MB</p>
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="button-upload-photo"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Choisir une photo
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file);
                      e.target.value = "";
                    }}
                    data-testid="input-file-upload"
                  />
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        {chatView === "chat" && (
          <ScrollArea className="flex-1 p-3">
            {messages.length === 0 ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="bg-primary/20 text-primary text-xs">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-muted rounded-lg p-3 text-sm">
                    <p className="font-medium mb-1">Bonjour ! Je suis l'assistant MyJantes.</p>
                    <p className="text-xs text-muted-foreground">Expert en jantes automobiles, je peux vous conseiller sur la réparation, la personnalisation et l'entretien de vos jantes.</p>
                  </div>
                </div>

                <div className="pl-10 space-y-2">
                  <div className="flex gap-1.5 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => setChatView("configurator")}
                      data-testid="button-open-configurator"
                    >
                      <Camera className="h-3.5 w-3.5 mr-1 shrink-0" />
                      <span className="truncate">Analyser</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => setChatView("concepts")}
                      data-testid="button-open-concepts"
                    >
                      <ImageIcon className="h-3.5 w-3.5 mr-1 shrink-0" />
                      <span className="truncate">Modèles</span>
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => setChatView("wheel3d")}
                      data-testid="button-open-3d-configurator"
                    >
                      <Box className="h-3.5 w-3.5 mr-1 shrink-0" />
                      <span className="truncate">Simulateur 3D</span>
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground font-medium mt-2">Ou choisissez un sujet :</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGGESTION_CATEGORIES.map((cat, i) => (
                      <Badge
                        key={i}
                        variant={activeCategory === i ? "default" : "outline"}
                        className="cursor-pointer text-xs"
                        onClick={() => setActiveCategory(activeCategory === i ? null : i)}
                        data-testid={`badge-category-${i}`}
                      >
                        <cat.icon className="h-3 w-3 mr-1" />
                        {cat.label}
                      </Badge>
                    ))}
                  </div>

                  {activeCategory !== null && (
                    <div className="space-y-1.5 mt-2">
                      {SUGGESTION_CATEGORIES[activeCategory].suggestions.map((suggestion, j) => (
                        <Button
                          key={j}
                          variant="outline"
                          size="sm"
                          onClick={() => sendMessage(suggestion)}
                          className="w-full justify-start text-left text-xs"
                          data-testid={`button-ai-suggestion-${activeCategory}-${j}`}
                        >
                          {suggestion}
                        </Button>
                      ))}
                    </div>
                  )}

                  {activeCategory === null && (
                    <div className="space-y-1.5 mt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => sendMessage("Quels services proposez-vous ?")}
                        className="w-full justify-start text-left text-xs"
                        data-testid="button-ai-quick-services"
                      >
                        Quels services proposez-vous ?
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => sendMessage("Ma jante est abîmée, que conseillez-vous ?")}
                        className="w-full justify-start text-left text-xs"
                        data-testid="button-ai-quick-repair"
                      >
                        Ma jante est abîmée, que conseillez-vous ?
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} gap-2`}>
                    {msg.role === "assistant" && (
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="bg-primary/20 text-primary text-xs">
                          <Bot className="h-3 w-3" />
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className={`rounded-lg p-2.5 max-w-[85%] ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}>
                      {msg.imagePreview && (
                        <div className="rounded-md overflow-hidden mb-2 max-w-[160px]">
                          <img src={msg.imagePreview} alt="Jante" className="w-full h-auto" />
                        </div>
                      )}
                      {msg.role === "assistant" ? (
                        formatAIResponse(msg.content)
                      ) : (
                        <p className="whitespace-pre-wrap break-words text-sm">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex items-start gap-2">
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarFallback className="bg-primary/20 text-primary text-xs">
                        <Bot className="h-3 w-3" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="bg-muted rounded-lg p-2.5 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-xs text-muted-foreground">Analyse en cours...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>
        )}

        {chatView === "chat" && (
          <div className="border-t">
            {uploadPreview && (
              <div className="px-3 pt-2 flex items-center gap-2">
                <div className="h-10 w-10 rounded-md overflow-hidden border shrink-0">
                  <img src={uploadPreview} alt="Preview" className="w-full h-full object-cover" />
                </div>
                <p className="text-xs text-muted-foreground flex-1 truncate">Photo attachée</p>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { setUploadPreview(null); setUploadData(null); }}
                  data-testid="button-remove-preview"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
            <form onSubmit={handleSubmit} className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setChatView("configurator")}
                data-testid="button-attach-photo"
                title="Envoyer une photo de jante"
              >
                <Camera className="h-4 w-4" />
              </Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={uploadData ? "Décrivez la personnalisation souhaitée..." : "Décrivez votre besoin..."}
                className="flex-1 text-sm"
                disabled={isLoading}
                data-testid="input-ai-message"
              />
              <Button
                type="submit"
                size="icon"
                disabled={(!input.trim() && !uploadData) || isLoading}
                data-testid="button-ai-send"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        )}
      </Card>
    </>
  );
}
