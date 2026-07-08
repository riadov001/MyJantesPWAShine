import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Landmark,
  RefreshCw,
  Loader2,
  Building2,
  Trash2,
  ArrowUpRight,
  ArrowDownLeft,
  BookOpen,
  CheckCircle2,
  Eye,
  Download,
  Info,
  Upload,
  FileText,
  Mail,
  Webhook,
  AlertTriangle,
} from "lucide-react";

const BRIDGE_USERS = [
  { label: "Rachid — rbelmahi90@gmail.com", value: "rbelmahi90@gmail.com" },
  { label: "Contact — contact@myjantes.com", value: "contact@myjantes.com" },
];

interface BridgeAccount {
  id: number;
  name: string;
  balance: number | null;
  currency_code: string;
  type: string;
  iban: string | null;
  item_id: number;
  bank_name: string | null;
}

interface BridgeItem {
  id: number;
  bank_name: string | null;
  bank_logo: string | null;
  status: string;
}

interface BridgeTx {
  id: number;
  date: string;
  label: string;
  amount: number;
  currency_code: string;
  accountId: number;
  alreadyImported?: boolean;
}

interface BunqStats {
  count: number;
  lastImport: string | null;
  recent: Array<{ date: string; description: string; amount: string }>;
}

interface BunqImportResult {
  ok: boolean;
  imported: number;
  skipped: number;
  total: number;
  errors: string[];
}

function formatAmount(amount: number, currency = "EUR") {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(amount);
}

function formatDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function BunqImportSection() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<BunqImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<BunqStats>({
    queryKey: ["/api/import-bunq/stats"],
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      return new Promise<BunqImportResult>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
          try {
            const base64 = (reader.result as string).split(",")[1];
            const res = await apiRequest("POST", "/api/import-bunq", { base64, filename: file.name });
            const data = await res.json();
            resolve(data);
          } catch (err: any) { reject(err); }
        };
        reader.onerror = (error) => reject(error);
      });
    },
    onSuccess: (data) => {
      setImportResult(data);
      refetchStats();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/accounting/entries"] });
      toast({
        title: data.imported > 0 ? "Import bunq réussi" : "Aucune nouvelle transaction",
        description: `${data.imported} importée(s) · ${data.skipped} ignorée(s) (doublons)`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Erreur import bunq", description: err.message, variant: "destructive" });
    },
  });

  function handleFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "pdf", "zip"].includes(ext || "")) {
      toast({ title: "Format non supporté", description: "Seuls CSV, PDF et ZIP sont acceptés.", variant: "destructive" });
      return;
    }
    setImportResult(null);
    importMutation.mutate(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  const webhookUrl = `${window.location.origin}/webhook/resend-bunq`;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Webhook className="h-4 w-4 text-primary" />
            Réception automatique via Resend
          </CardTitle>
          <CardDescription className="text-xs">
            Configurez Resend Inbound pour rediriger vos e-mails bunq vers ce webhook.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md font-mono break-all">{webhookUrl}</code>
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast({ title: "Copié !" }); }}>
              Copier
            </Button>
          </div>
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 p-3 rounded-md border">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p><strong>Configuration Resend :</strong> Allez dans <em>Resend → Inbound → Add Domain</em>, puis créez une règle qui redirige les emails de <code>@bunq.com</code> vers l'URL ci-dessus.</p>
              <p>bunq envoie les relevés en CSV ou PDF en pièce jointe. Ils seront importés automatiquement dans la comptabilité.</p>
              <p>Seuls les e-mails provenant de <strong>@bunq.com</strong> sont acceptés — les autres sont ignorés.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            Import manuel d'un relevé bunq
          </CardTitle>
          <CardDescription className="text-xs">
            Glissez-déposez ou sélectionnez un fichier CSV, PDF ou ZIP exporté depuis bunq.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={`border-2 border-dashed rounded-md p-8 text-center cursor-pointer transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30"}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            data-testid="bunq-dropzone"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.pdf,.zip"
              className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
              data-testid="input-bunq-file"
            />
            {importMutation.isPending ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium">Synchronisation en cours…</p>
                <p className="text-xs text-muted-foreground">Parsing du fichier et import comptable</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <FileText className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium">Déposez votre relevé bunq ici</p>
                <p className="text-xs text-muted-foreground">CSV · PDF · ZIP — max 20 Mo</p>
                <Button variant="outline" size="sm" type="button" className="mt-1" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                  Sélectionner un fichier
                </Button>
              </div>
            )}
          </div>

          {importResult && (
            <div className={`flex items-start gap-3 p-3 rounded-md border ${importResult.imported > 0 ? "bg-green-50 dark:bg-green-950/20 border-green-500/40" : "bg-muted/40"}`}>
              {importResult.imported > 0
                ? <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                : <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              }
              <div>
                <p className="text-sm font-medium">
                  {importResult.imported > 0
                    ? `${importResult.imported} transaction(s) importée(s) avec succès`
                    : "Aucune nouvelle transaction"
                  }
                </p>
                <p className="text-xs text-muted-foreground">
                  Total parsé : {importResult.total} · Ignorés (doublons) : {importResult.skipped}
                </p>
                {importResult.errors.length > 0 && (
                  <p className="text-xs text-destructive mt-1">
                    {importResult.errors.length} erreur(s) : {importResult.errors.slice(0, 2).join(" / ")}
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            Imports bunq en comptabilité
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : !stats || stats.count === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun import bunq pour l'instant</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total d'écritures importées</span>
                <Badge variant="outline">{stats.count}</Badge>
              </div>
              {stats.lastImport && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Dernier import</span>
                  <span className="text-xs">{formatDate(stats.lastImport)}</span>
                </div>
              )}
              {stats.recent.length > 0 && (
                <div className="space-y-1 pt-1 border-t">
                  <p className="text-xs text-muted-foreground font-medium">Dernières écritures</p>
                  {stats.recent.map((e, i) => (
                    <div key={i} className="flex justify-between items-center text-xs py-1">
                      <span className="text-muted-foreground whitespace-nowrap">{formatDate(e.date)}</span>
                      <span className="truncate mx-2 text-foreground">{e.description.replace("[bunq] ", "")}</span>
                      <span className="font-mono shrink-0">{parseFloat(e.amount).toFixed(2)} €</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function OpenBankingPanel() {
  const { isAuthenticated, isAdmin } = useAuth();
  const { toast } = useToast();

  const [selectedEmail, setSelectedEmail] = useState("rbelmahi90@gmail.com");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedAccountsForSync, setSelectedAccountsForSync] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [syncResult, setSyncResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);

  const { data: dashboardData, isLoading: dashboardLoading, refetch: refetchDashboard } = useQuery<{
    accounts: BridgeAccount[];
    items: BridgeItem[];
    totalBalance: number;
  }>({
    queryKey: ["/api/bridge/dashboard", selectedEmail],
    queryFn: async () => {
      const res = await fetch(`/api/bridge/dashboard?email=${encodeURIComponent(selectedEmail)}`);
      if (!res.ok) throw new Error("Erreur dashboard");
      return res.json();
    },
    enabled: isAuthenticated && isAdmin,
  });

  const { data: txData, isLoading: txLoading } = useQuery<{ transactions: BridgeTx[] }>({
    queryKey: ["/api/bridge/transactions", selectedAccountId, selectedEmail],
    queryFn: async () => {
      const res = await fetch(`/api/bridge/accounts/${selectedAccountId}/transactions?email=${encodeURIComponent(selectedEmail)}&limit=100`);
      return res.json();
    },
    enabled: !!selectedAccountId && isAuthenticated && isAdmin,
  });

  const previewMutation = useMutation({
    mutationFn: async (): Promise<{ transactions: BridgeTx[] }> => {
      const res = await apiRequest("POST", "/api/bridge/preview-sync", {
        email: selectedEmail, accountIds: Array.from(selectedAccountsForSync), dateFrom, dateTo,
      });
      return res.json();
    },
    onSuccess: () => setPreviewOpen(true),
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const syncMutation = useMutation({
    mutationFn: async (): Promise<{ imported: number; skipped: number; errors: string[] }> => {
      const res = await apiRequest("POST", "/api/bridge/sync-to-accounting", {
        email: selectedEmail, accountIds: Array.from(selectedAccountsForSync), dateFrom, dateTo,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setSyncResult(data);
      setPreviewOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/accounting/entries"] });
      toast({ title: "Synchronisation terminée", description: `${data.imported} écriture(s) importée(s).` });
    },
    onError: (err: any) => toast({ title: "Erreur sync", description: err.message, variant: "destructive" }),
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/bridge/connect-session?email=${encodeURIComponent(selectedEmail)}`);
      return res.json();
    },
    onSuccess: (data) => { if (data.url) window.location.href = data.url; },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const refreshItemMutation = useMutation({
    mutationFn: async (itemId: number) => {
      const res = await apiRequest("POST", `/api/bridge/items/${itemId}/refresh?email=${encodeURIComponent(selectedEmail)}`);
      return res.json();
    },
    onSuccess: () => { refetchDashboard(); toast({ title: "Actualisé" }); },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (itemId: number) => {
      const res = await apiRequest("DELETE", `/api/bridge/items/${itemId}?email=${encodeURIComponent(selectedEmail)}`);
      return res.json();
    },
    onSuccess: () => { refetchDashboard(); toast({ title: "Banque déconnectée" }); },
  });

  const accounts = dashboardData?.accounts || [];
  const items = dashboardData?.items || [];
  const transactions = txData?.transactions || [];

  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) setSelectedAccountId(accounts[0].id.toString());
  }, [accounts, selectedAccountId]);

  const toggleAccountForSync = (id: string) => {
    setSelectedAccountsForSync(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const previewTxs: BridgeTx[] = previewMutation.data?.transactions || [];
  const newTxs = previewTxs.filter(tx => !tx.alreadyImported);
  const alreadyTxs = previewTxs.filter(tx => tx.alreadyImported);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Bridge API · Synchronisation comptable · Import bunq</p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Utilisateur Bridge :</Label>
          <Select value={selectedEmail} onValueChange={(v) => { setSelectedEmail(v); setSelectedAccountId(null); setSelectedAccountsForSync(new Set()); }}>
            <SelectTrigger className="w-[260px]" data-testid="select-bridge-user">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BRIDGE_USERS.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {syncResult && (
        <Card className="border-green-500/40 bg-green-50 dark:bg-green-950/20">
          <CardContent className="pt-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            <div>
              <p className="font-medium text-green-800 dark:text-green-300">{syncResult.imported} écriture(s) Bridge importée(s)</p>
              {syncResult.skipped > 0 && <p className="text-xs text-muted-foreground">{syncResult.skipped} doublon(s) ignoré(s)</p>}
            </div>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSyncResult(null)}>Fermer</Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="bridge">
        <TabsList>
          <TabsTrigger value="bridge" className="flex items-center gap-1.5">
            <Landmark className="h-3.5 w-3.5" /> Bridge API
          </TabsTrigger>
          <TabsTrigger value="bunq" className="flex items-center gap-1.5" data-testid="tab-bunq">
            <Mail className="h-3.5 w-3.5" /> bunq (e-mail / CSV / PDF)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bridge" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                  <CardTitle className="text-sm font-semibold">Banques connectées</CardTitle>
                  <Button size="sm" onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending} data-testid="button-add-bank">
                    {connectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Ajouter
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2">
                  {dashboardLoading ? <Skeleton className="h-16 w-full" /> : items.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-sm">
                      <Landmark className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      Aucune banque liée.
                    </div>
                  ) : items.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 border rounded-md">
                      <div className="flex items-center gap-2 min-w-0">
                        <Building2 className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm font-medium truncate">{item.bank_name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge variant={item.status === "ok" ? "outline" : "destructive"} className="text-[10px]">
                          {item.status === "ok" ? "Actif" : item.status}
                        </Badge>
                        <Button variant="ghost" size="icon" onClick={() => refreshItemMutation.mutate(item.id)} data-testid={`button-refresh-item-${item.id}`}><RefreshCw className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { if (confirm("Supprimer cette connexion ?")) disconnectMutation.mutate(item.id); }} data-testid={`button-delete-item-${item.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Comptes bancaires</CardTitle>
                  {accounts.length > 0 && (
                    <CardDescription className="text-xs">Solde total : <span className="font-bold text-foreground">{formatAmount(dashboardData?.totalBalance || 0)}</span></CardDescription>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  {dashboardLoading ? <div className="p-4"><Skeleton className="h-24 w-full" /></div> :
                    accounts.length === 0 ? <div className="p-4 text-sm text-muted-foreground text-center">Aucun compte</div> : (
                      <div className="divide-y">
                        {accounts.map(acc => (
                          <div key={acc.id} className={`px-4 py-3 cursor-pointer transition-colors hover:bg-muted/40 ${selectedAccountId === String(acc.id) ? "bg-primary/5 border-l-2 border-primary" : ""}`} onClick={() => setSelectedAccountId(String(acc.id))} data-testid={`account-row-${acc.id}`}>
                            <div className="flex justify-between items-center gap-2">
                              <span className="text-sm font-medium truncate">{acc.name}</span>
                              <span className={`text-sm font-bold font-mono shrink-0 ${(acc.balance ?? 0) < 0 ? "text-destructive" : ""}`}>{acc.balance !== null ? formatAmount(acc.balance, acc.currency_code) : "—"}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{acc.bank_name || "—"}</p>
                          </div>
                        ))}
                      </div>
                    )}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-primary" />
                        Synchroniser vers la comptabilité
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">Importe les transactions en journal Banque (compte 512100 / 471000)</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => previewMutation.mutate()} disabled={selectedAccountsForSync.size === 0 || previewMutation.isPending} data-testid="button-preview-sync">
                        {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                        Prévisualiser
                      </Button>
                      <Button size="sm" onClick={() => syncMutation.mutate()} disabled={selectedAccountsForSync.size === 0 || syncMutation.isPending} data-testid="button-sync-accounting">
                        {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
                        Importer
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-4">
                    <div className="flex-1 min-w-[140px] space-y-1">
                      <Label className="text-xs">Du</Label>
                      <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-sm" data-testid="input-date-from" />
                    </div>
                    <div className="flex-1 min-w-[140px] space-y-1">
                      <Label className="text-xs">Au</Label>
                      <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-sm" data-testid="input-date-to" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Comptes à synchroniser</Label>
                      {accounts.length > 0 && <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setSelectedAccountsForSync(new Set(accounts.map(a => String(a.id))))}>Tout sélectionner</Button>}
                    </div>
                    {dashboardLoading ? <Skeleton className="h-16 w-full" /> : accounts.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Aucun compte — connectez d'abord une banque</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {accounts.map(acc => (
                          <div key={acc.id} className="flex items-center gap-2 p-2 border rounded-md cursor-pointer hover-elevate" onClick={() => toggleAccountForSync(String(acc.id))}>
                            <Checkbox checked={selectedAccountsForSync.has(String(acc.id))} onCheckedChange={() => toggleAccountForSync(String(acc.id))} data-testid={`checkbox-account-${acc.id}`} />
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{acc.name}</p>
                              <p className="text-[10px] text-muted-foreground">{acc.bank_name}</p>
                            </div>
                            {acc.balance !== null && <span className="ml-auto text-xs font-mono font-semibold shrink-0">{formatAmount(acc.balance, acc.currency_code)}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-start gap-2 p-3 rounded-md bg-muted/40 border text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>Les doublons sont détectés automatiquement. Les contreparties sont classées en <strong>471000</strong> (attente de régularisation) à reclassifier manuellement.</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">
                    Transactions — {accounts.find(a => String(a.id) === selectedAccountId)?.name || "Sélectionnez un compte"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {!selectedAccountId ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">Cliquez sur un compte à gauche</div>
                  ) : txLoading ? <div className="p-4"><Skeleton className="h-40 w-full" /></div> :
                    transactions.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">Aucune transaction disponible</div> : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Date</TableHead>
                            <TableHead className="text-xs">Libellé</TableHead>
                            <TableHead className="text-xs text-right">Montant</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transactions.map(tx => (
                            <TableRow key={tx.id} data-testid={`tx-row-${tx.id}`}>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(tx.date)}</TableCell>
                              <TableCell className="text-sm">
                                <div className="flex items-center gap-1.5">
                                  {tx.amount > 0 ? <ArrowDownLeft className="h-3.5 w-3.5 text-green-500 shrink-0" /> : <ArrowUpRight className="h-3.5 w-3.5 text-destructive shrink-0" />}
                                  <span className="truncate max-w-[240px]">{tx.label}</span>
                                </div>
                              </TableCell>
                              <TableCell className={`text-right font-mono font-semibold text-sm ${tx.amount < 0 ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>
                                {formatAmount(tx.amount, tx.currency_code)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="bunq" className="mt-4">
          <BunqImportSection />
        </TabsContent>
      </Tabs>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Aperçu de la synchronisation Bridge</DialogTitle>
            <DialogDescription>{newTxs.length} à importer · {alreadyTxs.length} déjà présentes</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="new" className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <TabsList className="shrink-0">
              <TabsTrigger value="new">À importer ({newTxs.length})</TabsTrigger>
              <TabsTrigger value="existing">Déjà importées ({alreadyTxs.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="new" className="overflow-auto mt-2 flex-1">
              {newTxs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm"><CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-40" />Tout est déjà importé.</div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead className="text-xs">Date</TableHead><TableHead className="text-xs">Libellé</TableHead><TableHead className="text-xs">Compte</TableHead><TableHead className="text-xs text-right">Montant</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {newTxs.map(tx => {
                      const acc = accounts.find(a => String(a.id) === String(tx.accountId));
                      return (
                        <TableRow key={tx.id}>
                          <TableCell className="text-xs whitespace-nowrap">{formatDate(tx.date)}</TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate">{tx.label}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{acc?.name || tx.accountId}</TableCell>
                          <TableCell className={`text-right font-mono text-xs font-semibold ${tx.amount < 0 ? "text-destructive" : "text-green-600"}`}>{formatAmount(tx.amount, tx.currency_code)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
            <TabsContent value="existing" className="overflow-auto mt-2 flex-1">
              {alreadyTxs.length === 0 ? <div className="text-center py-8 text-muted-foreground text-sm">Aucune transaction déjà importée</div> : (
                <Table>
                  <TableHeader><TableRow><TableHead className="text-xs">Date</TableHead><TableHead className="text-xs">Libellé</TableHead><TableHead className="text-xs text-right">Montant</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {alreadyTxs.map(tx => (
                      <TableRow key={tx.id} className="opacity-50">
                        <TableCell className="text-xs">{formatDate(tx.date)}</TableCell>
                        <TableCell className="text-xs max-w-[240px] truncate">{tx.label}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatAmount(tx.amount, tx.currency_code)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
          <DialogFooter className="shrink-0 pt-3 border-t gap-2">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Annuler</Button>
            <Button onClick={() => syncMutation.mutate()} disabled={newTxs.length === 0 || syncMutation.isPending} data-testid="button-confirm-sync">
              {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
              Importer {newTxs.length} transaction(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
