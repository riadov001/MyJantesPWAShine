import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Download, Trash2, Archive, HardDrive, FileImage, RefreshCw,
  Plus, AlertTriangle, Database, Upload, FileJson, ImageIcon, AlertCircle
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";

interface Backup {
  name: string;
  isArchive: boolean;
  size: number;
  sizeFormatted: string;
  createdAt: string;
  date: string | null;
}

interface BackupStats {
  filesOnDisk: number;
  totalSize: number;
  totalSizeFormatted: string;
  quoteMediaCount: number;
  invoiceMediaCount: number;
}

interface MediaScanResult {
  total: number;
  accessible: number;
  broken: number;
  uploadsBroken: number;
  objectsBroken: number;
  brokenItems: Array<{ id: string; table: string; file_path: string; file_name: string; reason: string }>;
}

export default function AdminBackups() {
  const { toast } = useToast();
  const { isSuperAdmin } = useAuth();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [mediaScanResult, setMediaScanResult] = useState<MediaScanResult | null>(null);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  const dataImportRef = useRef<HTMLInputElement>(null);
  const sqlImportRef = useRef<HTMLInputElement>(null);
  const mediaImportRef = useRef<HTMLInputElement>(null);

  const { data: backupsData, isLoading: backupsLoading, refetch: refetchBackups } = useQuery<{ backups: Backup[] }>({
    queryKey: ["/api/admin/backups"],
  });

  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } = useQuery<BackupStats>({
    queryKey: ["/api/admin/backups/stats"],
  });

  const createBackupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/backups");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Sauvegarde créée",
        description: `${data.backup.name} (${data.backup.fileCount} fichiers, ${data.backup.sizeFormatted})`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backups"] });
      refetchStats();
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const clearCacheMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/cache/clear", {});
    },
    onSuccess: () => {
      toast({ title: "Succès", description: "Cache vidé avec succès" });
      if (typeof window !== "undefined") {
        localStorage.clear();
        sessionStorage.clear();
      }
      queryClient.clear();
      window.location.reload();
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message || "Échec du vidage du cache", variant: "destructive" });
    },
  });

  const deleteBackupMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("DELETE", `/api/admin/backups/${encodeURIComponent(name)}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sauvegarde supprimée", description: "La sauvegarde a été supprimée avec succès." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backups"] });
      setDeleteConfirm(null);
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const scanBrokenMediaMutation = useMutation({
    mutationFn: async (): Promise<MediaScanResult> => {
      const res = await fetch("/api/admin/media/scan-broken", { credentials: "include" });
      if (!res.ok) throw new Error("Erreur lors du scan");
      return res.json();
    },
    onSuccess: (data) => {
      setMediaScanResult(data);
      toast({
        title: "Scan terminé",
        description: `${data.total} médias analysés — ${data.accessible} accessibles, ${data.broken} inaccessibles`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur scan médias", description: error.message, variant: "destructive" });
    },
  });

  const cleanupBrokenMediaMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/admin/media/cleanup-broken");
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Nettoyage terminé",
        description: `${data.deletedCount} entrées supprimées (${data.quoteMediaDeleted} devis + ${data.invoiceMediaDeleted} factures)`,
      });
      setMediaScanResult(null);
      setShowCleanupConfirm(false);
    },
    onError: (error: Error) => {
      toast({ title: "Erreur nettoyage", description: error.message, variant: "destructive" });
    },
  });

  const syncProdDbMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/db/sync-prod", {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Prod \u2192 Dev r\u00e9ussie", description: data.message });
      queryClient.invalidateQueries();
      refetchStats();
    },
    onError: (error: Error) => {
      toast({ title: "Erreur de synchronisation Prod \u2192 Dev", description: error.message, variant: "destructive" });
    },
  });

  const syncDevToProdMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/db/sync-dev-to-prod", {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Dev \u2192 Prod r\u00e9ussie", description: data.message });
      queryClient.invalidateQueries();
      refetchStats();
    },
    onError: (error: Error) => {
      toast({ title: "Erreur de synchronisation Dev \u2192 Prod", description: error.message, variant: "destructive" });
    },
  });

  const importDataMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/import-data", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Erreur inconnue" }));
        throw new Error(err.message || `Erreur ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      const summary = Object.entries(data.results || {})
        .map(([table, r]: [string, any]) => `${table}: ${r.imported} importés`)
        .join(", ");
      toast({
        title: "Import terminé",
        description: summary || "Aucune donnée importée",
      });
      queryClient.invalidateQueries();
      refetchStats();
    },
    onError: (error: Error) => {
      toast({ title: "Erreur d'import", description: error.message, variant: "destructive" });
    },
  });

  const importSqlMutation = useMutation({
    mutationFn: async ({ file, replaceExisting }: { file: File; replaceExisting: boolean }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("replaceExisting", String(replaceExisting));
      const res = await fetch("/api/admin/import-sql", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Erreur inconnue" }));
        throw new Error(err.message || `Erreur ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      const summary = Object.entries(data.results || {})
        .map(([table, r]: [string, any]) => `${table}: ${r.imported} ajoutés, ${r.skipped} ignorés${r.errors ? `, ${r.errors} erreurs` : ''}`)
        .join("\n");
      toast({
        title: "Import SQL terminé",
        description: summary || "Aucune donnée importée",
      });
      queryClient.invalidateQueries();
      refetchStats();
    },
    onError: (error: Error) => {
      toast({ title: "Erreur d'import SQL", description: error.message, variant: "destructive" });
    },
  });

  const importMediaMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/import-media", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Erreur inconnue" }));
        throw new Error(err.message || `Erreur ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Import médias terminé",
        description: `${data.copiedCount} fichiers importés, ${data.skippedCount} ignorés (déjà présents)`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backups"] });
      refetchStats();
    },
    onError: (error: Error) => {
      toast({ title: "Erreur d'import médias", description: error.message, variant: "destructive" });
    },
  });

  const handleDownloadBackup = async (name: string) => {
    setIsDownloading(name);
    try {
      const res = await fetch(`/api/admin/backups/${encodeURIComponent(name)}/download`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Téléchargement échoué");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsDownloading(null);
    }
  };

  const handleDownloadData = async () => {
    setIsDownloading("data-export");
    try {
      const res = await fetch("/api/admin/export-data", { credentials: "include" });
      if (!res.ok) throw new Error("Téléchargement échoué");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `myjantes-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Export terminé", description: "Le fichier de données a été téléchargé" });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsDownloading(null);
    }
  };

  const handleDownloadSQL = async () => {
    setIsDownloading("sql-export");
    try {
      const res = await fetch("/api/admin/export-database", { credentials: "include" });
      if (!res.ok) throw new Error("Téléchargement échoué");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `myjantes-export-${new Date().toISOString().slice(0, 10)}.sql`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Export SQL terminé", description: "Le fichier SQL a été téléchargé" });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsDownloading(null);
    }
  };

  const handleDataImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".json")) {
      toast({ title: "Format invalide", description: "Veuillez sélectionner un fichier .json", variant: "destructive" });
      return;
    }
    if (confirm("Voulez-vous importer ces données ? Les enregistrements existants ne seront pas écrasés.")) {
      importDataMutation.mutate(file);
    }
    e.target.value = "";
  };

  const [sqlImportFile, setSqlImportFile] = useState<File | null>(null);
  const [showSqlImportDialog, setShowSqlImportDialog] = useState(false);
  const [sqlReplaceExisting, setSqlReplaceExisting] = useState(false);

  const handleSqlImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".sql")) {
      toast({ title: "Format invalide", description: "Veuillez sélectionner un fichier .sql", variant: "destructive" });
      e.target.value = "";
      return;
    }
    setSqlImportFile(file);
    setSqlReplaceExisting(false);
    setShowSqlImportDialog(true);
    e.target.value = "";
  };

  const handleConfirmSqlImport = () => {
    if (sqlImportFile) {
      importSqlMutation.mutate({ file: sqlImportFile, replaceExisting: sqlReplaceExisting });
    }
    setShowSqlImportDialog(false);
    setSqlImportFile(null);
  };

  const handleMediaImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".tar.gz") && !file.name.endsWith(".tgz") && !file.name.endsWith(".zip")) {
      toast({ title: "Format invalide", description: "Veuillez sélectionner un fichier .tar.gz, .tgz ou .zip", variant: "destructive" });
      return;
    }
    if (confirm("Voulez-vous importer ces médias ? Les fichiers existants ne seront pas écrasés.")) {
      importMediaMutation.mutate(file);
    }
    e.target.value = "";
  };

  const handleRefresh = () => {
    refetchBackups();
    refetchStats();
  };

  const backups = backupsData?.backups || [];
  const stats = statsData;

  return (
    <div className="container mx-auto py-6 px-4" data-testid="admin-backups-page">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Sauvegardes et Maintenance</h1>
            <p className="text-muted-foreground">Gérez les sauvegardes, exports et imports des données et médias</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isSuperAdmin && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (confirm("Voulez-vous synchroniser les données et médias de Prod vers Dev ? Les données de développement seront écrasées.")) {
                      syncProdDbMutation.mutate();
                    }
                  }}
                  disabled={syncProdDbMutation.isPending || syncDevToProdMutation.isPending}
                  data-testid="button-sync-prod"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${syncProdDbMutation.isPending ? 'animate-spin' : ''}`} />
                  {syncProdDbMutation.isPending ? "Sync en cours..." : "Prod \u2192 Dev"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (confirm("ATTENTION : Voulez-vous synchroniser les données et médias de Dev vers Prod ? Cela \u00e9crasera les donn\u00e9es de production.")) {
                      syncDevToProdMutation.mutate();
                    }
                  }}
                  disabled={syncDevToProdMutation.isPending || syncProdDbMutation.isPending}
                  data-testid="button-sync-dev-to-prod"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${syncDevToProdMutation.isPending ? 'animate-spin' : ''}`} />
                  {syncDevToProdMutation.isPending ? "Sync en cours..." : "Dev \u2192 Prod"}
                </Button>
              </>
            )}
            <Button
              variant="outline"
              onClick={() => clearCacheMutation.mutate()}
              disabled={clearCacheMutation.isPending}
              data-testid="button-clear-cache"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Vider le cache
            </Button>
            <Button variant="outline" onClick={handleRefresh} data-testid="button-refresh">
              <RefreshCw className="w-4 h-4 mr-2" />
              Actualiser
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card data-testid="card-stats-disk">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Fichiers sur disque</CardTitle>
              <HardDrive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-files-count">
                {statsLoading ? "..." : stats?.filesOnDisk || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {statsLoading ? "Chargement..." : stats?.totalSizeFormatted || "0 B"}
              </p>
            </CardContent>
          </Card>
          <Card data-testid="card-stats-quotes">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Photos devis</CardTitle>
              <FileImage className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-quote-media-count">
                {statsLoading ? "..." : stats?.quoteMediaCount || 0}
              </div>
              <p className="text-xs text-muted-foreground">Enregistrements en base</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stats-invoices">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Photos factures</CardTitle>
              <FileImage className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-invoice-media-count">
                {statsLoading ? "..." : stats?.invoiceMediaCount || 0}
              </div>
              <p className="text-xs text-muted-foreground">Enregistrements en base</p>
            </CardContent>
          </Card>
        </div>

        {isSuperAdmin && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <Card data-testid="card-data-export">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Export des données
                  </CardTitle>
                  <CardDescription>
                    Téléchargez une sauvegarde complète de toutes les données (JSON ou SQL)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={handleDownloadData}
                      disabled={isDownloading === "data-export"}
                      data-testid="button-export-json"
                    >
                      {isDownloading === "data-export" ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <FileJson className="w-4 h-4 mr-2" />
                      )}
                      Export JSON
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleDownloadSQL}
                      disabled={isDownloading === "sql-export"}
                      data-testid="button-export-sql"
                    >
                      {isDownloading === "sql-export" ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Database className="w-4 h-4 mr-2" />
                      )}
                      Export SQL
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    L'export JSON peut être réimporté. L'export SQL est compatible PostgreSQL.
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-data-import">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    Import des données
                  </CardTitle>
                  <CardDescription>
                    Restaurez les données depuis un fichier JSON ou SQL exporté précédemment
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <input
                    type="file"
                    accept=".json"
                    ref={dataImportRef}
                    className="hidden"
                    onChange={handleDataImportFile}
                    data-testid="input-import-data"
                  />
                  <Button
                    variant="outline"
                    onClick={() => dataImportRef.current?.click()}
                    disabled={importDataMutation.isPending}
                    data-testid="button-import-data"
                  >
                    {importDataMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <FileJson className="w-4 h-4 mr-2" />
                    )}
                    {importDataMutation.isPending ? "Import en cours..." : "Importer JSON"}
                  </Button>
                  <input
                    type="file"
                    accept=".sql"
                    ref={sqlImportRef}
                    className="hidden"
                    onChange={handleSqlImportFile}
                    data-testid="input-import-sql"
                  />
                  <Button
                    variant="outline"
                    onClick={() => sqlImportRef.current?.click()}
                    disabled={importSqlMutation.isPending}
                    data-testid="button-import-sql"
                  >
                    {importSqlMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Database className="w-4 h-4 mr-2" />
                    )}
                    {importSqlMutation.isPending ? "Import SQL en cours..." : "Importer SQL"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Les enregistrements existants ne seront pas écrasés. Seules les nouvelles données seront ajoutées.
                  </p>
                </CardContent>
              </Card>
            </div>

          </>
        )}

        <Card data-testid="card-media-section">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Archive className="h-5 w-5" />
                  Sauvegardes médias
                </CardTitle>
                <CardDescription>
                  Archives des photos associées aux devis et factures
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {isSuperAdmin && (
                  <>
                    <input
                      type="file"
                      accept=".tar.gz,.tgz,.zip"
                      ref={mediaImportRef}
                      className="hidden"
                      onChange={handleMediaImportFile}
                      data-testid="input-import-media"
                    />
                    <Button
                      variant="outline"
                      onClick={() => mediaImportRef.current?.click()}
                      disabled={importMediaMutation.isPending}
                      data-testid="button-import-media"
                    >
                      {importMediaMutation.isPending ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <ImageIcon className="w-4 h-4 mr-2" />
                      )}
                      {importMediaMutation.isPending ? "Import en cours..." : "Importer médias"}
                    </Button>
                  </>
                )}
                <Button
                  onClick={() => createBackupMutation.mutate()}
                  disabled={createBackupMutation.isPending}
                  data-testid="button-create-backup"
                >
                  {createBackupMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  Nouvelle sauvegarde
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {backupsLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : backups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Archive className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Aucune sauvegarde médias disponible</p>
                <p className="text-sm text-muted-foreground">
                  Cliquez sur "Nouvelle sauvegarde" pour créer votre première archive
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {backups.map((backup) => (
                  <div
                    key={backup.name}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-md"
                    data-testid={`backup-item-${backup.name}`}
                  >
                    <div className="flex items-start gap-3">
                      <Archive className="w-8 h-8 text-primary flex-shrink-0 mt-1" />
                      <div>
                        <p className="font-medium" data-testid="text-backup-name">{backup.name}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <Badge variant="secondary">{backup.sizeFormatted}</Badge>
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(backup.createdAt), "dd MMMM yyyy 'à' HH:mm", { locale: fr })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 sm:flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadBackup(backup.name)}
                        disabled={isDownloading === backup.name}
                        data-testid={`button-download-${backup.name}`}
                      >
                        {isDownloading === backup.name ? (
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4 mr-2" />
                        )}
                        Télécharger
                      </Button>
                      {isSuperAdmin && (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setDeleteConfirm(backup.name)}
                          className="text-destructive"
                          data-testid={`button-delete-${backup.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-info">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Information importante
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Les sauvegardes médias contiennent toutes les photos associées aux devis et factures,
              ainsi qu'un fichier de correspondance JSON permettant de les réassocier.
            </p>
            {isSuperAdmin && (
              <>
                <p>
                  <strong>Export JSON :</strong> Télécharge l'intégralité de la base de données au format JSON.
                  Ce fichier peut être réimporté pour restaurer les données.
                </p>
                <p>
                  <strong>Import données :</strong> Les enregistrements existants (même identifiant) ne sont pas écrasés.
                  Seules les nouvelles entrées sont ajoutées.
                </p>
                <p>
                  <strong>Import médias :</strong> Envoyez l'archive .tar.gz ou .zip générée par la sauvegarde.
                  Les fichiers déjà présents ne seront pas remplacés.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileImage className="h-5 w-5" />
              Gestion des médias
            </CardTitle>
            <CardDescription>
              Analyser et nettoyer les photos inaccessibles (ancien stockage ou disque local)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                variant="outline"
                onClick={() => scanBrokenMediaMutation.mutate()}
                disabled={scanBrokenMediaMutation.isPending}
                data-testid="button-scan-broken-media"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${scanBrokenMediaMutation.isPending ? "animate-spin" : ""}`} />
                {scanBrokenMediaMutation.isPending ? "Analyse..." : "Analyser les médias"}
              </Button>
              {mediaScanResult && mediaScanResult.broken > 0 && (
                <Button
                  variant="destructive"
                  onClick={() => setShowCleanupConfirm(true)}
                  disabled={cleanupBrokenMediaMutation.isPending}
                  data-testid="button-cleanup-broken-media"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Supprimer {mediaScanResult.broken} fichiers inaccessibles
                </Button>
              )}
            </div>

            {mediaScanResult && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-md bg-muted/50 text-center">
                    <p className="text-xl font-bold">{mediaScanResult.total}</p>
                    <p className="text-xs text-muted-foreground">Total médias</p>
                  </div>
                  <div className="p-3 rounded-md bg-green-50 dark:bg-green-950/30 text-center">
                    <p className="text-xl font-bold text-green-700 dark:text-green-400">{mediaScanResult.accessible}</p>
                    <p className="text-xs text-muted-foreground">Accessibles</p>
                  </div>
                  <div className="p-3 rounded-md bg-destructive/10 text-center">
                    <p className="text-xl font-bold text-destructive">{mediaScanResult.broken}</p>
                    <p className="text-xs text-muted-foreground">Inaccessibles</p>
                  </div>
                </div>
                {mediaScanResult.broken > 0 && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    {mediaScanResult.uploadsBroken > 0 && (
                      <p className="flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        {mediaScanResult.uploadsBroken} fichiers sur disque local (perdus au redémarrage)
                      </p>
                    )}
                    {mediaScanResult.objectsBroken > 0 && (
                      <p className="flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        {mediaScanResult.objectsBroken} fichiers dans l'ancien stockage inaccessible
                      </p>
                    )}
                    <p className="text-xs pt-1">
                      Ces fichiers ne peuvent pas être récupérés. La suppression des entrées DB permettra aux clients de re-uploader leurs photos.
                    </p>
                  </div>
                )}
                {mediaScanResult.broken === 0 && (
                  <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                    Tous les médias sont accessibles dans le stockage actuel.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showCleanupConfirm} onOpenChange={setShowCleanupConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer les médias inaccessibles ?</AlertDialogTitle>
            <AlertDialogDescription>
              {mediaScanResult && (
                <>
                  Cette action va supprimer {mediaScanResult.broken} entrées de médias inaccessibles
                  ({mediaScanResult.uploadsBroken} sur disque local + {mediaScanResult.objectsBroken} dans l'ancien bucket).
                  Les photos devront être re-uploadées sur chaque devis/facture.
                  Cette action est irréversible.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cleanupBrokenMediaMutation.mutate()}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-cleanup-media"
            >
              {cleanupBrokenMediaMutation.isPending ? "Suppression..." : "Supprimer les entrées cassées"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette sauvegarde ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. La sauvegarde "{deleteConfirm}" sera définitivement supprimée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && deleteBackupMutation.mutate(deleteConfirm)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              {deleteBackupMutation.isPending ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showSqlImportDialog} onOpenChange={(open) => { if (!open) { setShowSqlImportDialog(false); setSqlImportFile(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Importer le fichier SQL</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Fichier : <strong>{sqlImportFile?.name}</strong></p>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="replace-existing"
                    checked={sqlReplaceExisting}
                    onCheckedChange={(checked) => setSqlReplaceExisting(checked === true)}
                    data-testid="checkbox-replace-existing"
                  />
                  <Label htmlFor="replace-existing" className="text-sm leading-tight cursor-pointer">
                    Remplacer les données existantes (vider les tables avant l'import)
                  </Label>
                </div>
                {sqlReplaceExisting && (
                  <div className="flex items-start gap-2 p-3 border rounded-md bg-destructive/10 text-destructive">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <p className="text-sm">Toutes les données actuelles seront supprimées et remplacées par le contenu du fichier.</p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-sql-import">Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSqlImport}
              className={sqlReplaceExisting ? "bg-destructive text-destructive-foreground" : ""}
              data-testid="button-confirm-sql-import"
            >
              {sqlReplaceExisting ? "Remplacer et importer" : "Importer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
