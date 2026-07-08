import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { OpenBankingPanel } from "@/components/OpenBankingPanel";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  FileDown,
  ArrowUpRight,
  ArrowDownRight,
  Calculator,
  BookOpen,
  Receipt,
  Percent,
  Download,
  Plus,
  CheckCircle2,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
  FileText,
  CircleX,
  CircleCheck,
  Building2,
  Loader2,
  Search,
  FolderArchive,
  Info,
  Trash2,
  Mail,
  Landmark,
  LineChart,
  CheckSquare,
  Square,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface ProfitLossData {
  period: { startDate: string; endDate: string };
  revenue: { total: number; creditNotes: number; net: number; byMonth: Record<string, number> };
  expenses: { total: number; byCategory: Array<{ name: string; total: number; count: number }>; byMonth: Record<string, number> };
  netProfit: number;
  margin: number;
  invoiceCount: number;
  expenseCount: number;
}

interface TvaReportData {
  period: { startDate: string; endDate: string };
  salesHT: number;
  purchasesHT: number;
  tvaCollected: number;
  tvaDeductible: number;
  tvaCreditNotes: number;
  tvaNet: number;
  tvaByRate: Record<string, { collected: number; deductible: number; net: number }>;
  invoiceCount: number;
  expenseCount: number;
  creditNoteCount: number;
}

interface CashFlowData {
  period: { startDate: string; endDate: string };
  totalInflows: number;
  totalOutflows: number;
  netCashFlow: number;
  byMonth: Array<{ month: string; inflows: number; outflows: number; net: number }>;
  inflowsByMethod: Record<string, number>;
  outflowsByMethod: Record<string, number>;
}

interface AccountingEntry {
  id: string;
  entryNumber: string;
  date: string;
  journal: string;
  sourceType: string;
  sourceId: string;
  description: string;
  totalDebit: string;
  totalCredit: string;
  isValidated: boolean;
  createdAt: string;
}

const formatCurrency = (value: number) =>
  value.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

const formatMonth = (monthStr: string) => {
  const [y, m] = monthStr.split("-");
  const months = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
  return `${months[parseInt(m) - 1]} ${y}`;
};

const journalLabels: Record<string, string> = {
  sales: "Ventes",
  purchases: "Achats",
  bank: "Banque",
  cash: "Caisse",
  misc: "Divers",
};

const sourceLabels: Record<string, string> = {
  invoice: "Facture",
  expense: "Dépense",
  credit_note: "Avoir",
  payment: "Paiement",
  manual: "Manuel",
};

const paymentMethodLabels: Record<string, string> = {
  cash: "Espèces",
  wire_transfer: "Virement",
  card: "Carte",
  stripe: "Stripe",
  sepa: "SEPA",
  klarna: "Klarna",
  alma: "Alma",
  check: "Chèque",
  direct_debit: "Prélèvement",
};

interface EInvoicingData {
  totalInvoices: number;
  compliantCount: number;
  nonCompliantCount: number;
  complianceRate: number;
  commonIssues: [string, number][];
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    clientName: string;
    amount: string;
    status: string;
    createdAt: string;
    isCompliant: boolean;
    issues: string[];
    issueCount: number;
  }>;
  garageCompliance: {
    hasSiret: boolean;
    hasTvaNumber: boolean;
    hasAddress: boolean;
    hasName: boolean;
    hasEmail: boolean;
    hasPhone: boolean;
    hasIban: boolean;
  };
}


