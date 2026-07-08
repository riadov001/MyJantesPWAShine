import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ImageZoomDialog } from "@/components/image-zoom-dialog";
import {
  Image, Search, Download, Trash2, Edit3, Link2, Upload, ChevronLeft, ChevronRight,
  CheckSquare, X, Filter, FileText, Receipt, HardDrive, Cloud, Loader2
} from "lucide-react";

interface GalleryItem {
  id: string;
  file_path: string;
  file_name: string;
  file_type: string;
  created_at: string;
  source_type: "quote" | "invoice";
  reference: string;
  source_id: string;
}

interface GalleryResponse {
  items: GalleryItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function getStorageLabel(filePath: string): string {
  if (filePath.startsWith("/objects/")) return "Object Storage";
  if (filePath.startsWith("/gdrive/")) return "Google Drive";
  if (filePath.startsWith("/r2/") || filePath.startsWith("https://")) return "Cloudflare R2";
  return "Local";
}

function getStorageVariant(filePath: string): "default" | "secondary" | "outline" | "destructive" {
  if (filePath.startsWith("/objects/")) return "default";
  if (filePath.startsWith("/gdrive/")) return "secondary";
  return "outline";
}

export default function AdminGallery() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sourceType, setSourceType] = useState<string>("all");
  const [storageBackend, setStorageBackend] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [renameDialog, setRenameDialog] = useState<GalleryItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [associateDialog, setAssociateDialog] = useState<GalleryItem | null>(null);
  const [associateType, setAssociateType] = useState<string>("quote");
  const [associateId, setAssociateId] = useState("");
  const [importDialog, setImportDialog] = useState(false);
  const [importTargetType, setImportTargetType] = useState<string>("quote");
  const [importTargetId, setImportTargetId] = useState("");
  const [importFiles, setImportFiles] = useState<FileList | null>(null);
  const [selectMode, setSelectMode] = useState(false);

  const queryParams = new URLSearchParams();
  queryParams.set("page", String(page));
  queryParams.set("limit", "10");
  if (search) queryParams.set("search", search);
  if (sourceType !== "all") queryParams.set("sourceType", sourceType);
  if (storageBackend !== "all") queryParams.set("storageBackend", storageBackend);
  if (dateFrom) queryParams.set("dateFrom", dateFrom);
  if (dateTo) queryParams.set("dateTo", dateTo);

  const { data, isLoading } = useQuery<GalleryResponse>({
    queryKey: ["/api/admin/gallery", page, search, sourceType, storageBackend, dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`/api/admin/gallery?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Erreur chargement galerie");
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (items: { id: string; filePath: string; sourceType: string }[]) => {
      const res = await apiRequest("POST", "/api/admin/gallery/bulk-delete", { items });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `${data.deleted} photo(s) supprimée(s)` });
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/admin/gallery"] });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, newName, sourceType }: { id: string; newName: string; sourceType: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/gallery/${id}/rename`, { newName, sourceType });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Photo renommée" });
      setRenameDialog(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/gallery"] });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const associateMutation = useMutation({
    mutationFn: async ({ id, sourceType, currentSourceType, targetId }: any) => {
      const res = await apiRequest("PATCH", `/api/admin/gallery/${id}/associate`, { sourceType, currentSourceType, targetId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Photo associée" });
      setAssociateDialog(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/gallery"] });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const importMutation = useMutation({
    mutationFn: async ({ files, targetType, targetId }: { files: FileList; targetType: string; targetId: string }) => {
      const formData = new FormData();
      formData.append("targetType", targetType);
      formData.append("targetId", targetId);
      Array.from(files).forEach((f) => formData.append("photos", f));
      const res = await fetch("/api/admin/gallery/import", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Erreur import");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `${data.imported}/${data.total} photo(s) importée(s)` });
      setImportDialog(false);
      setImportFiles(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/gallery"] });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const handleExport = useCallback(async () => {
    if (selected.size === 0 || !data) return;
    const items = data.items
      .filter((i) => selected.has(i.id))
      .map((i) => ({ id: i.id, filePath: i.file_path, fileName: i.file_name }));
    try {
      const res = await fetch("/api/admin/gallery/bulk-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `galerie-export-${new Date().toISOString().split("T")[0]}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `${items.length} photo(s) exportée(s)` });
    } catch (err: any) {
      toast({ title: "Erreur export", description: err.message, variant: "destructive" });
    }
  }, [selected, data, toast]);

  const handleDelete = useCallback(() => {
    if (selected.size === 0 || !data) return;
    const items = data.items
      .filter((i) => selected.has(i.id))
      .map((i) => ({ id: i.id, filePath: i.file_path, sourceType: i.source_type }));
    deleteMutation.mutate(items);
  }, [selected, data, deleteMutation]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (!data) return;
    if (selected.size === data.items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.items.map((i) => i.id)));
    }
  };

  const applySearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const { data: quotesData } = useQuery<any[]>({
    queryKey: ["/api/admin/quotes-list"],
    queryFn: async () => {
      const res = await fetch("/api/admin/quotes?limit=500", { credentials: "include" });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.quotes || [];
    },
    enabled: associateDialog !== null || importDialog,
  });

  const { data: invoicesData } = useQuery<any[]>({
    queryKey: ["/api/admin/invoices-list"],
    queryFn: async () => {
      const res = await fetch("/api/admin/invoices?limit=500", { credentials: "include" });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.invoices || [];
    },
    enabled: associateDialog !== null || importDialog,
  });

  return (
    <div className="p-4 space-y-4 h-full overflow-y-auto" data-testid="page-gallery">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Image className="h-5 w-5" />
          <h1 className="text-xl font-semibold" data-testid="text-gallery-title">Galerie Photos</h1>
          {data && (
            <Badge variant="secondary" data-testid="badge-total-photos">{data.total} photos</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setShowFilters(!showFilters)} data-testid="button-toggle-filters">
            <Filter className="h-4 w-4 mr-1" /> Filtres
          </Button>
          <Button variant="outline" onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }} data-testid="button-toggle-select">
            <CheckSquare className="h-4 w-4 mr-1" /> {selectMode ? "Annuler" : "Sélectionner"}
          </Button>
          {!selectMode && data && data.items.length > 0 && (
            <Button
              variant="outline"
              onClick={() => { setSelectMode(true); setSelected(new Set(data.items.map((i) => i.id))); }}
              data-testid="button-select-all-quick"
            >
              <CheckSquare className="h-4 w-4 mr-1" /> Tout
            </Button>
          )}
          <Button onClick={() => setImportDialog(true)} data-testid="button-import-photos">
            <Upload className="h-4 w-4 mr-1" /> Importer
          </Button>
        </div>
      </div>

      {showFilters && (
        <Card data-testid="card-filters">
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <Label>Recherche</Label>
                <div className="flex gap-1">
                  <Input
                    placeholder="Référence ou nom..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && applySearch()}
                    data-testid="input-search"
                  />
                  <Button size="icon" variant="outline" onClick={applySearch} data-testid="button-search">
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label>Type</Label>
                <Select value={sourceType} onValueChange={(v) => { setSourceType(v); setPage(1); }}>
                  <SelectTrigger data-testid="select-source-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="quote">Devis</SelectItem>
                    <SelectItem value="invoice">Factures</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Stockage</Label>
                <Select value={storageBackend} onValueChange={(v) => { setStorageBackend(v); setPage(1); }}>
                  <SelectTrigger data-testid="select-storage"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="object_storage">Object Storage</SelectItem>
                    <SelectItem value="google_drive">Google Drive</SelectItem>
                    <SelectItem value="r2">Cloudflare R2</SelectItem>
                    <SelectItem value="local">Local</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Du</Label>
                <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} data-testid="input-date-from" />
              </div>
              <div>
                <Label>Au</Label>
                <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} data-testid="input-date-to" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {selectMode && (
        <div className="flex items-center gap-2 p-2 bg-muted rounded-md flex-wrap">
          <span className="text-sm font-medium">{selected.size} sélectionné(s)</span>
          <Button size="sm" variant="outline" onClick={selectAll} data-testid="button-select-all">
            {selected.size > 0 && selected.size === (data?.items.length || 0) ? "Tout désélectionner" : "Tout sélectionner"}
          </Button>
          {selected.size > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={handleExport} data-testid="button-export">
                <Download className="h-3 w-3 mr-1" /> Exporter ZIP
              </Button>
              <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending} data-testid="button-bulk-delete">
                <Trash2 className="h-3 w-3 mr-1" /> Supprimer
              </Button>
            </>
          )}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && data.items.length === 0 && !isLoading && (
        <div className="text-center py-20 text-muted-foreground">
          <Image className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>Aucune photo trouvée</p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {data.items.map((item) => (
            <Card
              key={item.id}
              className={`group relative cursor-pointer overflow-visible transition-shadow ${selected.has(item.id) ? "ring-2 ring-primary" : ""}`}
              data-testid={`card-photo-${item.id}`}
            >
              <div className="relative aspect-square overflow-hidden rounded-t-md">
                {selectMode && (
                  <div className="absolute top-2 left-2 z-10">
                    <Checkbox
                      checked={selected.has(item.id)}
                      onCheckedChange={() => toggleSelect(item.id)}
                      data-testid={`checkbox-photo-${item.id}`}
                    />
                  </div>
                )}
                {item.file_type === "image" || !item.file_type?.includes("document") ? (
                  <img
                    src={`/api/media/serve?path=${encodeURIComponent(item.file_path)}`}
                    alt={item.file_name || "Photo"}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onClick={() => !selectMode && setZoomImage(`/api/media/serve?path=${encodeURIComponent(item.file_path)}`)}
                    onError={(e) => { (e.target as HTMLImageElement).src = ""; (e.target as HTMLImageElement).style.display = "none"; }}
                    data-testid={`img-photo-${item.id}`}
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center bg-muted"
                    onClick={() => !selectMode && window.open(`/api/media/serve?path=${encodeURIComponent(item.file_path)}`, "_blank")}
                  >
                    <FileText className="h-10 w-10 text-muted-foreground" />
                  </div>
                )}
              </div>
              <CardContent className="p-2 space-y-1">
                <p className="text-xs font-medium truncate" title={item.file_name} data-testid={`text-filename-${item.id}`}>
                  {item.file_name || item.file_path.split("/").pop()}
                </p>
                <div className="flex items-center gap-1 flex-wrap">
                  <Badge variant={item.source_type === "quote" ? "secondary" : "outline"} className="text-[10px] px-1 py-0">
                    {item.source_type === "quote" ? <FileText className="h-2.5 w-2.5 mr-0.5" /> : <Receipt className="h-2.5 w-2.5 mr-0.5" />}
                    {item.reference || "N/A"}
                  </Badge>
                  <Badge variant={getStorageVariant(item.file_path)} className="text-[10px] px-1 py-0">
                    {item.file_path.startsWith("/objects/") ? <Cloud className="h-2.5 w-2.5 mr-0.5" /> : <HardDrive className="h-2.5 w-2.5 mr-0.5" />}
                    {getStorageLabel(item.file_path).split(" ")[0]}
                  </Badge>
                </div>
                <div className="flex gap-0.5 invisible group-hover:visible">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={(e) => { e.stopPropagation(); setRenameDialog(item); setRenameValue(item.file_name || ""); }}
                    data-testid={`button-rename-${item.id}`}
                  >
                    <Edit3 className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={(e) => { e.stopPropagation(); setAssociateDialog(item); setAssociateType(item.source_type); setAssociateId(item.source_id); }}
                    data-testid={`button-associate-${item.id}`}
                  >
                    <Link2 className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate([{ id: item.id, filePath: item.file_path, sourceType: item.source_type }]);
                    }}
                    data-testid={`button-delete-${item.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            data-testid="button-prev-page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground" data-testid="text-page-info">
            Page {data.page} / {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.totalPages}
            onClick={() => setPage(page + 1)}
            data-testid="button-next-page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {zoomImage && (
        <ImageZoomDialog
          imageSrc={zoomImage}
          isOpen={!!zoomImage}
          onClose={() => setZoomImage(null)}
        />
      )}

      <Dialog open={!!renameDialog} onOpenChange={() => setRenameDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renommer la photo</DialogTitle>
            <DialogDescription>Entrez un nouveau nom pour cette photo.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Nouveau nom..."
            data-testid="input-rename"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialog(null)}>Annuler</Button>
            <Button
              onClick={() => renameDialog && renameMutation.mutate({ id: renameDialog.id, newName: renameValue, sourceType: renameDialog.source_type })}
              disabled={renameMutation.isPending}
              data-testid="button-confirm-rename"
            >
              Renommer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!associateDialog} onOpenChange={() => setAssociateDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Associer la photo</DialogTitle>
            <DialogDescription>Choisissez un devis ou une facture pour associer cette photo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Type</Label>
              <Select value={associateType} onValueChange={setAssociateType}>
                <SelectTrigger data-testid="select-associate-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="quote">Devis</SelectItem>
                  <SelectItem value="invoice">Facture</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{associateType === "quote" ? "Devis" : "Facture"}</Label>
              <Select value={associateId} onValueChange={setAssociateId}>
                <SelectTrigger data-testid="select-associate-target"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                <SelectContent>
                  {associateType === "quote"
                    ? (quotesData || []).slice(0, 50).map((q: any) => (
                        <SelectItem key={q.id} value={q.id}>{q.reference}</SelectItem>
                      ))
                    : (invoicesData || []).slice(0, 50).map((i: any) => (
                        <SelectItem key={i.id} value={i.id}>{i.invoiceNumber || i.invoice_number}</SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssociateDialog(null)}>Annuler</Button>
            <Button
              onClick={() => associateDialog && associateMutation.mutate({
                id: associateDialog.id,
                sourceType: associateType,
                currentSourceType: associateDialog.source_type,
                targetId: associateId,
              })}
              disabled={associateMutation.isPending || !associateId}
              data-testid="button-confirm-associate"
            >
              Associer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importDialog} onOpenChange={setImportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importer des photos</DialogTitle>
            <DialogDescription>Les photos seront redimensionnées (max 2000px), renommées selon la référence, et filigranées automatiquement.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Type de cible</Label>
              <Select value={importTargetType} onValueChange={setImportTargetType}>
                <SelectTrigger data-testid="select-import-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="quote">Devis</SelectItem>
                  <SelectItem value="invoice">Facture</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{importTargetType === "quote" ? "Devis cible" : "Facture cible"}</Label>
              <Select value={importTargetId} onValueChange={setImportTargetId}>
                <SelectTrigger data-testid="select-import-target"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                <SelectContent>
                  {importTargetType === "quote"
                    ? (quotesData || []).slice(0, 50).map((q: any) => (
                        <SelectItem key={q.id} value={q.id}>{q.reference}</SelectItem>
                      ))
                    : (invoicesData || []).slice(0, 50).map((i: any) => (
                        <SelectItem key={i.id} value={i.id}>{i.invoiceNumber || i.invoice_number}</SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Photos (max 50)</Label>
              <Input
                type="file"
                multiple
                accept="image/*,.pdf"
                onChange={(e) => setImportFiles(e.target.files)}
                data-testid="input-import-files"
              />
              {importFiles && (
                <p className="text-xs text-muted-foreground mt-1">{importFiles.length} fichier(s) sélectionné(s)</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialog(false)}>Annuler</Button>
            <Button
              onClick={() => importFiles && importMutation.mutate({ files: importFiles, targetType: importTargetType, targetId: importTargetId })}
              disabled={importMutation.isPending || !importFiles || !importTargetId}
              data-testid="button-confirm-import"
            >
              {importMutation.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Import en cours...</> : "Importer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
