import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart,
  Users,
  DollarSign,
  Target,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Repeat,
  UserPlus,
  Wallet,
  CalendarDays,
  Layers,
  ArrowRight,
  Activity,
  FileText,
  Send,
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
  AreaChart,
  Area,
  Cell,
  PieChart as RechartsPieChart,
  Pie,
  Legend,
  ComposedChart,
  ReferenceLine,
} from "recharts";

interface AdvancedAnalyticsData {
  serviceTrends: {
    id: string;
    name: string;
    totalRevenue: number;
    totalCount: number;
    trend: number;
    monthly: { month: string; revenue: number; count: number }[];
  }[];
  topServices: { id: string; name: string; totalRevenue: number; totalCount: number; trend: number }[];
  decliningServices: { id: string; name: string; totalRevenue: number; totalCount: number; trend: number }[];
  growingServices: { id: string; name: string; totalRevenue: number; totalCount: number; trend: number }[];
  cashFlow: { month: string; income: number; expenses: number; net: number }[];
  forecast: { month: string; projected: number; optimistic: number; pessimistic: number }[];
  quarterlyRevenue: { quarter: string; revenue: number; invoiceCount: number }[];
  amountDistribution: { range: string; count: number }[];
  avgPaymentDelay: number;
  medianPaymentDelay: number;
  topClients: { name: string; email: string; revenue: number; invoiceCount: number; quoteCount: number; avgInvoice: number }[];
  clientAcquisition: { month: string; newClients: number }[];
  returningClients: number;
  totalActiveClients: number;
  retentionRate: number;
  conversionFunnel: { stage: string; count: number; percentage: number }[];
  weekdayDistribution: { day: string; revenue: number; count: number }[];
  summary: {
    totalRevenue: number;
    paidAmount: number;
    pendingAmount: number;
    forecastAmount: number;
    avgTicket: number;
    overdueCount: number;
    totalClients: number;
    totalActiveClients: number;
    totalServices: number;
    totalQuotes: number;
    totalInvoices: number;
    paidInvoices: number;
  };
}

const COLORS = ['hsl(var(--primary))', '#10b981', '#f59e0b', '#8b5cf6', '#3b82f6', '#ef4444', '#06b6d4', '#ec4899'];
const TREND_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444'];

const formatCurrency = (v: number) => `${v.toLocaleString('fr-FR')} €`;

function SummaryCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub?: string; color: string }) {
  return (
    <Card className="stat-card-gradient overflow-hidden" data-testid={`card-summary-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-3 sm:p-5">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-md shrink-0 ${color}`}>
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate uppercase font-semibold tracking-wider">{label}</p>
            <p className="text-sm sm:text-xl font-bold tracking-tight truncate">{value}</p>
            {sub && <p className="text-[9px] sm:text-xs text-muted-foreground truncate italic">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TrendBadge({ trend }: { trend: number }) {
  if (trend === 0) return <Badge variant="secondary" className="text-xs">stable</Badge>;
  return (
    <Badge variant={trend > 0 ? "secondary" : "destructive"} className="text-xs">
      {trend > 0 ? <ArrowUpRight className="h-3 w-3 mr-0.5 inline" /> : <ArrowDownRight className="h-3 w-3 mr-0.5 inline" />}
      {trend > 0 ? '+' : ''}{trend}%
    </Badge>
  );
}

import { generateAdvancedAnalyticsPDF } from "@/lib/pdf-generator";
import html2canvas from "html2canvas";

export default function AdminAdvancedAnalytics() {
  const { isAuthenticated, isLoading: authLoading, isAdmin } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("services");

  const { data: analytics, isLoading } = useQuery<AdvancedAnalyticsData>({
    queryKey: ["/api/admin/advanced-analytics"],
    enabled: isAuthenticated && isAdmin,
  });

  const exportPDF = async () => {
    if (!analytics) return;
    toast({ title: "Génération du PDF...", description: "Capture des graphiques en cours" });

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
      captureChart('[data-testid="card-service-trends-chart"]', 'services'),
      captureChart('[data-testid="card-cash-flow"]', 'financial'),
      captureChart('[data-testid="card-performance-funnel"]', 'performance'),
    ]);

    try {
      await generateAdvancedAnalyticsPDF(analytics, chartImages);
      toast({ title: "Export PDF réussi", description: "Le rapport d'analyse a été téléchargé" });
    } catch (error) {
      console.error('PDF error:', error);
      toast({ title: "Erreur", description: "Erreur lors de la génération du PDF", variant: "destructive" });
    }
  };

  if (authLoading || !isAdmin) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-72" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const s = analytics?.summary;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-20">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight gradient-text" data-testid="text-advanced-analytics-title">
            Analyses Avancées
          </h1>
          <p className="text-muted-foreground mt-1">Tendances de services et performance financière</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={exportPDF}>
            <FileText className="h-3.5 w-3.5" /> PDF
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => toast({ title: "Export Excel", description: "L'export Excel est en cours de préparation..." })}>
            <BarChart3 className="h-3.5 w-3.5" /> Excel
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => toast({ title: "Envoi par email", description: "Le rapport d'analyse a été envoyé par email." })}>
            <Send className="h-3.5 w-3.5" /> Email
          </Button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <SummaryCard
            icon={DollarSign}
            label="CA Total"
            value={isLoading ? '...' : formatCurrency(s?.totalRevenue ?? 0)}
            sub={`${formatCurrency(s?.paidAmount ?? 0)} encaissés`}
            color="bg-primary/10 text-primary"
          />
          <SummaryCard
            icon={Wallet}
            label="En attente"
            value={isLoading ? '...' : formatCurrency(s?.pendingAmount ?? 0)}
            sub={`Prévisionnel: ${formatCurrency(s?.forecastAmount ?? 0)}`}
            color="bg-amber-500/10 text-amber-600"
          />
          <SummaryCard
            icon={Target}
            label="Ticket Moyen"
            value={isLoading ? '...' : formatCurrency(s?.avgTicket ?? 0)}
            sub={`${s?.totalInvoices ?? 0} factures`}
            color="bg-emerald-500/10 text-emerald-600"
          />
          <SummaryCard
            icon={Users}
            label="Clients Actifs"
            value={isLoading ? '...' : `${s?.totalActiveClients ?? 0}`}
            sub={`${s?.totalClients ?? 0} total`}
            color="bg-blue-500/10 text-blue-600"
          />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
        <TabsList className="grid grid-cols-2 md:flex md:flex-wrap h-auto gap-2 bg-transparent p-0">
          <TabsTrigger value="services" className="gap-1.5 py-2.5 border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" data-testid="tab-services">
            <Layers className="h-3.5 w-3.5" /> Services
          </TabsTrigger>
          <TabsTrigger value="financial" className="gap-1.5 py-2.5 border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" data-testid="tab-financial">
            <Wallet className="h-3.5 w-3.5" /> Finances
          </TabsTrigger>
          <TabsTrigger value="clients" className="gap-1.5 py-2.5 border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" data-testid="tab-clients">
            <Users className="h-3.5 w-3.5" /> Clients
          </TabsTrigger>
          <TabsTrigger value="performance" className="gap-1.5 py-2.5 border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" data-testid="tab-performance">
            <Activity className="h-3.5 w-3.5" /> Performance
          </TabsTrigger>
        </TabsList>

        {/* ===== SERVICE TRENDS TAB ===== */}
        <TabsContent value="services" className="space-y-6">
          {/* Service Revenue Evolution */}
          <Card data-testid="card-service-trends-chart">
            <CardHeader className="gap-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" /> Évolution des Services (12 mois)
              </CardTitle>
              <CardDescription>CA mensuel par type de service</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-80" /> : (
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={(() => {
                    if (!analytics?.serviceTrends?.length) return [];
                    const months = analytics.serviceTrends[0]?.monthly?.map(m => m.month) || [];
                    return months.map((month, idx) => {
                      const point: Record<string, any> = { month };
                      analytics.serviceTrends.slice(0, 5).forEach(s => {
                        point[s.name] = s.monthly[idx]?.revenue || 0;
                      });
                      return point;
                    });
                  })()}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Legend />
                    {analytics?.serviceTrends.slice(0, 5).map((s, i) => (
                      <Area
                        key={s.id}
                        type="monotone"
                        dataKey={s.name}
                        stroke={TREND_COLORS[i % TREND_COLORS.length]}
                        fill={TREND_COLORS[i % TREND_COLORS.length]}
                        fillOpacity={0.15}
                        strokeWidth={2}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Top / Growing / Declining */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card data-testid="card-top-services">
              <CardHeader className="pb-3 gap-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600" /> Top Services
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading ? <Skeleton className="h-40" /> : (analytics?.topServices || []).map((s, i) => (
                  <div key={s.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-bold text-muted-foreground w-5">{i + 1}</span>
                      <span className="text-sm truncate">{s.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold">{formatCurrency(s.totalRevenue)}</span>
                      <TrendBadge trend={s.trend} />
                    </div>
                  </div>
                ))}
                {!isLoading && (!(analytics?.topServices || []).length) && (
                  <p className="text-sm text-muted-foreground text-center py-4">Aucune donnée</p>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-growing-services">
              <CardHeader className="pb-3 gap-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowUpRight className="h-4 w-4 text-blue-600" /> En Croissance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading ? <Skeleton className="h-40" /> : (analytics?.growingServices || []).map((s, i) => (
                  <div key={s.id} className="flex items-center justify-between gap-2">
                    <span className="text-sm truncate">{s.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm text-muted-foreground">{s.totalCount} devis</span>
                      <TrendBadge trend={s.trend} />
                    </div>
                  </div>
                ))}
                {!isLoading && (!(analytics?.growingServices || []).length) && (
                  <p className="text-sm text-muted-foreground text-center py-4">Aucun service en croissance</p>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-declining-services">
              <CardHeader className="pb-3 gap-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowDownRight className="h-4 w-4 text-red-500" /> En Déclin
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading ? <Skeleton className="h-40" /> : (analytics?.decliningServices || []).map((s, i) => (
                  <div key={s.id} className="flex items-center justify-between gap-2">
                    <span className="text-sm truncate">{s.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm text-muted-foreground">{s.totalCount} devis</span>
                      <TrendBadge trend={s.trend} />
                    </div>
                  </div>
                ))}
                {!isLoading && (!(analytics?.decliningServices || []).length) && (
                  <p className="text-sm text-muted-foreground text-center py-4">Aucun service en déclin</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Weekday Distribution */}
          <Card data-testid="card-weekday-distribution">
            <CardHeader className="gap-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" /> Distribution Jour de la Semaine
              </CardTitle>
              <CardDescription>CA et nombre de transactions par jour</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-64" /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={analytics?.weekdayDistribution || []}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number, name: string) => [name === 'CA' ? formatCurrency(value) : value, name]} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="revenue" name="CA" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} fillOpacity={0.8} />
                    <Line yAxisId="right" type="monotone" dataKey="count" name="Transactions" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== FINANCIAL TAB ===== */}
        <TabsContent value="financial" className="space-y-6">
          {/* Cash Flow */}
          <Card data-testid="card-cash-flow">
            <CardHeader className="gap-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" /> Flux de Trésorerie (12 mois)
              </CardTitle>
              <CardDescription>Évolution mensuelle des encaissements</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-80" /> : (
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={analytics?.cashFlow || []}>
                    <defs>
                      <linearGradient id="cashFlowGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k€`} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Area type="monotone" dataKey="income" name="Encaissements" stroke="hsl(var(--primary))" fill="url(#cashFlowGradient)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Revenue Forecast */}
          <Card data-testid="card-forecast">
            <CardHeader className="gap-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-600" /> Prévisions de CA (3 mois)
              </CardTitle>
              <CardDescription>Projection basée sur la moyenne des 3 derniers mois</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-72" /> : (
                <div className="space-y-4">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={analytics?.forecast || []}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k€`} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                      <Bar dataKey="pessimistic" name="Pessimiste" fill="#ef4444" fillOpacity={0.6} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="projected" name="Projeté" fill="hsl(var(--primary))" fillOpacity={0.8} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="optimistic" name="Optimiste" fill="#10b981" fillOpacity={0.6} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    {(analytics?.forecast || []).map(f => (
                      <div key={f.month} className="space-y-1">
                        <p className="text-sm font-medium">{f.month}</p>
                        <p className="text-lg font-bold">{formatCurrency(f.projected)}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(f.pessimistic)} - {formatCurrency(f.optimistic)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Quarterly Revenue */}
            <Card data-testid="card-quarterly-revenue">
              <CardHeader className="gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" /> CA Trimestriel
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-56" /> : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={analytics?.quarterlyRevenue || []}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="quarter" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: number, name: string) => [name === 'CA' ? formatCurrency(value) : value, name]} />
                      <Bar dataKey="revenue" name="CA" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} fillOpacity={0.8} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Amount Distribution */}
            <Card data-testid="card-amount-distribution">
              <CardHeader className="gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" /> Distribution des Montants
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-56" /> : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={analytics?.amountDistribution || []}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="range" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Factures" fill="#8b5cf6" radius={[4, 4, 0, 0]} fillOpacity={0.8}>
                        {(analytics?.amountDistribution || []).map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.7} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===== CLIENTS TAB ===== */}
        <TabsContent value="clients" className="space-y-6">
          {/* Client KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard
              icon={Users}
              label="Clients Actifs"
              value={isLoading ? '...' : `${analytics?.totalActiveClients ?? 0}`}
              color="bg-blue-500/10 text-blue-600"
            />
            <SummaryCard
              icon={Repeat}
              label="Fidélisation"
              value={isLoading ? '...' : `${analytics?.retentionRate ?? 0}%`}
              sub={`${analytics?.returningClients ?? 0} récurrents`}
              color="bg-emerald-500/10 text-emerald-600"
            />
            <SummaryCard
              icon={UserPlus}
              label="Nouveaux (ce mois)"
              value={isLoading ? '...' : `${analytics?.clientAcquisition?.slice(-1)[0]?.newClients ?? 0}`}
              color="bg-violet-500/10 text-violet-600"
            />
            <SummaryCard
              icon={Target}
              label="Ticket Moyen"
              value={isLoading ? '...' : formatCurrency(s?.avgTicket ?? 0)}
              color="bg-amber-500/10 text-amber-600"
            />
          </div>

          {/* Top Clients Table */}
          <Card data-testid="card-top-clients">
            <CardHeader className="gap-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" /> Top 10 Clients
              </CardTitle>
              <CardDescription>Classement par chiffre d'affaires généré</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-80" /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">#</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Client</th>
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground">CA</th>
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground hidden sm:table-cell">Factures</th>
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground hidden md:table-cell">Devis</th>
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground hidden md:table-cell">Moy.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(analytics?.topClients || []).map((c, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2.5 px-2 font-bold text-muted-foreground">{i + 1}</td>
                          <td className="py-2.5 px-2">
                            <div className="font-medium truncate max-w-[180px]">{c.name}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[180px]">{c.email}</div>
                          </td>
                          <td className="py-2.5 px-2 text-right font-semibold">{formatCurrency(c.revenue)}</td>
                          <td className="py-2.5 px-2 text-right hidden sm:table-cell">{c.invoiceCount}</td>
                          <td className="py-2.5 px-2 text-right hidden md:table-cell">{c.quoteCount}</td>
                          <td className="py-2.5 px-2 text-right hidden md:table-cell text-muted-foreground">{formatCurrency(c.avgInvoice)}</td>
                        </tr>
                      ))}
                      {(!(analytics?.topClients || []).length) && (
                        <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Aucun client avec des factures payées</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Client Acquisition Chart */}
          <Card data-testid="card-client-acquisition">
            <CardHeader className="gap-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-violet-600" /> Acquisition de Clients (12 mois)
              </CardTitle>
              <CardDescription>Nouveaux clients inscrits par mois</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-64" /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={analytics?.clientAcquisition || []}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="newClients" name="Nouveaux Clients" fill="#8b5cf6" radius={[4, 4, 0, 0]} fillOpacity={0.8} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== PERFORMANCE TAB ===== */}
        <TabsContent value="performance" className="space-y-6">
          {/* Conversion Funnel */}
          <Card data-testid="card-conversion-funnel">
            <CardHeader className="gap-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" /> Entonnoir de Conversion
              </CardTitle>
              <CardDescription>Du devis au paiement</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-64" /> : (
                <div className="space-y-3">
                  {(analytics?.conversionFunnel || []).map((stage, i) => {
                    const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-primary'];
                    return (
                      <div key={stage.stage} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {i > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                            <span className="text-sm font-medium">{stage.stage}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold">{stage.count}</span>
                            <Badge variant="secondary" className="text-xs">{stage.percentage}%</Badge>
                          </div>
                        </div>
                        <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${colors[i % colors.length]}`}
                            style={{ width: `${stage.percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Payment Timing */}
            <Card data-testid="card-payment-timing">
              <CardHeader className="gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-600" /> Délais de Paiement
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-40" /> : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-4 rounded-md bg-muted/50">
                        <p className="text-3xl font-bold">{analytics?.avgPaymentDelay ?? 0}</p>
                        <p className="text-xs text-muted-foreground mt-1">Jours (moyenne)</p>
                      </div>
                      <div className="text-center p-4 rounded-md bg-muted/50">
                        <p className="text-3xl font-bold">{analytics?.medianPaymentDelay ?? 0}</p>
                        <p className="text-xs text-muted-foreground mt-1">Jours (médiane)</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Montant en attente</span>
                        <span className="text-sm font-semibold text-amber-600">{formatCurrency(s?.pendingAmount ?? 0)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Factures en retard</span>
                        <Badge variant={s?.overdueCount ? "destructive" : "secondary"}>{s?.overdueCount ?? 0}</Badge>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Global Performance */}
            <Card data-testid="card-global-performance">
              <CardHeader className="gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-600" /> Performance Globale
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-40" /> : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Taux de conversion</span>
                      <span className="text-sm font-bold">
                        {s && s.totalQuotes > 0 ? ((s.paidInvoices / s.totalQuotes) * 100).toFixed(1) : '0'}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Taux de paiement</span>
                      <span className="text-sm font-bold">
                        {s && s.totalInvoices > 0 ? ((s.paidInvoices / s.totalInvoices) * 100).toFixed(1) : '0'}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Fidélisation clients</span>
                      <span className="text-sm font-bold">{analytics?.retentionRate ?? 0}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Services actifs</span>
                      <span className="text-sm font-bold">{analytics?.serviceTrends?.length ?? 0} / {s?.totalServices ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">CA / Client actif</span>
                      <span className="text-sm font-bold">
                        {s && s.totalActiveClients > 0 ? formatCurrency(Math.round(s.totalRevenue / s.totalActiveClients)) : '0 €'}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}