export default function AdminAccounting() {
  const { isAuthenticated, isAdmin, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const canAccessAccounting = isSuperAdmin;
  const [activeTab, setActiveTab] = useState<"overview" | "analytics" | "journal" | "tva" | "fec" | "einvoicing" | "dossier" | "openbanking">("overview");
  const currentYear = new Date().getFullYear();
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [journalFilter, setJournalFilter] = useState<string>("all");
  const [manualEntryDialog, setManualEntryDialog] = useState(false);
  const [newEntryDate, setNewEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [newEntryJournal, setNewEntryJournal] = useState("misc");
  const [newEntryDescription, setNewEntryDescription] = useState("");
  const [newEntryLines, setNewEntryLines] = useState<Array<{accountCode: string; accountLabel: string; description: string; debit: string; credit: string}>>([
    { accountCode: "", accountLabel: "", description: "", debit: "0", credit: "0" },
    { accountCode: "", accountLabel: "", description: "", debit: "0", credit: "0" },
  ]);
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
  const [emailDialog, setEmailDialog] = useState(false);
  const [emailTarget, setEmailTarget] = useState("rbelmahi90@gmail.com");
  const [dossierEmailDialog, setDossierEmailDialog] = useState(false);
  const [dossierEmailTarget, setDossierEmailTarget] = useState("rbelmahi90@gmail.com");

  const { data: profitLoss, isLoading: plLoading } = useQuery<ProfitLossData>({
    queryKey: ["/api/admin/accounting/profit-loss", startDate, endDate],
    queryFn: () => fetch(`/api/admin/accounting/profit-loss?startDate=${startDate}&endDate=${endDate}`, { credentials: "include" }).then(r => r.json()),
    enabled: isAuthenticated && canAccessAccounting,
  });

  const { data: tvaReport, isLoading: tvaLoading } = useQuery<TvaReportData>({
    queryKey: ["/api/admin/accounting/tva-report", startDate, endDate],
    queryFn: () => fetch(`/api/admin/accounting/tva-report?startDate=${startDate}&endDate=${endDate}`, { credentials: "include" }).then(r => r.json()),
    enabled: isAuthenticated && canAccessAccounting,
  });

  const { data: cashFlow, isLoading: cfLoading } = useQuery<CashFlowData>({
    queryKey: ["/api/admin/accounting/cash-flow", startDate, endDate],
    queryFn: () => fetch(`/api/admin/accounting/cash-flow?startDate=${startDate}&endDate=${endDate}`, { credentials: "include" }).then(r => r.json()),
    enabled: isAuthenticated && canAccessAccounting,
  });

  const { data: entries = [], isLoading: entriesLoading } = useQuery<AccountingEntry[]>({
    queryKey: ["/api/admin/accounting/entries", journalFilter, startDate, endDate],
    queryFn: () => {
      const params = new URLSearchParams();
      if (journalFilter !== "all") params.set("journal", journalFilter);
      params.set("startDate", startDate);
      params.set("endDate", endDate);
      return fetch(`/api/admin/accounting/entries?${params}`, { credentials: "include" }).then(r => r.json());
    },
    enabled: isAuthenticated && canAccessAccounting,
  });

  const { data: fecExports = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/accounting/fec-exports"],
    enabled: isAuthenticated && canAccessAccounting,
  });

  const { data: eInvoicingData, isLoading: eInvoicingLoading } = useQuery<EInvoicingData>({
    queryKey: ["/api/admin/accounting/e-invoicing/compliance"],
    enabled: isAuthenticated && canAccessAccounting && activeTab === "einvoicing",
  });

  const [complianceFilter, setComplianceFilter] = useState<"all" | "compliant" | "non_compliant">("all");

  interface DossierValidation {
    warnings: Array<{ severity: "error" | "warning" | "info"; category: string; message: string; count?: number }>;
    errorCount: number;
    warningCount: number;
    infoCount: number;
    summary: { invoiceCount: number; expenseCount: number; creditNoteCount: number; entryCount: number; validatedEntryCount: number };
    isReady: boolean;
  }

  const { data: dossierValidation, isLoading: dossierLoading } = useQuery<DossierValidation>({
    queryKey: ["/api/admin/accounting/dossier-validation", startDate, endDate],
    queryFn: () => fetch(`/api/admin/accounting/dossier-validation?startDate=${startDate}&endDate=${endDate}`).then(r => r.json()),
    enabled: isAuthenticated && canAccessAccounting && activeTab === "dossier",
  });

  const dossierExportMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/accounting/dossier-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });
      if (!response.ok) throw new Error("Erreur lors de la génération");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Dossier_Comptable_${startDate}_${endDate}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast({ title: "Dossier comptable généré", description: "Le dossier comptable complet a été téléchargé" });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const fecExportMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/accounting/fec-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `FEC_${startDate}_${endDate}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/accounting/fec-exports"] });
    },
  });

  const createEntryMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", "/api/admin/accounting/entries", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/accounting/entries"] });
      setManualEntryDialog(false);
      setNewEntryDescription("");
      setNewEntryLines([
        { accountCode: "", accountLabel: "", description: "", debit: "0", credit: "0" },
        { accountCode: "", accountLabel: "", description: "", debit: "0", credit: "0" },
      ]);
    },
  });

  const validateEntryMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("PATCH", `/api/admin/accounting/entries/${id}/validate`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/accounting/entries"] });
    },
  });

  const addEntryLine = () => {
    setNewEntryLines([...newEntryLines, { accountCode: "", accountLabel: "", description: "", debit: "0", credit: "0" }]);
  };

  const updateEntryLine = (index: number, field: string, value: string) => {
    const updated = [...newEntryLines];
    (updated[index] as any)[field] = value;
    setNewEntryLines(updated);
  };

  const handleCreateEntry = () => {
    createEntryMutation.mutate({
      date: newEntryDate,
      journal: newEntryJournal,
      sourceType: "manual",
      description: newEntryDescription,
      lines: newEntryLines.filter(l => l.accountCode),
    });
  };

  const backfillMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/accounting/backfill-invoices", {});
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/accounting/entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/accounting/profit-loss"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/accounting/tva-report"] });
      toast({ title: "Synchronisation terminée", description: data.message });
    },
  });

  const bulkValidateMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/admin/accounting/entries/bulk-validate", { ids });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/accounting/entries"] });
      setSelectedEntryIds(new Set());
      toast({ title: `${data.validated} écriture(s) validée(s)` });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/admin/accounting/entries/bulk-delete", { ids });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/accounting/entries"] });
      setSelectedEntryIds(new Set());
      toast({ title: `${data.deleted} écriture(s) supprimée(s)` });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const bulkEmailMutation = useMutation({
    mutationFn: async ({ ids, email }: { ids: string[]; email: string }) => {
      const res = await apiRequest("POST", "/api/admin/accounting/entries/bulk-email", { ids, email });
      return res.json();
    },
    onSuccess: (data) => {
      setEmailDialog(false);
      toast({ title: `Email envoyé à ${data.to}`, description: `${data.sent} écriture(s) transmise(s)` });
    },
    onError: (err: any) => toast({ title: "Erreur email", description: err.message, variant: "destructive" }),
  });

  const validateAllMutation = useMutation({
    mutationFn: async () => {
      const unvalidatedIds = entries.filter(e => !e.isValidated).map(e => e.id);
      if (unvalidatedIds.length === 0) throw new Error("Toutes les écritures sont déjà validées");
      const res = await apiRequest("POST", "/api/admin/accounting/entries/bulk-validate", { ids: unvalidatedIds });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/accounting/entries"] });
      toast({ title: `${data.validated} écriture(s) validée(s)` });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const dossierEmailMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/admin/accounting/dossier-email", { email, startDate, endDate });
      return res.json();
    },
    onSuccess: (data) => {
      setDossierEmailDialog(false);
      toast({ title: `Dossier envoyé par email`, description: `Résumé transmis à ${data.to}` });
    },
    onError: (err: any) => toast({ title: "Erreur email", description: err.message, variant: "destructive" }),
  });

  const exportCsvMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const selectedEntries = entries.filter(e => ids.includes(e.id));
      const header = "N°,Date,Journal,Source,Libellé,Débit,Crédit,Statut";
      const rows = selectedEntries.map(e =>
        `"${e.entryNumber}","${new Date(e.date).toLocaleDateString("fr-FR")}","${e.journal}","${e.sourceType}","${e.description.replace(/"/g, '""')}","${parseFloat(e.totalDebit || "0").toFixed(2)}","${parseFloat(e.totalCredit || "0").toFixed(2)}","${e.isValidated ? "Validée" : "Brouillon"}"`
      );
      const csv = [header, ...rows].join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ecritures_${startDate}_${endDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => toast({ title: "Export CSV téléchargé" }),
  });

  const toggleEntry = (id: string) => {
    setSelectedEntryIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllEntries = () => {
    if (selectedEntryIds.size === entries.length) {
      setSelectedEntryIds(new Set());
    } else {
      setSelectedEntryIds(new Set(entries.map(e => e.id)));
    }
  };

  if (!isAuthenticated || !canAccessAccounting) return (
    <div className="p-8 flex flex-col items-center justify-center text-center space-y-4">
      <ShieldCheck className="h-12 w-12 text-muted-foreground/40" />
      <h2 className="text-lg font-semibold">Accès restreint</h2>
      <p className="text-muted-foreground text-sm">Le module comptabilité est réservé aux administrateurs principaux.</p>
    </div>
  );

  const tabs = [
    { key: "overview", label: "Vue d'ensemble", icon: BarChart3 },
    { key: "analytics", label: "Analytics", icon: LineChart },
    { key: "journal", label: "Journal", icon: BookOpen },
    { key: "tva", label: "TVA", icon: Percent },
    { key: "fec", label: "Export FEC", icon: FileDown },
    { key: "einvoicing", label: "Facturation élec.", icon: ShieldCheck },
    { key: "dossier", label: "Dossier comptable", icon: FolderArchive },
    { key: "openbanking", label: "OpenBanking", icon: Landmark },
  ];

  const downloadFacturX = async (invoiceId: string, invoiceNumber: string) => {
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/facturx`);
      if (!response.ok) throw new Error("Erreur lors du téléchargement");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `facturx-${invoiceNumber}.xml`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Factur-X téléchargé", description: `${invoiceNumber}.xml généré avec succès` });
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const filteredEInvoices = eInvoicingData?.invoices?.filter(inv => {
    if (complianceFilter === "compliant") return inv.isCompliant;
    if (complianceFilter === "non_compliant") return !inv.isCompliant;
    return true;
  }) || [];

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="page-accounting">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Comptabilité</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Button 
            variant="outline" 
            onClick={() => backfillMutation.mutate()} 
            disabled={backfillMutation.isPending}
            data-testid="button-backfill"
          >
            <RotateCcw className={`h-4 w-4 mr-2 ${backfillMutation.isPending ? "animate-spin" : ""}`} />
            Synchroniser factures
          </Button>
          <Label className="text-sm">Du</Label>
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40" data-testid="input-start-date" />
          <Label className="text-sm">Au</Label>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40" data-testid="input-end-date" />
        </div>
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map(tab => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? "default" : "ghost"}
            onClick={() => setActiveTab(tab.key as any)}
            data-testid={`tab-${tab.key}`}
          >
            <tab.icon className="h-4 w-4 mr-2" />
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6">
          {plLoading || cfLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card data-testid="card-revenue">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Chiffre d'affaires HT</CardTitle>
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-revenue">{formatCurrency(profitLoss?.revenue.net || 0)}</div>
                    <p className="text-xs text-muted-foreground">{profitLoss?.invoiceCount || 0} factures payées</p>
                  </CardContent>
                </Card>

                <Card data-testid="card-expenses">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Charges HT</CardTitle>
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-expenses">{formatCurrency(profitLoss?.expenses.total || 0)}</div>
                    <p className="text-xs text-muted-foreground">{profitLoss?.expenseCount || 0} dépenses</p>
                  </CardContent>
                </Card>

                <Card data-testid="card-profit">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Résultat net</CardTitle>
                    <DollarSign className="h-4 w-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${(profitLoss?.netProfit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`} data-testid="text-profit">
                      {formatCurrency(profitLoss?.netProfit || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">Marge : {profitLoss?.margin || 0}%</p>
                  </CardContent>
                </Card>

                <Card data-testid="card-cashflow">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Trésorerie nette</CardTitle>
                    <Calculator className="h-4 w-4 text-blue-600" />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${(cashFlow?.netCashFlow || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`} data-testid="text-cashflow">
                      {formatCurrency(cashFlow?.netCashFlow || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <ArrowUpRight className="h-3 w-3 inline text-green-600" /> {formatCurrency(cashFlow?.totalInflows || 0)}
                      {" / "}
                      <ArrowDownRight className="h-3 w-3 inline text-red-600" /> {formatCurrency(cashFlow?.totalOutflows || 0)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {(() => {
                const revenueByMonth = profitLoss?.revenue.byMonth || {};
                const expensesByMonth = profitLoss?.expenses.byMonth || {};
                const allMonths = [...new Set([...Object.keys(revenueByMonth), ...Object.keys(expensesByMonth)])].sort();
                const monthlyData = allMonths.map(m => ({
                  name: formatMonth(m),
                  revenue: revenueByMonth[m] || 0,
                  expenses: expensesByMonth[m] || 0,
                  profit: (revenueByMonth[m] || 0) - (expensesByMonth[m] || 0),
                }));

                return monthlyData.length > 0 ? (
                  <Card data-testid="card-monthly-revenue-chart">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Revenus vs Charges par mois
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={monthlyData} barGap={4}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="name" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                            <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                            <RechartsTooltip
                              formatter={(value: number, name: string) => [formatCurrency(value), name === "revenue" ? "Revenus" : name === "expenses" ? "Charges" : "Résultat"]}
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}
                              labelStyle={{ color: 'hsl(var(--foreground))' }}
                            />
                            <Legend formatter={(value) => value === "revenue" ? "Revenus HT" : value === "expenses" ? "Charges HT" : "Résultat"} />
                            <Bar dataKey="revenue" fill="#16a34a" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="expenses" fill="#dc2626" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                ) : null;
              })()}

              {cashFlow?.byMonth && cashFlow.byMonth.length > 0 && (
                <Card data-testid="card-cashflow-chart">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Flux de trésorerie
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={cashFlow.byMonth.map(m => ({ ...m, name: formatMonth(m.month) }))}>
                          <defs>
                            <linearGradient id="gradInflows" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gradOutflows" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#dc2626" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="name" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                          <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                          <RechartsTooltip
                            formatter={(value: number, name: string) => [formatCurrency(value), name === "inflows" ? "Encaissements" : name === "outflows" ? "Décaissements" : "Solde net"]}
                            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}
                            labelStyle={{ color: 'hsl(var(--foreground))' }}
                          />
                          <Legend formatter={(value) => value === "inflows" ? "Encaissements" : value === "outflows" ? "Décaissements" : "Solde net"} />
                          <Area type="monotone" dataKey="inflows" stroke="#16a34a" fill="url(#gradInflows)" strokeWidth={2} />
                          <Area type="monotone" dataKey="outflows" stroke="#dc2626" fill="url(#gradOutflows)" strokeWidth={2} />
                          <Area type="monotone" dataKey="net" stroke="#2563eb" fill="none" strokeWidth={2} strokeDasharray="5 5" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {profitLoss?.expenses.byCategory && profitLoss.expenses.byCategory.length > 0 && (() => {
                  const COLORS = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0891b2", "#ca8a04", "#64748b"];
                  const catData = profitLoss.expenses.byCategory
                    .sort((a, b) => b.total - a.total)
                    .map((cat, i) => ({
                      name: cat.name,
                      value: cat.total,
                      count: cat.count,
                      color: COLORS[i % COLORS.length],
                    }));

                  return (
                    <Card data-testid="card-expenses-by-category">
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Receipt className="h-5 w-5" />
                          Charges par catégorie
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-[280px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={catData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                paddingAngle={3}
                                dataKey="value"
                              >
                                {catData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <RechartsTooltip
                                formatter={(value: number) => formatCurrency(value)}
                                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}
                              />
                              <Legend />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="space-y-2 mt-4">
                          {catData.map((cat, i) => (
                            <div key={i} className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                                <span className="text-sm truncate">{cat.name}</span>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-sm font-bold">{formatCurrency(cat.value)}</span>
                                <span className="text-xs text-muted-foreground ml-2">({cat.count})</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}

                {cashFlow && (
                  <Card data-testid="card-payment-methods-chart">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Calculator className="h-5 w-5" />
                        Moyens de paiement
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        const COLORS_IN = ["#16a34a", "#22c55e", "#4ade80", "#86efac", "#bbf7d0"];
                        const COLORS_OUT = ["#dc2626", "#ef4444", "#f87171", "#fca5a5", "#fecaca"];
                        const inflowData = Object.entries(cashFlow.inflowsByMethod)
                          .sort(([, a], [, b]) => b - a)
                          .map(([method, amount], i) => ({
                            name: paymentMethodLabels[method] || method,
                            value: amount,
                            color: COLORS_IN[i % COLORS_IN.length],
                          }));
                        const outflowData = Object.entries(cashFlow.outflowsByMethod)
                          .sort(([, a], [, b]) => b - a)
                          .map(([method, amount], i) => ({
                            name: paymentMethodLabels[method] || method,
                            value: amount,
                            color: COLORS_OUT[i % COLORS_OUT.length],
                          }));
                        const hasData = inflowData.length > 0 || outflowData.length > 0;
                        return hasData ? (
                          <>
                            <div className="space-y-4">
                              <div>
                                <p className="text-sm font-medium text-green-600 mb-2">Encaissements</p>
                                {inflowData.map((item, i) => (
                                  <div key={i} className="flex items-center justify-between gap-2 py-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                                      <span className="text-sm">{item.name}</span>
                                    </div>
                                    <span className="text-sm font-bold text-green-600">{formatCurrency(item.value)}</span>
                                  </div>
                                ))}
                                {inflowData.length === 0 && (
                                  <p className="text-sm text-muted-foreground">Aucun encaissement</p>
                                )}
                              </div>
                              <div className="border-t pt-4">
                                <p className="text-sm font-medium text-red-600 mb-2">Décaissements</p>
                                {outflowData.map((item, i) => (
                                  <div key={i} className="flex items-center justify-between gap-2 py-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                                      <span className="text-sm">{item.name}</span>
                                    </div>
                                    <span className="text-sm font-bold text-red-600">{formatCurrency(item.value)}</span>
                                  </div>
                                ))}
                                {outflowData.length === 0 && (
                                  <p className="text-sm text-muted-foreground">Aucun décaissement</p>
                                )}
                              </div>
                            </div>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-8">Aucune donnée de paiement sur la période</p>
                        );
                      })()}
                    </CardContent>
                  </Card>
                )}
              </div>

              {tvaReport && (
                <Card data-testid="card-tva-summary-chart">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Percent className="h-5 w-5" />
                      Synthèse TVA
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="flex flex-col items-center justify-center p-4 rounded-md bg-green-50 dark:bg-green-950/30">
                        <p className="text-sm text-muted-foreground mb-1">TVA collectée</p>
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-tva-collected-overview">{formatCurrency(tvaReport.tvaCollected)}</p>
                        <p className="text-xs text-muted-foreground mt-1">{tvaReport.invoiceCount} factures</p>
                      </div>
                      <div className="flex flex-col items-center justify-center p-4 rounded-md bg-red-50 dark:bg-red-950/30">
                        <p className="text-sm text-muted-foreground mb-1">TVA déductible</p>
                        <p className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="text-tva-deductible-overview">{formatCurrency(tvaReport.tvaDeductible)}</p>
                        <p className="text-xs text-muted-foreground mt-1">{tvaReport.expenseCount} dépenses</p>
                      </div>
                      <div className={`flex flex-col items-center justify-center p-4 rounded-md ${tvaReport.tvaNet >= 0 ? 'bg-blue-50 dark:bg-blue-950/30' : 'bg-green-50 dark:bg-green-950/30'}`}>
                        <p className="text-sm text-muted-foreground mb-1">{tvaReport.tvaNet >= 0 ? "TVA à payer" : "Crédit de TVA"}</p>
                        <p className={`text-2xl font-bold ${tvaReport.tvaNet >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`} data-testid="text-tva-net-overview">
                          {formatCurrency(Math.abs(tvaReport.tvaNet))}
                        </p>
                      </div>
                    </div>
                    {Object.keys(tvaReport.tvaByRate).length > 0 && (
                      <div className="h-[200px] mt-6">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={Object.entries(tvaReport.tvaByRate).map(([rate, data]) => ({
                            name: `${parseFloat(rate)}%`,
                            collected: data.collected,
                            deductible: data.deductible,
                          }))}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                            <YAxis tickFormatter={(v) => `${v.toFixed(0)}`} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                            <RechartsTooltip
                              formatter={(value: number, name: string) => [formatCurrency(value), name === "collected" ? "Collectée" : "Déductible"]}
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}
                            />
                            <Legend formatter={(value) => value === "collected" ? "Collectée" : "Déductible"} />
                            <Bar dataKey="collected" fill="#16a34a" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="deductible" fill="#dc2626" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "journal" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={journalFilter} onValueChange={setJournalFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-journal-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les journaux</SelectItem>
                  <SelectItem value="sales">Ventes</SelectItem>
                  <SelectItem value="purchases">Achats</SelectItem>
                  <SelectItem value="bank">Banque</SelectItem>
                  <SelectItem value="cash">Caisse</SelectItem>
                  <SelectItem value="misc">Divers</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => validateAllMutation.mutate()}
                disabled={validateAllMutation.isPending || entries.filter(e => !e.isValidated).length === 0}
                data-testid="button-validate-all"
              >
                {validateAllMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckSquare className="h-4 w-4 mr-2" />}
                Valider tout ({entries.filter(e => !e.isValidated).length})
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => setManualEntryDialog(true)} data-testid="button-new-entry">
                <Plus className="h-4 w-4 mr-2" />
                Nouvelle écriture
              </Button>
            </div>
          </div>

          {selectedEntryIds.size > 0 && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-md border flex-wrap">
              <span className="text-sm font-medium">{selectedEntryIds.size} sélectionnée(s)</span>
              <div className="flex gap-2 ml-auto flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportCsvMutation.mutate(Array.from(selectedEntryIds))}
                  disabled={exportCsvMutation.isPending}
                  data-testid="button-export-selected"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Export CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => bulkValidateMutation.mutate(Array.from(selectedEntryIds))}
                  disabled={bulkValidateMutation.isPending}
                  data-testid="button-validate-selected"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Valider
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEmailDialog(true)}
                  data-testid="button-email-selected"
                >
                  <Mail className="h-4 w-4 mr-1" />
                  Envoyer par mail
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm(`Supprimer ${selectedEntryIds.size} écriture(s) ? Cette action est irréversible.`)) {
                      bulkDeleteMutation.mutate(Array.from(selectedEntryIds));
                    }
                  }}
                  disabled={bulkDeleteMutation.isPending}
                  data-testid="button-delete-selected"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Supprimer
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedEntryIds(new Set())}>Annuler</Button>
              </div>
            </div>
          )}

          {entriesLoading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : entries.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Aucune écriture comptable sur cette période</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="py-3 px-3 w-10">
                          <Checkbox
                            checked={selectedEntryIds.size === entries.length && entries.length > 0}
                            onCheckedChange={toggleAllEntries}
                            data-testid="checkbox-select-all"
                          />
                        </th>
                        <th className="text-left py-3 px-3">N°</th>
                        <th className="text-left py-3 px-3">Date</th>
                        <th className="text-left py-3 px-3">Journal</th>
                        <th className="text-left py-3 px-3">Source</th>
                        <th className="text-left py-3 px-3">Libellé</th>
                        <th className="text-right py-3 px-3">Débit</th>
                        <th className="text-right py-3 px-3">Crédit</th>
                        <th className="text-center py-3 px-3">Statut</th>
                        <th className="text-center py-3 px-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map(entry => (
                        <tr
                          key={entry.id}
                          className={`border-b border-border/50 ${selectedEntryIds.has(entry.id) ? "bg-primary/5" : ""}`}
                          data-testid={`row-entry-${entry.id}`}
                        >
                          <td className="py-3 px-3">
                            <Checkbox
                              checked={selectedEntryIds.has(entry.id)}
                              onCheckedChange={() => toggleEntry(entry.id)}
                              data-testid={`checkbox-entry-${entry.id}`}
                            />
                          </td>
                          <td className="py-3 px-3 font-mono text-xs">{entry.entryNumber}</td>
                          <td className="py-3 px-3 whitespace-nowrap">{new Date(entry.date).toLocaleDateString("fr-FR")}</td>
                          <td className="py-3 px-3">
                            <Badge variant="outline">{journalLabels[entry.journal] || entry.journal}</Badge>
                          </td>
                          <td className="py-3 px-3">
                            <Badge variant="secondary">{sourceLabels[entry.sourceType] || entry.sourceType}</Badge>
                          </td>
                          <td className="py-3 px-3 max-w-[180px] truncate">{entry.description}</td>
                          <td className="py-3 px-3 text-right font-mono">{formatCurrency(parseFloat(entry.totalDebit || "0"))}</td>
                          <td className="py-3 px-3 text-right font-mono">{formatCurrency(parseFloat(entry.totalCredit || "0"))}</td>
                          <td className="py-3 px-3 text-center">
                            {entry.isValidated ? (
                              <Badge variant="default" className="bg-green-600">Validée</Badge>
                            ) : (
                              <Badge variant="outline">Brouillon</Badge>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {!entry.isValidated && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => validateEntryMutation.mutate(entry.id)}
                                data-testid={`button-validate-${entry.id}`}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "analytics" && (
        <div className="space-y-6">
          {plLoading || cfLoading || tvaLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card data-testid="card-analytics-revenue">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">CA net HT</CardTitle>
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{formatCurrency(profitLoss?.revenue.net || 0)}</div>
                    <p className="text-xs text-muted-foreground mt-1">{profitLoss?.invoiceCount || 0} factures · {formatCurrency(profitLoss?.revenue.creditNotes || 0)} d'avoirs</p>
                  </CardContent>
                </Card>
                <Card data-testid="card-analytics-expenses">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Charges HT</CardTitle>
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">{formatCurrency(profitLoss?.expenses.total || 0)}</div>
                    <p className="text-xs text-muted-foreground mt-1">{profitLoss?.expenseCount || 0} dépenses enregistrées</p>
                  </CardContent>
                </Card>
                <Card data-testid="card-analytics-margin">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Marge nette</CardTitle>
                    <Percent className="h-4 w-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${(profitLoss?.margin || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {profitLoss?.margin || 0}%
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Résultat net : {formatCurrency(profitLoss?.netProfit || 0)}</p>
                  </CardContent>
                </Card>
                <Card data-testid="card-analytics-tva">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">TVA à reverser</CardTitle>
                    <Calculator className="h-4 w-4 text-blue-600" />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${(tvaReport?.tvaNet || 0) >= 0 ? "text-blue-600" : "text-green-600"}`}>
                      {formatCurrency(Math.abs(tvaReport?.tvaNet || 0))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{(tvaReport?.tvaNet || 0) >= 0 ? "TVA à payer" : "Crédit de TVA"}</p>
                  </CardContent>
                </Card>
              </div>

              {(() => {
                const revenueByMonth = profitLoss?.revenue.byMonth || {};
                const expensesByMonth = profitLoss?.expenses.byMonth || {};
                const allMonths = [...new Set([...Object.keys(revenueByMonth), ...Object.keys(expensesByMonth)])].sort();
                const monthlyData = allMonths.map(m => ({
                  name: formatMonth(m),
                  revenue: revenueByMonth[m] || 0,
                  expenses: expensesByMonth[m] || 0,
                  profit: (revenueByMonth[m] || 0) - (expensesByMonth[m] || 0),
                }));
                return monthlyData.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Évolution mensuelle — Revenus / Charges / Résultat
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[340px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={monthlyData} barGap={4}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                            <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                            <RechartsTooltip formatter={(value: number, name: string) => [formatCurrency(value), name === "revenue" ? "Revenus" : name === "expenses" ? "Charges" : "Résultat"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px" }} labelStyle={{ color: "hsl(var(--foreground))" }} />
                            <Legend formatter={(v) => v === "revenue" ? "Revenus HT" : v === "expenses" ? "Charges HT" : "Résultat net"} />
                            <Bar dataKey="revenue" fill="#16a34a" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="expenses" fill="#dc2626" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="profit" fill="#2563eb" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                        {(() => {
                          const best = monthlyData.reduce((a, b) => b.revenue > a.revenue ? b : a, monthlyData[0]);
                          const worst = monthlyData.reduce((a, b) => b.revenue < a.revenue ? b : a, monthlyData[0]);
                          const avg = monthlyData.reduce((s, m) => s + m.revenue, 0) / monthlyData.length;
                          return <>
                            <div className="p-3 rounded-md bg-green-50 dark:bg-green-950/20">
                              <p className="text-xs text-muted-foreground">Meilleur mois</p>
                              <p className="font-semibold text-green-700 dark:text-green-400">{best?.name}</p>
                              <p className="text-sm font-bold">{formatCurrency(best?.revenue || 0)}</p>
                            </div>
                            <div className="p-3 rounded-md bg-muted/40">
                              <p className="text-xs text-muted-foreground">Moyenne mensuelle</p>
                              <p className="font-semibold">{formatCurrency(avg)}</p>
                            </div>
                            <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/20">
                              <p className="text-xs text-muted-foreground">Mois le plus faible</p>
                              <p className="font-semibold text-red-700 dark:text-red-400">{worst?.name}</p>
                              <p className="text-sm font-bold">{formatCurrency(worst?.revenue || 0)}</p>
                            </div>
                          </>;
                        })()}
                      </div>
                    </CardContent>
                  </Card>
                ) : null;
              })()}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {cashFlow?.byMonth && cashFlow.byMonth.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Flux de trésorerie
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[240px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={cashFlow.byMonth.map(m => ({ ...m, name: formatMonth(m.month) }))}>
                            <defs>
                              <linearGradient id="gradIn2" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="gradOut2" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#dc2626" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                            <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                            <RechartsTooltip formatter={(value: number, name: string) => [formatCurrency(value), name === "inflows" ? "Encaissements" : name === "outflows" ? "Décaissements" : "Net"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px" }} />
                            <Area type="monotone" dataKey="inflows" stroke="#16a34a" fill="url(#gradIn2)" strokeWidth={2} />
                            <Area type="monotone" dataKey="outflows" stroke="#dc2626" fill="url(#gradOut2)" strokeWidth={2} />
                            <Area type="monotone" dataKey="net" stroke="#2563eb" fill="none" strokeWidth={2} strokeDasharray="5 5" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-3 text-center text-xs">
                        <div className="p-2 rounded bg-green-50 dark:bg-green-950/20">
                          <p className="text-muted-foreground">Encaissements</p>
                          <p className="font-bold text-green-600">{formatCurrency(cashFlow.totalInflows)}</p>
                        </div>
                        <div className="p-2 rounded bg-red-50 dark:bg-red-950/20">
                          <p className="text-muted-foreground">Décaissements</p>
                          <p className="font-bold text-red-600">{formatCurrency(cashFlow.totalOutflows)}</p>
                        </div>
                        <div className="p-2 rounded bg-blue-50 dark:bg-blue-950/20">
                          <p className="text-muted-foreground">Net</p>
                          <p className={`font-bold ${cashFlow.netCashFlow >= 0 ? "text-blue-600" : "text-red-600"}`}>{formatCurrency(cashFlow.netCashFlow)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {profitLoss?.expenses.byCategory && profitLoss.expenses.byCategory.length > 0 && (() => {
                  const COLORS = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0891b2", "#ca8a04"];
                  const catData = profitLoss.expenses.byCategory.sort((a, b) => b.total - a.total).map((cat, i) => ({ name: cat.name, value: cat.total, count: cat.count, color: COLORS[i % COLORS.length] }));
                  return (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Receipt className="h-4 w-4" />
                          Répartition des charges
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-[200px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={catData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                                {catData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                              </Pie>
                              <RechartsTooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px" }} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="space-y-1 mt-2">
                          {catData.slice(0, 5).map((cat, i) => (
                            <div key={i} className="flex items-center justify-between gap-2 text-sm">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                                <span className="truncate text-xs">{cat.name}</span>
                              </div>
                              <span className="text-xs font-bold shrink-0">{formatCurrency(cat.value)}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Percent className="h-4 w-4" />
                    TVA par taux
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                    <div className="flex flex-col items-center p-4 rounded-md bg-green-50 dark:bg-green-950/20">
                      <p className="text-xs text-muted-foreground">TVA collectée</p>
                      <p className="text-xl font-bold text-green-600">{formatCurrency(tvaReport?.tvaCollected || 0)}</p>
                    </div>
                    <div className="flex flex-col items-center p-4 rounded-md bg-red-50 dark:bg-red-950/20">
                      <p className="text-xs text-muted-foreground">TVA déductible</p>
                      <p className="text-xl font-bold text-red-600">{formatCurrency(tvaReport?.tvaDeductible || 0)}</p>
                    </div>
                    <div className={`flex flex-col items-center p-4 rounded-md ${(tvaReport?.tvaNet || 0) >= 0 ? "bg-blue-50 dark:bg-blue-950/20" : "bg-green-50 dark:bg-green-950/20"}`}>
                      <p className="text-xs text-muted-foreground">{(tvaReport?.tvaNet || 0) >= 0 ? "TVA à payer" : "Crédit TVA"}</p>
                      <p className={`text-xl font-bold ${(tvaReport?.tvaNet || 0) >= 0 ? "text-blue-600" : "text-green-600"}`}>{formatCurrency(Math.abs(tvaReport?.tvaNet || 0))}</p>
                    </div>
                  </div>
                  {tvaReport && Object.keys(tvaReport.tvaByRate).length > 0 && (
                    <div className="h-[180px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={Object.entries(tvaReport.tvaByRate).map(([rate, data]) => ({ name: `${parseFloat(rate)}%`, collected: data.collected, deductible: data.deductible }))}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                          <YAxis tickFormatter={(v) => `${v.toFixed(0)}`} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                          <RechartsTooltip formatter={(value: number, name: string) => [formatCurrency(value), name === "collected" ? "Collectée" : "Déductible"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px" }} />
                          <Legend formatter={(v) => v === "collected" ? "Collectée" : "Déductible"} />
                          <Bar dataKey="collected" fill="#16a34a" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="deductible" fill="#dc2626" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {activeTab === "tva" && (
        <div className="space-y-4">
          {tvaLoading ? (
            <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
          ) : tvaReport ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card data-testid="card-tva-collected">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">TVA collectée</CardTitle>
                    <ArrowUpRight className="h-4 w-4 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{formatCurrency(tvaReport.tvaCollected)}</div>
                    <p className="text-xs text-muted-foreground">sur {tvaReport.invoiceCount} factures</p>
                  </CardContent>
                </Card>

                <Card data-testid="card-tva-deductible">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">TVA déductible</CardTitle>
                    <ArrowDownRight className="h-4 w-4 text-red-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">{formatCurrency(tvaReport.tvaDeductible)}</div>
                    <p className="text-xs text-muted-foreground">sur {tvaReport.expenseCount} dépenses</p>
                  </CardContent>
                </Card>

                <Card data-testid="card-tva-net">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">TVA nette à payer</CardTitle>
                    <Receipt className="h-4 w-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${tvaReport.tvaNet >= 0 ? '' : 'text-green-600'}`}>
                      {formatCurrency(tvaReport.tvaNet)}
                    </div>
                    {tvaReport.tvaNet < 0 && <p className="text-xs text-green-600">Crédit de TVA</p>}
                  </CardContent>
                </Card>
              </div>

              {tvaReport.tvaCreditNotes > 0 && (
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">TVA sur avoirs</span>
                      <span className="text-sm font-bold text-red-600">-{formatCurrency(tvaReport.tvaCreditNotes)}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card data-testid="card-tva-by-rate">
                <CardHeader>
                  <CardTitle className="text-lg">Détail par taux de TVA</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3">Taux</th>
                          <th className="text-right py-2 px-3">TVA collectée</th>
                          <th className="text-right py-2 px-3">TVA déductible</th>
                          <th className="text-right py-2 px-3">TVA nette</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(tvaReport.tvaByRate).map(([rate, data]) => (
                          <tr key={rate} className="border-b border-border/50">
                            <td className="py-2 px-3 font-medium">{parseFloat(rate)}%</td>
                            <td className="py-2 px-3 text-right text-green-600">{formatCurrency(data.collected)}</td>
                            <td className="py-2 px-3 text-right text-red-600">{formatCurrency(data.deductible)}</td>
                            <td className={`py-2 px-3 text-right font-bold ${data.net >= 0 ? '' : 'text-green-600'}`}>{formatCurrency(data.net)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Résumé des bases</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between py-2 border-b">
                      <span className="text-sm">Base HT ventes</span>
                      <span className="text-sm font-bold">{formatCurrency(tvaReport.salesHT)}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b">
                      <span className="text-sm">Base HT achats</span>
                      <span className="text-sm font-bold">{formatCurrency(tvaReport.purchasesHT)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="p-12 flex flex-col items-center justify-center text-center space-y-4">
              <ShieldCheck className="h-12 w-12 text-muted-foreground/50" />
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Aucune donnée de facturation électronique</h3>
                <p className="text-muted-foreground max-w-xs mx-auto">
                  Synchronisez vos factures pour analyser leur conformité Factur-X et générer les fichiers XML.
                </p>
              </div>
              <Button onClick={() => backfillMutation.mutate()} disabled={backfillMutation.isPending}>
                <RotateCcw className={`h-4 w-4 mr-2 ${backfillMutation.isPending ? "animate-spin" : ""}`} />
                Synchroniser les factures maintenant
              </Button>
            </Card>
          )}
        </div>
      )}

      {activeTab === "fec" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Export FEC (Fichier des Écritures Comptables)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Le FEC est un fichier obligatoire en France pour la transmission des écritures comptables
                à l'administration fiscale. Il contient toutes les écritures validées sur la période sélectionnée.
              </p>
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <Label>Période du</Label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40" />
                </div>
                <div>
                  <Label>Au</Label>
                  <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40" />
                </div>
                <Button
                  onClick={() => fecExportMutation.mutate()}
                  disabled={fecExportMutation.isPending}
                  className="self-end"
                  data-testid="button-export-fec"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {fecExportMutation.isPending ? "Génération..." : "Télécharger le FEC"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {fecExports.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Historique des exports</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3">Fichier</th>
                        <th className="text-left py-2 px-3">Période</th>
                        <th className="text-right py-2 px-3">Écritures</th>
                        <th className="text-right py-2 px-3">Total débit</th>
                        <th className="text-right py-2 px-3">Total crédit</th>
                        <th className="text-left py-2 px-3">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fecExports.map((exp: any) => (
                        <tr key={exp.id} className="border-b border-border/50">
                          <td className="py-2 px-3 font-mono text-xs">{exp.fileName}</td>
                          <td className="py-2 px-3 text-xs">
                            {new Date(exp.periodStart).toLocaleDateString("fr-FR")} - {new Date(exp.periodEnd).toLocaleDateString("fr-FR")}
                          </td>
                          <td className="py-2 px-3 text-right">{exp.entryCount}</td>
                          <td className="py-2 px-3 text-right font-mono">{formatCurrency(parseFloat(exp.totalDebit || "0"))}</td>
                          <td className="py-2 px-3 text-right font-mono">{formatCurrency(parseFloat(exp.totalCredit || "0"))}</td>
                          <td className="py-2 px-3 text-xs">{new Date(exp.createdAt).toLocaleDateString("fr-FR")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "einvoicing" && (
        <div className="space-y-6">
          {eInvoicingLoading ? (
            <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
          ) : eInvoicingData && eInvoicingData.totalInvoices > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card data-testid="card-einv-total">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total factures</CardTitle>
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{eInvoicingData.totalInvoices}</div>
                  </CardContent>
                </Card>

                <Card data-testid="card-einv-compliant">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Conformes</CardTitle>
                    <CircleCheck className="h-4 w-4 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{eInvoicingData.compliantCount}</div>
                  </CardContent>
                </Card>

                <Card data-testid="card-einv-noncompliant">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Non conformes</CardTitle>
                    <CircleX className="h-4 w-4 text-red-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">{eInvoicingData.nonCompliantCount}</div>
                  </CardContent>
                </Card>

                <Card data-testid="card-einv-rate">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Taux de conformité</CardTitle>
                    <ShieldCheck className="h-4 w-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${eInvoicingData.complianceRate >= 80 ? 'text-green-600' : eInvoicingData.complianceRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                      {eInvoicingData.complianceRate}%
                    </div>
                    <div className="h-2 rounded-full bg-muted mt-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${eInvoicingData.complianceRate >= 80 ? 'bg-green-500' : eInvoicingData.complianceRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${eInvoicingData.complianceRate}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card data-testid="card-garage-compliance">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Informations obligatoires du garage
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: "Raison sociale", ok: eInvoicingData.garageCompliance.hasName },
                      { label: "SIRET", ok: eInvoicingData.garageCompliance.hasSiret },
                      { label: "N° TVA intracom.", ok: eInvoicingData.garageCompliance.hasTvaNumber },
                      { label: "Adresse", ok: eInvoicingData.garageCompliance.hasAddress },
                      { label: "Email", ok: eInvoicingData.garageCompliance.hasEmail },
                      { label: "Téléphone", ok: eInvoicingData.garageCompliance.hasPhone },
                      { label: "IBAN", ok: eInvoicingData.garageCompliance.hasIban },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-2 py-2">
                        {item.ok ? (
                          <CircleCheck className="h-4 w-4 text-green-600 shrink-0" />
                        ) : (
                          <CircleX className="h-4 w-4 text-red-500 shrink-0" />
                        )}
                        <span className={`text-sm ${item.ok ? '' : 'text-red-600 font-medium'}`}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>


              {eInvoicingData.commonIssues.length > 0 && (
                <Card data-testid="card-common-issues">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      Problèmes les plus fréquents
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {eInvoicingData.commonIssues.map(([issue, count], i) => (
                        <div key={i} className="flex items-center justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
                          <span className="text-sm">{issue}</span>
                          <Badge variant="outline">{count} facture{count > 1 ? "s" : ""}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card data-testid="card-einv-invoices">
                <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <CardTitle className="text-lg">Détail par facture</CardTitle>
                  <div className="flex items-center gap-2">
                    <Select value={complianceFilter} onValueChange={(v: any) => setComplianceFilter(v)}>
                      <SelectTrigger className="w-[180px]" data-testid="select-compliance-filter">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Toutes les factures</SelectItem>
                        <SelectItem value="compliant">Conformes</SelectItem>
                        <SelectItem value="non_compliant">Non conformes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent>
                  {filteredEInvoices.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Aucune facture correspondante</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left py-3 px-4">N° Facture</th>
                            <th className="text-left py-3 px-4">Client</th>
                            <th className="text-right py-3 px-4">Montant</th>
                            <th className="text-center py-3 px-4">Statut</th>
                            <th className="text-center py-3 px-4">Conformité</th>
                            <th className="text-left py-3 px-4">Problèmes</th>
                            <th className="text-center py-3 px-4">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredEInvoices.map(inv => (
                            <tr key={inv.id} className="border-b border-border/50" data-testid={`row-einv-${inv.id}`}>
                              <td className="py-3 px-4 font-mono text-xs">{inv.invoiceNumber}</td>
                              <td className="py-3 px-4">{inv.clientName}</td>
                              <td className="py-3 px-4 text-right font-mono">{formatCurrency(parseFloat(inv.amount || "0"))}</td>
                              <td className="py-3 px-4 text-center">
                                <Badge variant={inv.status === "paid" ? "default" : "outline"} className={inv.status === "paid" ? "bg-green-600" : ""}>
                                  {inv.status === "paid" ? "Payée" : inv.status === "pending" ? "En attente" : inv.status === "overdue" ? "En retard" : "Annulée"}
                                </Badge>
                              </td>
                              <td className="py-3 px-4 text-center">
                                {inv.isCompliant ? (
                                  <Badge className="bg-green-600">Conforme</Badge>
                                ) : (
                                  <Badge variant="destructive">{inv.issueCount} problème{inv.issueCount > 1 ? "s" : ""}</Badge>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                {inv.issues.length > 0 ? (
                                  <ul className="text-xs text-muted-foreground space-y-0.5">
                                    {inv.issues.slice(0, 3).map((issue, i) => (
                                      <li key={i} className="flex items-center gap-1">
                                        <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                                        {issue}
                                      </li>
                                    ))}
                                    {inv.issues.length > 3 && (
                                      <li className="text-xs text-muted-foreground">+{inv.issues.length - 3} autres</li>
                                    )}
                                  </ul>
                                ) : (
                                  <span className="text-xs text-green-600">Aucun</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-center">
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => downloadFacturX(inv.id, inv.invoiceNumber)}
                            title="Télécharger Factur-X"
                            data-testid={`button-facturx-${inv.id}`}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => {
                              if (confirm("Voulez-vous vraiment supprimer cette facture ?")) {
                                apiRequest("DELETE", `/api/admin/invoices/${inv.id}`)
                                  .then(() => {
                                    toast({ title: "Facture supprimée" });
                                    queryClient.invalidateQueries({ queryKey: ["/api/admin/invoices"] });
                                  });
                              }
                            }}
                            data-testid={`button-delete-invoice-${inv.id}`}
                          >
                            <CircleX className="h-4 w-4" />
                          </Button>
                        </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Mentions légales obligatoires
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-3">
                      <h4 className="font-semibold">Informations vendeur</h4>
                      <ul className="space-y-1.5 text-muted-foreground">
                        <li>Raison sociale ou nom commercial</li>
                        <li>Adresse du siège social</li>
                        <li>Numéro SIRET / SIREN</li>
                        <li>Numéro de TVA intracommunautaire</li>
                        <li>Forme juridique et capital social</li>
                        <li>Numéro RCS et ville d'immatriculation</li>
                      </ul>
                    </div>
                    <div className="space-y-3">
                      <h4 className="font-semibold">Informations facture</h4>
                      <ul className="space-y-1.5 text-muted-foreground">
                        <li>Numéro de facture unique et séquentiel</li>
                        <li>Date d'émission</li>
                        <li>Identité et adresse de l'acheteur</li>
                        <li>Désignation et quantité des prestations</li>
                        <li>Prix unitaire HT, montant HT, taux TVA, montant TVA</li>
                        <li>Montant total TTC</li>
                        <li>Date d'échéance et conditions de paiement</li>
                        <li>Pénalités de retard et indemnité forfaitaire</li>
                      </ul>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-muted/50 rounded-md">
                    <p className="text-xs text-muted-foreground">
                      La facturation électronique est obligatoire en France pour les entreprises assujetties à la TVA.
                      Le format Factur-X (EN 16931) est le standard hybride français combinant un PDF lisible et un fichier XML structuré
                      conforme à la norme CII (Cross-Industry Invoice). Vous pouvez télécharger le XML Factur-X pour chaque facture ci-dessus.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="p-12 flex flex-col items-center justify-center text-center space-y-4">
              <ShieldCheck className="h-12 w-12 text-muted-foreground/50" />
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Aucune donnée de facturation électronique</h3>
                <p className="text-muted-foreground max-w-xs mx-auto">
                  Synchronisez vos factures pour analyser leur conformité Factur-X et générer les fichiers XML.
                </p>
              </div>
              <Button onClick={() => backfillMutation.mutate()} disabled={backfillMutation.isPending}>
                <RotateCcw className={`h-4 w-4 mr-2 ${backfillMutation.isPending ? "animate-spin" : ""}`} />
                Synchroniser les factures maintenant
              </Button>
            </Card>
          )}
        </div>
      )}

      {activeTab === "dossier" && (
        <div className="space-y-6">
          {dossierLoading ? (
            <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
          ) : dossierValidation ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card data-testid="card-dossier-invoices">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Factures</CardTitle>
                    <Receipt className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{dossierValidation.summary.invoiceCount}</div>
                  </CardContent>
                </Card>
                <Card data-testid="card-dossier-expenses">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Dépenses</CardTitle>
                    <TrendingDown className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{dossierValidation.summary.expenseCount}</div>
                  </CardContent>
                </Card>
                <Card data-testid="card-dossier-creditnotes">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Avoirs</CardTitle>
                    <RotateCcw className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{dossierValidation.summary.creditNoteCount}</div>
                  </CardContent>
                </Card>
                <Card data-testid="card-dossier-entries">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Écritures</CardTitle>
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{dossierValidation.summary.entryCount}</div>
                    <p className="text-xs text-muted-foreground">{dossierValidation.summary.validatedEntryCount} validées</p>
                  </CardContent>
                </Card>
                <Card data-testid="card-dossier-status">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Statut</CardTitle>
                    {dossierValidation.isReady ? (
                      <CircleCheck className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className={`text-lg font-bold ${dossierValidation.isReady ? 'text-green-600' : 'text-amber-600'}`}>
                      {dossierValidation.isReady ? "Prêt" : "À compléter"}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {dossierValidation.warnings.length > 0 && (
                <Card data-testid="card-dossier-warnings">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      Validation du dossier
                      <div className="flex gap-2 ml-auto">
                        {dossierValidation.errorCount > 0 && (
                          <Badge variant="destructive">{dossierValidation.errorCount} erreur{dossierValidation.errorCount > 1 ? "s" : ""}</Badge>
                        )}
                        {dossierValidation.warningCount > 0 && (
                          <Badge className="bg-amber-500">{dossierValidation.warningCount} avertissement{dossierValidation.warningCount > 1 ? "s" : ""}</Badge>
                        )}
                        {dossierValidation.infoCount > 0 && (
                          <Badge variant="secondary">{dossierValidation.infoCount} info{dossierValidation.infoCount > 1 ? "s" : ""}</Badge>
                        )}
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {dossierValidation.warnings
                        .sort((a, b) => {
                          const order = { error: 0, warning: 1, info: 2 };
                          return order[a.severity] - order[b.severity];
                        })
                        .map((w, i) => (
                        <div key={i} className="flex items-center justify-between gap-4 py-2 border-b border-border/50 last:border-0" data-testid={`row-warning-${i}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            {w.severity === "error" ? (
                              <CircleX className="h-4 w-4 text-red-500 shrink-0" />
                            ) : w.severity === "warning" ? (
                              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                            ) : (
                              <Info className="h-4 w-4 text-blue-500 shrink-0" />
                            )}
                            <span className="text-sm">{w.message}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {w.count && w.count > 0 && (
                              <Badge variant="outline">{w.count}</Badge>
                            )}
                            <Badge variant={w.severity === "error" ? "destructive" : w.severity === "warning" ? "outline" : "secondary"}>
                              {w.category === "garage" ? "Garage" : w.category === "invoices" ? "Factures" : w.category === "expenses" ? "Dépenses" : w.category === "entries" ? "Écritures" : w.category === "creditNotes" ? "Avoirs" : w.category}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {dossierValidation.warnings.length === 0 && (
                <Card data-testid="card-dossier-clean">
                  <CardContent className="flex items-center gap-3 py-6">
                    <CircleCheck className="h-8 w-8 text-green-600 shrink-0" />
                    <div>
                      <p className="font-semibold text-green-700">Dossier complet</p>
                      <p className="text-sm text-muted-foreground">Toutes les informations obligatoires sont renseignées. Le dossier comptable est prêt à être généré.</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card data-testid="card-dossier-export">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FolderArchive className="h-5 w-5" />
                    Générer le dossier comptable complet
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Le dossier comptable contient l'identification de l'entreprise, le compte de résultat simplifié,
                    la déclaration de TVA, la synthèse des opérations, et le détail de toutes les factures, dépenses et avoirs
                    sur la période sélectionnée.
                  </p>
                  <div className="flex items-center gap-4 flex-wrap">
                    <div>
                      <Label>Période du</Label>
                      <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40" data-testid="input-dossier-start" />
                    </div>
                    <div>
                      <Label>Au</Label>
                      <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40" data-testid="input-dossier-end" />
                    </div>
                    <Button
                      onClick={() => dossierExportMutation.mutate()}
                      disabled={dossierExportMutation.isPending}
                      className="self-end"
                      data-testid="button-export-dossier"
                    >
                      {dossierExportMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Génération...
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4 mr-2" />
                          Télécharger
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setDossierEmailDialog(true)}
                      className="self-end"
                      data-testid="button-email-dossier"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Envoyer par email
                    </Button>
                  </div>
                  {!dossierValidation.isReady && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                        <p className="text-sm text-amber-800 dark:text-amber-200">
                          Attention : des informations obligatoires sont manquantes. Le dossier sera généré mais peut être incomplet.
                          Corrigez les erreurs ci-dessus pour un dossier complet.
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Contenu du dossier comptable</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-3">
                      <h4 className="font-semibold">Documents inclus</h4>
                      <ul className="space-y-1.5 text-muted-foreground">
                        <li className="flex items-center gap-2"><CircleCheck className="h-3 w-3 text-green-600 shrink-0" /> Identification de l'entreprise</li>
                        <li className="flex items-center gap-2"><CircleCheck className="h-3 w-3 text-green-600 shrink-0" /> Compte de résultat simplifié</li>
                        <li className="flex items-center gap-2"><CircleCheck className="h-3 w-3 text-green-600 shrink-0" /> Déclaration de TVA</li>
                        <li className="flex items-center gap-2"><CircleCheck className="h-3 w-3 text-green-600 shrink-0" /> Synthèse des opérations</li>
                        <li className="flex items-center gap-2"><CircleCheck className="h-3 w-3 text-green-600 shrink-0" /> Détail des factures</li>
                        <li className="flex items-center gap-2"><CircleCheck className="h-3 w-3 text-green-600 shrink-0" /> Détail des dépenses</li>
                        <li className="flex items-center gap-2"><CircleCheck className="h-3 w-3 text-green-600 shrink-0" /> Détail des avoirs</li>
                      </ul>
                    </div>
                    <div className="space-y-3">
                      <h4 className="font-semibold">Exports complémentaires</h4>
                      <ul className="space-y-1.5 text-muted-foreground">
                        <li className="flex items-center gap-2"><FileDown className="h-3 w-3 shrink-0" /> Export FEC (onglet dédié)</li>
                        <li className="flex items-center gap-2"><ShieldCheck className="h-3 w-3 shrink-0" /> Factur-X XML (onglet facturation électronique)</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="p-12 flex flex-col items-center justify-center text-center space-y-4">
              <FolderArchive className="h-12 w-12 text-muted-foreground/50" />
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Dossier comptable</h3>
                <p className="text-muted-foreground max-w-xs mx-auto">
                  Sélectionnez une période pour valider et générer votre dossier comptable complet.
                </p>
              </div>
            </Card>
          )}
        </div>
      )}

      {activeTab === "openbanking" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2">
            <Landmark className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">OpenBanking & Import bancaire</h2>
          </div>
          <OpenBankingPanel />
        </div>
      )}

      {/* Manual Entry Dialog */}
      <Dialog open={manualEntryDialog} onOpenChange={setManualEntryDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nouvelle écriture comptable</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Date</Label>
                <Input type="date" value={newEntryDate} onChange={e => setNewEntryDate(e.target.value)} data-testid="input-entry-date" />
              </div>
              <div>
                <Label>Journal</Label>
                <Select value={newEntryJournal} onValueChange={setNewEntryJournal}>
                  <SelectTrigger data-testid="select-entry-journal">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sales">Ventes</SelectItem>
                    <SelectItem value="purchases">Achats</SelectItem>
                    <SelectItem value="bank">Banque</SelectItem>
                    <SelectItem value="cash">Caisse</SelectItem>
                    <SelectItem value="misc">Divers</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Libellé</Label>
              <Textarea value={newEntryDescription} onChange={e => setNewEntryDescription(e.target.value)} data-testid="input-entry-description" />
            </div>
            <div>
              <Label className="mb-2 block">Lignes d'écriture</Label>
              <div className="space-y-2">
                {newEntryLines.map((line, i) => (
                  <div key={i} className="grid grid-cols-5 gap-2">
                    <Input placeholder="N° compte" value={line.accountCode} onChange={e => updateEntryLine(i, "accountCode", e.target.value)} data-testid={`input-line-account-${i}`} />
                    <Input placeholder="Libellé compte" value={line.accountLabel} onChange={e => updateEntryLine(i, "accountLabel", e.target.value)} />
                    <Input placeholder="Description" value={line.description} onChange={e => updateEntryLine(i, "description", e.target.value)} />
                    <Input type="number" placeholder="Débit" value={line.debit} onChange={e => updateEntryLine(i, "debit", e.target.value)} />
                    <Input type="number" placeholder="Crédit" value={line.credit} onChange={e => updateEntryLine(i, "credit", e.target.value)} />
                  </div>
                ))}
              </div>
              <Button variant="outline" onClick={addEntryLine} className="mt-2" data-testid="button-add-line">
                <Plus className="h-4 w-4 mr-2" />
                Ajouter une ligne
              </Button>
            </div>
            <div className="flex justify-between text-sm">
              <span>Total débit : {formatCurrency(newEntryLines.reduce((s, l) => s + parseFloat(l.debit || "0"), 0))}</span>
              <span>Total crédit : {formatCurrency(newEntryLines.reduce((s, l) => s + parseFloat(l.credit || "0"), 0))}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualEntryDialog(false)}>Annuler</Button>
            <Button
              onClick={handleCreateEntry}
              disabled={createEntryMutation.isPending || !newEntryDescription}
              data-testid="button-save-entry"
            >
              {createEntryMutation.isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email ecritures Dialog */}
      <Dialog open={emailDialog} onOpenChange={setEmailDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Envoyer les écritures par email</DialogTitle>
            <DialogDescription>
              {selectedEntryIds.size} écriture(s) sélectionnée(s) seront envoyées à l'adresse ci-dessous.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Adresse email destinataire</Label>
              <Input
                type="email"
                value={emailTarget}
                onChange={e => setEmailTarget(e.target.value)}
                placeholder="expert-comptable@cabinet.fr"
                data-testid="input-email-target"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialog(false)}>Annuler</Button>
            <Button
              onClick={() => bulkEmailMutation.mutate({ ids: Array.from(selectedEntryIds), email: emailTarget })}
              disabled={bulkEmailMutation.isPending || !emailTarget}
              data-testid="button-send-email"
            >
              {bulkEmailMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
              Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dossier Email Dialog */}
      <Dialog open={dossierEmailDialog} onOpenChange={setDossierEmailDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Envoyer le dossier par email</DialogTitle>
            <DialogDescription>
              Un résumé du dossier comptable ({startDate} → {endDate}) sera envoyé à l'adresse ci-dessous.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Adresse email destinataire</Label>
              <Input
                type="email"
                value={dossierEmailTarget}
                onChange={e => setDossierEmailTarget(e.target.value)}
                placeholder="expert-comptable@cabinet.fr"
                data-testid="input-dossier-email-target"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDossierEmailDialog(false)}>Annuler</Button>
            <Button
              onClick={() => dossierEmailMutation.mutate(dossierEmailTarget)}
              disabled={dossierEmailMutation.isPending || !dossierEmailTarget}
              data-testid="button-send-dossier-email"
            >
              {dossierEmailMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
              Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}