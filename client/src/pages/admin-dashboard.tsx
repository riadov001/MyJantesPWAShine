import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { 
  FileText, 
  DollarSign, 
  Calendar, 
  Users,
  Download,
  Filter,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  PieChart,
  BarChart3,
  FileSpreadsheet,
  File,
  X,
  Percent,
  Clock,
  CreditCard,
  Target,
  Zap,
  Activity,
  Eye as EyeIcon,
  Send,
  MailX,
  EyeOff,
  CheckCircle2,
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
  PieChart as RechartsPieChart,
  Pie,
  Legend,
  AreaChart,
  Area,
  ReferenceLine,
  ComposedChart
} from "recharts";
import type { Quote, Invoice, Reservation, User, Service } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import { generateDashboardPDF } from "@/lib/pdf-generator";

interface AnalyticsData {
  monthlyRevenue: { name: string; total: number }[];
  weeklyRevenue: { week: string; revenue: number; invoices: number }[];
  dailyRevenue: { date: string; revenue: number; invoices: number }[];
  dailyViews?: { date: string; quotes: number; invoices: number }[];
  dailyObjective: number;
  revenueByPaymentMethod: { method: string; amount: number }[];
  revenueByService: { name: string; revenue: number; count: number }[];
  invoiceStatusStats: { paid: number; pending: number; overdue: number; cancelled: number };
  quoteStatusStats: { pending: number; approved: number; accepted: number; rejected: number; completed: number };
  globalRevenue: number;
  pendingRevenue: number;
  avgInvoiceAmount: number;
  conversionRate: string;
  totalInvoices: number;
  totalQuotes: number;
  totalReservations: number;
  tracking?: {
    quotesSent: number;
    quotesViewed: number;
    quotesNotSent: number;
    invoicesSent: number;
    invoicesViewed: number;
    invoicesNotSent: number;
  };
  services: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  filterApplied: boolean;
  filteredInvoiceIds: string[];
  filteredQuoteIds: string[];
  currentMonth: {
    revenue: number;
    pending: number;
    invoiceCount: number;
    quoteCount: number;
    paidCount: number;
    growth: string;
    monthName: string;
  };
}

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#6b7280', '#3b82f6', '#8b5cf6'];
const PAYMENT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];


