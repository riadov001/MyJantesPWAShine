import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Inbox,
  Phone,
  Mail,
  Car,
  Wrench,
  MessageSquare,
  Image,
  UserPlus,
  FileText,
  Eye,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Clock,
  RefreshCw,
  Globe,
  AlertCircle,
} from "lucide-react";
import type { QuoteRequest } from "@shared/schema";

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  if (status === "new") return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-0">Nouveau</Badge>;
  if (status === "viewed") return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 border-0">Vu</Badge>;
  if (status === "converted") return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-0">Converti</Badge>;
  if (status === "cancelled") return <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-0">Annulé</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function PhotoGallery({ photos }: { photos: string[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  if (!photos || photos.length === 0) return <span className="text-sm text-muted-foreground italic">Aucune photo</span>;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {photos.map((url, i) => (
          <button
            key={i}
            onClick={() => setSelected(url)}
            className="w-16 h-16 rounded-md overflow-hidden border hover:ring-2 ring-primary transition-all"
          >
            <img src={url} alt={`photo ${i + 1}`} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Photo client</DialogTitle></DialogHeader>
          {selected && <img src={selected} alt="photo" className="w-full rounded-lg object-contain max-h-[70vh]" />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ConvertModal({
  request,
  onClose,
  onConverted,
}: {
  request: QuoteRequest;
  onClose: () => void;
  onConverted: (quoteId: string) => void;
}) {
  const { toast } = useToast();
  const [quoteDescription, setQuoteDescription] = useState(
    [
      request.service ? `Service : ${request.service}` : null,
      request.vehicleInfo ? `Véhicule : ${request.vehicleInfo}` : null,
      request.message ? `Message client :\n${request.message}` : null,
    ]
      .filter(Boolean)
      .join("\n\n") || ""
  );
  const [quoteAmount, setQuoteAmount] = useState("0");
  const [notes, setNotes] = useState("");

  const convertMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/quote-requests/${request.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ quoteDescription, quoteAmount, notes }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Erreur conversion");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "✅ Converti !", description: `Devis ${data.quoteReference} créé avec succès.` });
      onConverted(data.quoteId);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Erreur", description: err.message });
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            Convertir en client + devis
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
            <p className="font-medium">{request.firstName} {request.lastName}</p>
            {request.email && <p className="text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{request.email}</p>}
            {request.phone && <p className="text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{request.phone}</p>}
          </div>

          <div className="space-y-2">
            <Label>Description du devis</Label>
            <Textarea
              value={quoteDescription}
              onChange={(e) => setQuoteDescription(e.target.value)}
              rows={5}
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label>Montant estimé (€ TTC)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={quoteAmount}
              onChange={(e) => setQuoteAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Notes internes (optionnel)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Remarques pour l'équipe…"
            />
          </div>

          {(request.photos as string[])?.length > 0 && (
            <div className="space-y-2">
              <Label>Photos ({(request.photos as string[]).length})</Label>
              <PhotoGallery photos={request.photos as string[]} />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button
            onClick={() => convertMutation.mutate()}
            disabled={convertMutation.isPending}
            className="gap-2"
          >
            {convertMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Créer client + devis
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestCard({
  request,
  onRefresh,
}: {
  request: QuoteRequest;
  onRefresh: () => void;
}) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [converting, setConverting] = useState(false);

  const statusMutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await fetch(`/api/admin/quote-requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Erreur");
      return res.json();
    },
    onSuccess: () => onRefresh(),
    onError: () => toast({ variant: "destructive", title: "Erreur lors de la mise à jour" }),
  });

  const photos = (request.photos as string[]) || [];

  return (
    <>
      <Card className={`transition-all hover:shadow-md ${request.status === "new" ? "border-primary/40 shadow-sm" : ""}`}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">
                {request.firstName || request.lastName
                  ? `${request.firstName || ""} ${request.lastName || ""}`.trim()
                  : <span className="text-muted-foreground italic">Anonyme</span>}
              </span>
              <StatusBadge status={request.status || "new"} />
              {request.source === "website" && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Globe className="w-3 h-3" /> Site vitrine
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
              <Clock className="w-3 h-3" />{formatDate(request.createdAt?.toString())}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {request.email && (
              <a href={`mailto:${request.email}`} className="flex items-center gap-1 text-primary hover:underline truncate">
                <Mail className="w-3.5 h-3.5 shrink-0" />{request.email}
              </a>
            )}
            {request.phone && (
              <a href={`tel:${request.phone}`} className="flex items-center gap-1 text-primary hover:underline">
                <Phone className="w-3.5 h-3.5 shrink-0" />{request.phone}
              </a>
            )}
            {request.service && (
              <span className="flex items-center gap-1 text-muted-foreground col-span-2">
                <Wrench className="w-3.5 h-3.5 shrink-0 text-orange-500" />
                <span className="font-medium text-foreground">{request.service}</span>
              </span>
            )}
            {request.vehicleInfo && (
              <span className="flex items-center gap-1 text-muted-foreground col-span-2">
                <Car className="w-3.5 h-3.5 shrink-0" />{request.vehicleInfo}
              </span>
            )}
          </div>

          {request.message && (
            <div className="bg-muted/40 rounded-md p-2 text-sm">
              <MessageSquare className="w-3.5 h-3.5 inline mr-1 text-muted-foreground" />
              <span className="text-muted-foreground">{request.message}</span>
            </div>
          )}

          {photos.length > 0 && (
            <div className="flex items-center gap-2">
              <Image className="w-3.5 h-3.5 text-muted-foreground" />
              <PhotoGallery photos={photos} />
            </div>
          )}

          {request.status === "converted" && request.convertedQuoteId && (
            <button
              onClick={() => navigate(`/admin/quotes`)}
              className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 hover:underline"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Devis créé — voir les devis
              <ChevronRight className="w-3 h-3" />
            </button>
          )}

          <div className="flex flex-wrap gap-2 pt-1 border-t">
            {request.status === "new" && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-xs"
                onClick={() => statusMutation.mutate("viewed")}
                disabled={statusMutation.isPending}
              >
                <Eye className="w-3.5 h-3.5" /> Marquer vu
              </Button>
            )}
            {request.status !== "converted" && request.status !== "cancelled" && (
              <Button
                size="sm"
                className="gap-1 text-xs bg-primary text-white hover:bg-primary/90"
                onClick={() => setConverting(true)}
              >
                <FileText className="w-3.5 h-3.5" /> Convertir en devis
              </Button>
            )}
            {request.status !== "cancelled" && request.status !== "converted" && (
              <Button
                size="sm"
                variant="ghost"
                className="gap-1 text-xs text-destructive hover:text-destructive"
                onClick={() => statusMutation.mutate("cancelled")}
                disabled={statusMutation.isPending}
              >
                <XCircle className="w-3.5 h-3.5" /> Annuler
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {converting && (
        <ConvertModal
          request={request}
          onClose={() => setConverting(false)}
          onConverted={(quoteId) => {
            setConverting(false);
            onRefresh();
            navigate("/admin/quotes");
          }}
        />
      )}
    </>
  );
}

export default function AdminQuoteRequests() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: requests = [], isLoading, refetch } = useQuery<QuoteRequest[]>({
    queryKey: ["/api/admin/quote-requests", statusFilter],
    queryFn: async () => {
      const url = statusFilter !== "all"
        ? `/api/admin/quote-requests?status=${statusFilter}`
        : "/api/admin/quote-requests";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Erreur chargement demandes");
      return res.json();
    },
  });

  const newCount = requests.filter((r) => r.status === "new").length;
  const convertedCount = requests.filter((r) => r.status === "converted").length;
  const viewedCount = requests.filter((r) => r.status === "viewed").length;

  const filtered = statusFilter === "all" ? requests : requests;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/quote-requests"] });
    refetch();
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Inbox className="w-6 h-6 text-primary" />
            Demandes de devis
            {newCount > 0 && (
              <span className="ml-1 bg-primary text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {newCount}
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Demandes reçues depuis le site vitrine myjantes.fr
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={handleRefresh}>
          <RefreshCw className="w-4 h-4" /> Actualiser
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertCircle className="w-4.5 h-4.5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Nouveaux</p>
              <p className="text-xl font-bold text-red-600 dark:text-red-400">{newCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
              <Eye className="w-4.5 h-4.5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vus</p>
              <p className="text-xl font-bold">{viewedCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="w-4.5 h-4.5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Convertis</p>
              <p className="text-xl font-bold text-green-600 dark:text-green-400">{convertedCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
              <Inbox className="w-4.5 h-4.5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-xl font-bold">{requests.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="all">Tous</TabsTrigger>
          <TabsTrigger value="new" className="gap-1">
            Nouveaux
            {newCount > 0 && <span className="bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{newCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="viewed">Vus</TabsTrigger>
          <TabsTrigger value="converted">Convertis</TabsTrigger>
          <TabsTrigger value="cancelled">Annulés</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Aucune demande</p>
          <p className="text-sm">Les demandes du site vitrine apparaîtront ici.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((req) => (
            <RequestCard key={req.id} request={req} onRefresh={handleRefresh} />
          ))}
        </div>
      )}

      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Globe className="w-4 h-4" /> Intégration site vitrine
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <p>
            <span className="font-mono bg-muted px-1 rounded">POST https://pwapp.myjantes.fr/api/public/website-quote-request</span>
          </p>
          <p>En-tête requis : <span className="font-mono bg-muted px-1 rounded">x-webhook-secret: myjantes-webhook-2026</span></p>
          <p>Champs JSON : <span className="font-mono bg-muted px-1 rounded">firstName, lastName, email, phone, service, message, vehicleInfo, photos[]</span></p>
          <p className="text-primary">→ Configurez <span className="font-mono">WEBSITE_WEBHOOK_SECRET</span> dans les variables d'environnement pour changer le secret.</p>
        </CardContent>
      </Card>
    </div>
  );
}