export default function AdminDashboard() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading, isAdmin, isSuperAdmin } = useAuth();
  
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("all");
  const [serviceId, setServiceId] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = "/api/login";
    }
  }, [isAuthenticated, isLoading]);

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    if (paymentMethod !== "all") params.append("paymentMethod", paymentMethod);
    if (serviceId !== "all") params.append("serviceId", serviceId);
    return params.toString() ? `?${params.toString()}` : "";
  };

  const { data: analytics, isLoading: analyticsLoading, refetch } = useQuery<AnalyticsData>({
    queryKey: ["/api/admin/analytics", startDate, endDate, paymentMethod, serviceId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics${buildQueryString()}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    enabled: isAuthenticated && isAdmin,
  });

  const { data: quotes = [] } = useQuery<Quote[]>({
    queryKey: ["/api/admin/quotes"],
    enabled: isAuthenticated && isAdmin,
  });

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["/api/admin/invoices"],
    enabled: isAuthenticated && isAdmin,
  });

  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAuthenticated && isAdmin,
  });

  const clearFilters = () => {
    setStartDate("");
    setEndDate("");
    setPaymentMethod("all");
    setServiceId("all");
  };

  // Period preset functions
  const setCurrentMonth = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const setLastThreeMonths = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const setLastSixMonths = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const setCurrentYear = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 11, 31);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const exportPDF = async () => {
    if (!analytics) {
      toast({ title: "Erreur", description: "Données non disponibles", variant: "destructive" });
      return;
    }

    toast({ title: "Génération du PDF...", description: "Capture des graphiques en cours" });

    // Capture chart images using html2canvas
    const chartImages: Record<string, string> = {};
    
    const captureChart = async (selector: string, name: string) => {
      const element = document.querySelector(selector);
      if (element) {
        try {
          const canvas = await html2canvas(element as HTMLElement, {
            backgroundColor: '#ffffff',
            scale: 2,
            logging: false,
          });
          chartImages[name] = canvas.toDataURL('image/png');
        } catch (e) {
          console.error(`Failed to capture ${name}:`, e);
        }
      }
    };

    await Promise.all([
      captureChart('[data-testid="chart-revenue"]', 'revenue'),
      captureChart('[data-testid="chart-service"]', 'service'),
      captureChart('[data-testid="chart-payment-method"]', 'method'),
    ]);

    try {
      await generateDashboardPDF(analytics, chartImages, null);
      toast({ title: "Export PDF réussi", description: "Le rapport avec graphiques a été téléchargé" });
    } catch (error) {
      console.error('PDF generation error:', error);
      toast({ title: "Erreur", description: "Erreur lors de la génération du PDF", variant: "destructive" });
    }
  };

  const exportXLS = () => {
    if (!analytics || invoices.length === 0) {
      toast({ title: "Erreur", description: "Données non disponibles", variant: "destructive" });
      return;
    }

    const wb = XLSX.utils.book_new();

    const summaryData = [
      ["Indicateur", "Valeur"],
      ["Chiffre d'affaires global", analytics.globalRevenue],
      ["Revenus en attente", analytics.pendingRevenue],
      ["Montant moyen facture", analytics.avgInvoiceAmount],
      ["Taux de conversion devis", `${analytics.conversionRate}%`],
      ["Total factures", analytics.totalInvoices],
      ["Total devis", analytics.totalQuotes],
      ["Total réservations", analytics.totalReservations],
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, "Résumé");

    const monthlyData = [
      ["Mois", "Revenus"],
      ...analytics.monthlyRevenue.map(m => [m.name, m.total])
    ];
    const monthlySheet = XLSX.utils.aoa_to_sheet(monthlyData);
    XLSX.utils.book_append_sheet(wb, monthlySheet, "Revenus Mensuels");

    if (analytics.revenueByService.length > 0) {
      const serviceData = [
        ["Service", "Revenus", "Nombre de devis"],
        ...analytics.revenueByService.map(s => [s.name, s.revenue, s.count])
      ];
      const serviceSheet = XLSX.utils.aoa_to_sheet(serviceData);
      XLSX.utils.book_append_sheet(wb, serviceSheet, "Par Service");
    }

    const filteredInvoiceSet = new Set(analytics.filteredInvoiceIds);
    const filteredQuoteSet = new Set(analytics.filteredQuoteIds);
    
    const filteredInvoices = analytics.filterApplied 
      ? invoices.filter(inv => filteredInvoiceSet.has(inv.id))
      : invoices;
    const filteredQuotes = analytics.filterApplied 
      ? quotes.filter(q => filteredQuoteSet.has(q.id))
      : quotes;

    const invoiceData = filteredInvoices.map(inv => ({
      "Numéro": inv.invoiceNumber,
      "Montant": parseFloat(inv.amount || "0"),
      "Statut": inv.status,
      "Mode de paiement": inv.paymentMethod,
      "Date de création": new Date(inv.createdAt!).toLocaleDateString('fr-FR'),
      "Échéance": inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('fr-FR') : "",
    }));
    const invoiceSheet = XLSX.utils.json_to_sheet(invoiceData);
    XLSX.utils.book_append_sheet(wb, invoiceSheet, "Factures");

    const quoteData = filteredQuotes.map(q => ({
      "Référence": q.reference,
      "Montant": parseFloat(q.quoteAmount || "0"),
      "Statut": q.status,
      "Date de création": new Date(q.createdAt!).toLocaleDateString('fr-FR'),
    }));
    const quoteSheet = XLSX.utils.json_to_sheet(quoteData);
    XLSX.utils.book_append_sheet(wb, quoteSheet, "Devis");

    XLSX.writeFile(wb, `export-analyse-${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: "Export XLS réussi", description: "Le fichier Excel a été téléchargé" });
  };

  if (isLoading || !isAdmin) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  const invoicePieData = analytics ? [
    { name: 'Payées', value: analytics.invoiceStatusStats.paid },
    { name: 'En attente', value: analytics.invoiceStatusStats.pending },
    { name: 'En retard', value: analytics.invoiceStatusStats.overdue },
    { name: 'Annulées', value: analytics.invoiceStatusStats.cancelled },
  ].filter(d => d.value > 0) : [];

  const quotePieData = analytics ? [
    { name: 'Approuvés', value: analytics.quoteStatusStats.approved },
    { name: 'Acceptés', value: analytics.quoteStatusStats.accepted },
    { name: 'En attente', value: analytics.quoteStatusStats.pending },
    { name: 'Refusés', value: analytics.quoteStatusStats.rejected },
    { name: 'Terminés', value: analytics.quoteStatusStats.completed },
  ].filter(d => d.value > 0) : [];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight gradient-text" data-testid="text-dashboard-title">Tableau de Bord Analytique</h1>
          <p className="text-muted-foreground mt-1">Analyse complète de votre activité</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className="gap-2" data-testid="button-toggle-filters">
            <Filter className="h-4 w-4" /> Filtres
            {analytics?.filterApplied && <Badge variant="secondary" className="ml-1">Actifs</Badge>}
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF} className="gap-2" data-testid="button-export-pdf">
            <File className="h-4 w-4" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportXLS} className="gap-2" data-testid="button-export-xls">
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
        </div>
      </div>

      {/* Current Month Highlight Section */}
      <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20 glow-primary" data-testid="card-current-month">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                {analytics?.currentMonth?.monthName ? `CA ${analytics.currentMonth.monthName.charAt(0).toUpperCase() + analytics.currentMonth.monthName.slice(1)}` : 'CA Mois en cours'}
              </CardTitle>
              <div className="flex flex-wrap gap-2 items-center">
                <Badge className={`text-sm ${parseFloat(analytics?.currentMonth?.growth || "0") >= 0 ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-red-600 text-white hover:bg-red-700"}`}>
                  {parseFloat(analytics?.currentMonth?.growth || "0") >= 0 ? '+' : ''}{analytics?.currentMonth?.growth || 0}% vs mois précédent
                </Badge>
                <div className="flex items-center gap-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-1 rounded-md text-xs font-medium border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                  <span className="whitespace-nowrap">Factur-X 2026</span>
                </div>
              </div>
            </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="col-span-2 md:col-span-1">
              <div className="text-3xl font-bold text-primary" data-testid="text-current-month-revenue">
                {analyticsLoading ? <Skeleton className="h-10 w-28" /> : `${(analytics?.currentMonth?.revenue ?? 0).toLocaleString('fr-FR')} €`}
              </div>
              <p className="text-sm text-muted-foreground">Encaissé</p>
            </div>
            <div>
              <div className="text-xl font-semibold text-amber-600">
                {analyticsLoading ? <Skeleton className="h-7 w-20" /> : `${(analytics?.currentMonth?.pending ?? 0).toLocaleString('fr-FR')} €`}
              </div>
              <p className="text-xs text-muted-foreground">En attente</p>
            </div>
            <div>
              <div className="text-xl font-semibold">
                {analyticsLoading ? <Skeleton className="h-7 w-12" /> : analytics?.currentMonth?.invoiceCount ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">Factures</p>
            </div>
            <div>
              <div className="text-xl font-semibold text-emerald-600">
                {analyticsLoading ? <Skeleton className="h-7 w-12" /> : analytics?.currentMonth?.paidCount ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">Payées</p>
            </div>
            <div>
              <div className="text-xl font-semibold">
                {analyticsLoading ? <Skeleton className="h-7 w-12" /> : analytics?.currentMonth?.quoteCount ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">Devis</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {showFilters && (
        <Card data-testid="card-filters">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5" /> Filtres d'analyse
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowFilters(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Period presets */}
            <div className="flex flex-wrap gap-2">
              <Label className="w-full text-sm text-muted-foreground">Périodes prédéfinies</Label>
              <Button variant="outline" size="sm" onClick={setCurrentMonth} data-testid="button-period-month">
                Ce mois
              </Button>
              <Button variant="outline" size="sm" onClick={setLastThreeMonths} data-testid="button-period-3months">
                3 derniers mois
              </Button>
              <Button variant="outline" size="sm" onClick={setLastSixMonths} data-testid="button-period-6months">
                6 derniers mois
              </Button>
              <Button variant="outline" size="sm" onClick={setCurrentYear} data-testid="button-period-year">
                Cette année
              </Button>
              <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-period-all">
                Tout
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label>Date de début</Label>
                <Input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)}
                  data-testid="input-start-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Date de fin</Label>
                <Input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)}
                  data-testid="input-end-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Mode de paiement</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger data-testid="select-payment-method">
                    <SelectValue placeholder="Tous" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="card">Carte bancaire</SelectItem>
                    <SelectItem value="wire_transfer">Virement</SelectItem>
                    <SelectItem value="cash">Espèces</SelectItem>
                    <SelectItem value="check">Chèque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Service</Label>
                <Select value={serviceId} onValueChange={setServiceId}>
                  <SelectTrigger data-testid="select-service">
                    <SelectValue placeholder="Tous" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les services</SelectItem>
                    {analytics?.services.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button variant="secondary" onClick={clearFilters} className="w-full" data-testid="button-clear-filters">
                  Réinitialiser
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Motivational Cards */}
      {(() => {
        const now = new Date();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const currentDay = now.getDate();
        const dailyObj = analytics?.dailyObjective || 0;
        const monthlyObjective = dailyObj > 0 ? dailyObj * daysInMonth : 10000;
        const monthRevenue = analytics?.currentMonth?.revenue ?? 0;
        const progressPercent = monthlyObjective > 0 ? Math.min((monthRevenue / monthlyObjective) * 100, 100) : 0;

        const dailyData = analytics?.dailyRevenue || [];
        const todayStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        const todayRevenue = dailyData.find(d => d.date === todayStr)?.revenue ?? 0;
        const yesterdayRevenue = dailyData.find(d => d.date === yesterdayStr)?.revenue ?? 0;
        const dailyVariation = yesterdayRevenue > 0
          ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100
          : todayRevenue > 0 ? 100 : 0;
        const isUp = dailyVariation >= 0;

        const daysElapsed = currentDay;
        const avgDaily = daysElapsed > 0 ? monthRevenue / daysElapsed : 0;
        const projection = avgDaily * daysInMonth;
        const remainingDays = daysInMonth - currentDay;
        const requiredDaily = remainingDays > 0 ? Math.max(0, (monthlyObjective - monthRevenue) / remainingDays) : 0;

        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="glow-card stat-card-gradient" data-testid="card-kpi-monthly-objective">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-9 h-9 rounded-md bg-emerald-500/10">
                      <Target className="h-5 w-5 text-emerald-600" />
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">Objectif Mensuel</span>
                  </div>
                  <span className={`text-sm font-bold ${progressPercent >= 100 ? 'text-emerald-600' : progressPercent >= 70 ? 'text-amber-600' : 'text-red-500'}`}>
                    {progressPercent.toFixed(0)}%
                  </span>
                </div>
                <div className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-kpi-month-revenue">
                  {analyticsLoading ? <Skeleton className="h-9 w-32" /> : `${monthRevenue.toLocaleString('fr-FR')} €`}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  sur {monthlyObjective.toLocaleString('fr-FR')} €
                </p>
                <div className="mt-3 w-full h-2.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${progressPercent >= 100 ? 'bg-emerald-500' : progressPercent >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${progressPercent}%` }}
                    data-testid="progress-monthly-objective"
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Projection</span>
                  <span className={`font-semibold ${projection >= monthlyObjective ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {analyticsLoading ? '...' : `${projection.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="glow-card stat-card-gradient" data-testid="card-kpi-daily-revenue">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-md bg-blue-500/10">
                    <Zap className="h-5 w-5 text-blue-600" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">Encaissement du Jour</span>
                </div>
                <div className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-kpi-today-revenue">
                  {analyticsLoading ? <Skeleton className="h-9 w-28" /> : `${todayRevenue.toLocaleString('fr-FR')} €`}
                </div>
                <div className="mt-2 flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Hier :</span>
                    <span className="text-xs font-medium">{yesterdayRevenue.toLocaleString('fr-FR')} €</span>
                  </div>
                  <div className={`flex items-center gap-0.5 text-xs font-bold ${isUp ? 'text-emerald-600' : 'text-red-500'}`} data-testid="text-kpi-daily-variation">
                    {isUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    {dailyVariation === 0 && yesterdayRevenue === 0 && todayRevenue === 0 ? '—' : `${isUp ? '+' : ''}${dailyVariation.toFixed(0)}%`}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glow-card stat-card-gradient" data-testid="card-kpi-daily-average">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-md bg-violet-500/10">
                    <Activity className="h-5 w-5 text-violet-600" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">Moyenne Journalière</span>
                </div>
                <div className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-kpi-daily-avg">
                  {analyticsLoading ? <Skeleton className="h-9 w-28" /> : `${avgDaily.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">/jour actuel</p>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Objectif/jour restant</span>
                  <span className={`font-bold ${requiredDaily <= avgDaily ? 'text-emerald-600' : 'text-red-500'}`}>
                    {analyticsLoading ? '...' : `${requiredDaily.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="stat-card-gradient glow-card hover-elevate transition-all cursor-pointer" data-testid="card-global-revenue" onClick={() => setLocation('/admin/invoices?status=paid')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 gap-2">
            <CardTitle className="text-sm font-medium">CA Global</CardTitle>
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-global-revenue">
              {analyticsLoading ? <Skeleton className="h-8 w-24" /> : `${(analytics?.globalRevenue ?? 0).toLocaleString('fr-FR')} \u20AC`}
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-emerald-500" />
              Factures payées
            </p>
          </CardContent>
        </Card>

        <Card className="stat-card-gradient glow-card hover-elevate transition-all cursor-pointer" data-testid="card-pending-revenue" onClick={() => setLocation('/admin/invoices?status=pending')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 gap-2">
            <CardTitle className="text-sm font-medium">En attente</CardTitle>
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-amber-500/10">
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pending-revenue">
              {analyticsLoading ? <Skeleton className="h-8 w-24" /> : `${(analytics?.pendingRevenue ?? 0).toLocaleString('fr-FR')} \u20AC`}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Revenus non encaissés</p>
          </CardContent>
        </Card>

        <Card className="stat-card-gradient glow-card hover-elevate transition-all cursor-pointer" data-testid="card-avg-invoice" onClick={() => setLocation('/admin/invoices')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 gap-2">
            <CardTitle className="text-sm font-medium">Panier moyen</CardTitle>
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-blue-500/10">
              <CreditCard className="h-4 w-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-invoice">
              {analyticsLoading ? <Skeleton className="h-8 w-24" /> : `${(analytics?.avgInvoiceAmount ?? 0).toFixed(2)} \u20AC`}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Par facture payée</p>
          </CardContent>
        </Card>

        <Card className="stat-card-gradient glow-card hover-elevate transition-all cursor-pointer" data-testid="card-conversion-rate" onClick={() => setLocation('/admin/quotes')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 gap-2">
            <CardTitle className="text-sm font-medium">Taux conversion</CardTitle>
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-emerald-500/10">
              <Percent className="h-4 w-4 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-conversion-rate">
              {analyticsLoading ? <Skeleton className="h-8 w-16" /> : `${analytics?.conversionRate ?? 0}%`}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Devis acceptés</p>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-daily-revenue-chart">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Suivi Journalier du CA
              </CardTitle>
              <CardDescription>Revenus des 30 derniers jours{analytics?.dailyObjective ? ` — Objectif : ${analytics.dailyObjective.toLocaleString('fr-FR')} €/jour` : ""}</CardDescription>
            </div>
            {analytics?.dailyRevenue && (
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'hsl(var(--primary))' }} />
                  <span className="text-muted-foreground">CA</span>
                </div>
                {analytics.dailyObjective > 0 && (
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-0.5 bg-red-500" />
                    <span className="text-muted-foreground">Objectif</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="h-[300px]" data-testid="chart-daily-revenue">
          {analyticsLoading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={analytics?.dailyRevenue}>
                <defs>
                  <linearGradient id="colorDailyRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="date" fontSize={9} tickLine={false} axisLine={false} interval={3} angle={-45} textAnchor="end" height={50} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}€`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                  formatter={(value: number, name: string) => [
                    `${value.toLocaleString('fr-FR')} €`,
                    name === 'revenue' ? 'CA du jour' : name
                  ]}
                  labelFormatter={(label) => `Jour : ${label}`}
                />
                <Bar dataKey="revenue" fill="url(#colorDailyRevenue)" stroke="hsl(var(--primary))" strokeWidth={1} radius={[3, 3, 0, 0]} name="revenue" />
                {analytics?.dailyObjective && analytics.dailyObjective > 0 && (
                  <ReferenceLine y={analytics.dailyObjective} stroke="#ef4444" strokeDasharray="6 4" strokeWidth={2} label={{ value: `${analytics.dailyObjective} €`, position: 'right', fill: '#ef4444', fontSize: 11 }} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Tracking Summary Cards */}
      {analytics?.tracking && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="tracking-summary">
          <Card>
            <CardContent className="pt-4 pb-3 px-3">
              <div className="flex items-center gap-2 mb-1">
                <Send className="h-4 w-4 text-emerald-500" />
                <span className="text-xs text-muted-foreground">Devis envoyés</span>
              </div>
              <p className="text-xl font-bold" data-testid="text-quotes-sent">{analytics.tracking.quotesSent}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-3">
              <div className="flex items-center gap-2 mb-1">
                <EyeIcon className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-muted-foreground">Devis consultés</span>
              </div>
              <p className="text-xl font-bold" data-testid="text-quotes-viewed">{analytics.tracking.quotesViewed}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-3">
              <div className="flex items-center gap-2 mb-1">
                <MailX className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Devis non envoyés</span>
              </div>
              <p className="text-xl font-bold" data-testid="text-quotes-not-sent">{analytics.tracking.quotesNotSent}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-3">
              <div className="flex items-center gap-2 mb-1">
                <Send className="h-4 w-4 text-emerald-500" />
                <span className="text-xs text-muted-foreground">Factures envoyées</span>
              </div>
              <p className="text-xl font-bold" data-testid="text-invoices-sent">{analytics.tracking.invoicesSent}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-3">
              <div className="flex items-center gap-2 mb-1">
                <EyeIcon className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-muted-foreground">Factures consultées</span>
              </div>
              <p className="text-xl font-bold" data-testid="text-invoices-viewed">{analytics.tracking.invoicesViewed}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-3">
              <div className="flex items-center gap-2 mb-1">
                <MailX className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Factures non envoyées</span>
              </div>
              <p className="text-xl font-bold" data-testid="text-invoices-not-sent">{analytics.tracking.invoicesNotSent}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tracking des consultations */}
      <Card data-testid="card-views-chart">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <EyeIcon className="h-5 w-5 text-blue-500" />
                Consultations Clients
              </CardTitle>
              <CardDescription>Tracking des ouvertures de devis et factures (30j)</CardDescription>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm bg-blue-500" />
                <span className="text-muted-foreground">Devis</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                <span className="text-muted-foreground">Factures</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="h-[300px]" data-testid="chart-daily-views">
          {analyticsLoading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics?.dailyViews}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="date" fontSize={9} tickLine={false} axisLine={false} interval={3} angle={-45} textAnchor="end" height={50} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                  labelFormatter={(label) => `Jour : ${label}`}
                />
                <Bar dataKey="quotes" fill="#3b82f6" radius={[2, 2, 0, 0]} name="Devis consultés" />
                <Bar dataKey="invoices" fill="#10b981" radius={[2, 2, 0, 0]} name="Factures consultées" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2" data-testid="card-monthly-revenue-chart">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Évolution du Chiffre d'Affaires
            </CardTitle>
            <CardDescription>Revenus mensuels sur les 12 derniers mois</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]" data-testid="chart-revenue">
            {analyticsLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics?.monthlyRevenue}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={55} interval={0} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}€`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                    formatter={(value: number) => [`${value.toLocaleString('fr-FR')} €`, 'Revenus']}
                  />
                  <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorRevenue)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-payment-method-chart">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Par Mode de Paiement
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]" data-testid="chart-payment-method">
            {analyticsLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={analytics?.revenueByPaymentMethod.filter(d => d.amount > 0)}
                    cx="50%"
                    cy="45%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={5}
                    dataKey="amount"
                    nameKey="method"
                  >
                    {analytics?.revenueByPaymentMethod.filter(d => d.amount > 0).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PAYMENT_COLORS[index % PAYMENT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [`${value.toLocaleString('fr-FR')} €`]} />
                  <Legend verticalAlign="bottom" height={36} fontSize={12} />
                </RechartsPieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-invoice-status-chart">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5 text-primary" />
              Statut des Factures
            </CardTitle>
            <CardDescription>Répartition par statut ({analytics?.totalInvoices || 0} factures)</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {analyticsLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={invoicePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {invoicePieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </RechartsPieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-quote-status-chart">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Statut des Devis
            </CardTitle>
            <CardDescription>Répartition par statut ({analytics?.totalQuotes || 0} devis)</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {analyticsLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={quotePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {quotePieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </RechartsPieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {analytics?.revenueByService && analytics.revenueByService.length > 0 && (
        <Card data-testid="card-service-revenue-chart">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Revenus par Service
            </CardTitle>
            <CardDescription>Performance par type de service</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]" data-testid="chart-service">
            {analyticsLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.revenueByService} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} opacity={0.3} />
                  <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}€`} />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    fontSize={9} 
                    tickLine={false} 
                    axisLine={false} 
                    width={150}
                    tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 20) + '...' : v}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                    formatter={(value: number, name: string) => [
                      name === 'revenue' ? `${value.toLocaleString('fr-FR')} €` : value,
                      name === 'revenue' ? 'Revenus' : 'Devis'
                    ]}
                    labelFormatter={(label: string) => label}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Revenus" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card data-testid="card-quote-shortcuts">
          <CardHeader>
            <CardTitle className="text-lg">Raccourcis Devis</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" asChild className="justify-start" data-testid="link-quotes-pending">
              <Link href="/admin/quotes?status=pending">En attente</Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="justify-start" data-testid="link-quotes-approved">
              <Link href="/admin/quotes?status=accepted">Acceptés</Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="justify-start" data-testid="link-quotes-newest">
              <Link href="/admin/quotes?sort=newest">Nouveaux</Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="justify-start" data-testid="link-quotes-all">
              <Link href="/admin/quotes">Tout voir</Link>
            </Button>
          </CardContent>
        </Card>

        <Card data-testid="card-invoice-shortcuts">
          <CardHeader>
            <CardTitle className="text-lg">Raccourcis Factures</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" asChild className="justify-start" data-testid="link-invoices-pending">
              <Link href="/admin/invoices?status=pending">Impayées</Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="justify-start" data-testid="link-invoices-overdue">
              <Link href="/admin/invoices?status=overdue">En retard</Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="justify-start" data-testid="link-invoices-month">
              <Link href="/admin/invoices?month=current">Ce mois-ci</Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="justify-start" data-testid="link-invoices-all">
              <Link href="/admin/invoices">Tout voir</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 lg:col-span-1" data-testid="card-quick-access">
          <CardHeader>
            <CardTitle className="text-lg">Accès Rapide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="ghost" asChild className="w-full justify-between hover:bg-primary/5" data-testid="link-users">
              <Link href="/admin/users">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span>Gestion des Clients</span>
                </div>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="ghost" asChild className="w-full justify-between hover:bg-primary/5" data-testid="link-reservations">
              <Link href="/admin/reservations">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span>Réservations ({analytics?.totalReservations || 0})</span>
                </div>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
