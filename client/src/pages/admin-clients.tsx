import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { User } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Phone,
  Mail,
  MapPin,
  Building2,
  FileText,
  DollarSign,
  User as UserIcon,
  Users,
  Filter,
  MessageCircle,
  ExternalLink,
  TrendingUp,
  UserPlus,
  Star,
  Calendar,
  Archive,
  Wrench,
  ClipboardList,
  CheckCircle,
  Clock,
  Award,
  Sparkles,
  Loader2,
  AlertTriangle,
  Target,
  Zap,
  RefreshCw,
} from "lucide-react";

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getInitials(user: User): string {
  const f = user.firstName?.charAt(0)?.toUpperCase() || "";
  const l = user.lastName?.charAt(0)?.toUpperCase() || "";
  return f + l || user.email.charAt(0).toUpperCase();
}

function getLoyaltyTier(revenue: number, paidCount: number) {
  if (revenue >= 5000 || paidCount >= 10) return { label: "Platine", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300", stars: 4 };
  if (revenue >= 2000 || paidCount >= 5) return { label: "Or", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300", stars: 3 };
  if (revenue >= 500 || paidCount >= 2) return { label: "Argent", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", stars: 2 };
  return { label: "Bronze", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300", stars: 1 };
}

function ClientAIInsights({ client }: { client: User }) {
  const { toast } = useToast();
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const { data: dossier } = useQuery<any>({
    queryKey: ["/api/admin/clients", client.id, "dossier"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/clients/${client.id}/dossier`, { credentials: "include" });
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  const generateInsights = async () => {
    if (!dossier) return;
    setLoading(true);
    try {
      const stats = dossier.stats;
      const loyalty = getLoyaltyTier(stats.paidRevenue ?? stats.totalRevenue, stats.paidCount);
      const res = await apiRequest("POST", "/api/admin/ai/client-insights", {
        name: `${client.firstName || ""} ${client.lastName || ""}`.trim() || client.email,
        quotesCount: stats.quotesCount ?? 0,
        invoicesCount: stats.invoicesCount ?? 0,
        paidCount: stats.paidCount ?? 0,
        totalRevenue: stats.paidRevenue ?? stats.totalRevenue ?? 0,
        conversionRate: stats.conversionRate ?? 0,
        avgQuoteAmount: stats.avgQuoteAmount ?? 0,
        firstVisit: stats.firstVisit ?? null,
        lastVisit: stats.lastVisit ?? null,
        loyaltyTier: loyalty.label,
      });
      const data = await res.json();
      setInsights(data);
    } catch {
      toast({ title: "Erreur IA", description: "Impossible de générer l'analyse.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!dossier) {
    return <div className="text-center py-8 text-muted-foreground text-sm">Chargement du dossier...</div>;
  }

  return (
    <div className="space-y-4">
      {!insights && !loading && (
        <div className="text-center py-6 space-y-3">
          <div className="p-4 rounded-full bg-primary/10 w-16 h-16 flex items-center justify-center mx-auto">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <div>
            <p className="font-semibold">Analyse IA du client</p>
            <p className="text-sm text-muted-foreground mt-1">Obtenez des insights personnalisés sur ce client : score, risques, opportunités et prochaine action recommandée.</p>
          </div>
          <Button onClick={generateInsights} className="gap-2">
            <Sparkles className="h-4 w-4" />
            Analyser avec l'IA
          </Button>
        </div>
      )}

      {loading && (
        <div className="text-center py-8 space-y-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Analyse en cours...</p>
        </div>
      )}

      {insights && (
        <div className="space-y-4">
          {/* Score */}
          <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 border">
            <div className="relative w-16 h-16 shrink-0">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted" />
                <circle cx="32" cy="32" r="28" fill="none" strokeWidth="6"
                  stroke={insights.score >= 70 ? "#10b981" : insights.score >= 40 ? "#f59e0b" : "#ef4444"}
                  strokeDasharray={`${(insights.score / 100) * 175.9} 175.9`}
                  strokeLinecap="round" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{insights.score}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{insights.resume}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">Retour : {insights.probabilite_retour}%</Badge>
              </div>
            </div>
          </div>

          {/* Points forts */}
          {(insights.points_forts || []).length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 uppercase tracking-wide">
                <CheckCircle className="h-3.5 w-3.5" /> Points forts
              </p>
              {(insights.points_forts || []).map((p: string, i: number) => (
                <p key={i} className="text-sm pl-5 text-muted-foreground">• {p}</p>
              ))}
            </div>
          )}

          {/* Risques */}
          {(insights.risques || []).length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5 uppercase tracking-wide">
                <AlertTriangle className="h-3.5 w-3.5" /> Risques
              </p>
              {(insights.risques || []).map((r: string, i: number) => (
                <p key={i} className="text-sm pl-5 text-muted-foreground">• {r}</p>
              ))}
            </div>
          )}

          {/* Opportunités */}
          {(insights.opportunites || []).length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5 uppercase tracking-wide">
                <Target className="h-3.5 w-3.5" /> Opportunités
              </p>
              {(insights.opportunites || []).map((o: string, i: number) => (
                <p key={i} className="text-sm pl-5 text-muted-foreground">• {o}</p>
              ))}
            </div>
          )}

          {/* Prochaine action */}
          {insights.prochaine_action && (
            <div className="p-3 rounded-md bg-primary/5 border border-primary/20">
              <p className="text-xs font-semibold text-primary flex items-center gap-1.5 uppercase tracking-wide mb-1">
                <Zap className="h-3.5 w-3.5" /> Prochaine action recommandée
              </p>
              <p className="text-sm">{insights.prochaine_action}</p>
            </div>
          )}

          <Button variant="outline" size="sm" className="w-full gap-2" onClick={generateInsights} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5" />
            Régénérer l'analyse
          </Button>
        </div>
      )}
    </div>
  );
}

function ClientDossier({ client }: { client: User }) {
  const { data: dossier, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/clients", client.id, "dossier"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/clients/${client.id}/dossier`, { credentials: "include" });
      if (!res.ok) throw new Error("Erreur chargement dossier");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2 py-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!dossier) return null;

  const { stats, quotes, invoices, reservations, engagements } = dossier;
  const loyalty = getLoyaltyTier(stats.paidRevenue ?? stats.totalRevenue, stats.paidCount);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-md bg-muted/50 text-center">
          <p className="text-lg font-bold">{stats.quotesCount}</p>
          <p className="text-xs text-muted-foreground">Devis</p>
        </div>
        <div className="p-3 rounded-md bg-muted/50 text-center">
          <p className="text-lg font-bold">{stats.invoicesCount}</p>
          <p className="text-xs text-muted-foreground">Factures</p>
        </div>
        <div className="p-3 rounded-md bg-muted/50 text-center">
          <p className="text-lg font-bold">{stats.paidCount}</p>
          <p className="text-xs text-muted-foreground">Payées</p>
        </div>
        <div className="p-3 rounded-md bg-muted/50 text-center">
          <p className="text-lg font-bold">{(stats.paidRevenue ?? stats.totalRevenue).toFixed(0)} €</p>
          <p className="text-xs text-muted-foreground">CA payé</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 rounded-md bg-muted/30 text-center">
          <p className="text-sm font-semibold text-green-600 dark:text-green-400">{stats.quotesAccepted ?? 0}</p>
          <p className="text-[10px] text-muted-foreground">Devis acceptés</p>
        </div>
        <div className="p-2 rounded-md bg-muted/30 text-center">
          <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">{stats.quotesPending ?? 0}</p>
          <p className="text-[10px] text-muted-foreground">En attente</p>
        </div>
        <div className="p-2 rounded-md bg-muted/30 text-center">
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">{stats.quotesRefused ?? 0}</p>
          <p className="text-[10px] text-muted-foreground">Refusés</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="p-2 rounded-md bg-muted/30 text-center">
          <p className="font-semibold">{stats.conversionRate ?? 0}%</p>
          <p className="text-muted-foreground">Conversion</p>
        </div>
        <div className="p-2 rounded-md bg-muted/30 text-center">
          <p className="font-semibold">{stats.avgQuoteAmount ? stats.avgQuoteAmount.toFixed(0) + " €" : "—"}</p>
          <p className="text-muted-foreground">Moy. devis</p>
        </div>
        <div className="p-2 rounded-md bg-muted/30 text-center">
          <p className="font-semibold">{stats.avgDelayDays != null ? stats.avgDelayDays + " j" : "—"}</p>
          <p className="text-muted-foreground">Délai moy.</p>
        </div>
      </div>

      <div className="flex items-center gap-3 p-3 rounded-md border">
        <Award className="h-5 w-5 text-muted-foreground shrink-0" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Fidélité :</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${loyalty.color}`}>
              {loyalty.label}
            </span>
            <div className="flex gap-0.5">
              {[1,2,3,4].map(n => (
                <Star key={n} className={`h-3 w-3 ${n <= loyalty.stars ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground/30"}`} />
              ))}
            </div>
          </div>
          <div className="flex gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
            {stats.firstVisit && <span>1ère interaction : {formatDate(stats.firstVisit)}</span>}
            {stats.lastVisit && <span>Dernière : {formatDate(stats.lastVisit)}</span>}
          </div>
        </div>
      </div>

      <Tabs defaultValue="invoices">
        <TabsList className="w-full">
          <TabsTrigger value="invoices" className="flex-1 text-xs">Factures ({stats.invoicesCount})</TabsTrigger>
          <TabsTrigger value="quotes" className="flex-1 text-xs">Devis ({stats.quotesCount})</TabsTrigger>
          <TabsTrigger value="reservations" className="flex-1 text-xs">Rés. ({stats.reservationsCount})</TabsTrigger>
          <TabsTrigger value="engagements" className="flex-1 text-xs">Prestations ({stats.engagementsCount})</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices">
          <ScrollArea className="h-56">
            {invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Aucune facture</p>
            ) : (
              <div className="space-y-2 pr-3">
                {invoices.map((inv: any) => (
                  <div key={inv.id} className="flex items-center justify-between p-2 rounded-md border text-sm">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{inv.invoiceNumber || inv.invoice_number || "—"}</span>
                      <span className="text-muted-foreground">{formatDate(inv.createdAt || inv.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{parseFloat(inv.totalTTC || 0).toFixed(2)} EUR</span>
                      <Badge variant={inv.status === "paid" || inv.status === "completed" ? "default" : "secondary"} className="text-[10px]">
                        {inv.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="quotes">
          <ScrollArea className="h-56">
            {quotes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Aucun devis</p>
            ) : (
              <div className="space-y-2 pr-3">
                {quotes.map((q: any) => (
                  <div key={q.id} className="flex items-center justify-between p-2 rounded-md border text-sm">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{q.reference || "—"}</span>
                      <span className="text-muted-foreground">{formatDate(q.createdAt || q.created_at)}</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{q.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="reservations">
          <ScrollArea className="h-56">
            {reservations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Aucune réservation</p>
            ) : (
              <div className="space-y-2 pr-3">
                {reservations.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between p-2 rounded-md border text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{formatDate(r.scheduledDate || r.scheduled_date || r.createdAt)}</span>
                      {r.notes && <span className="text-muted-foreground truncate max-w-[120px]">{r.notes}</span>}
                    </div>
                    <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="engagements">
          <ScrollArea className="h-56">
            {engagements.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Aucune prestation</p>
            ) : (
              <div className="space-y-2 pr-3">
                {engagements.map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between p-2 rounded-md border text-sm">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium truncate max-w-[160px]">{e.title || e.description || "Prestation"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">{formatDate(e.createdAt)}</span>
                      <Badge variant="outline" className="text-[10px]">{e.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AdminClients() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isAdmin } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [loyaltyFilter, setLoyaltyFilter] = useState<string>("all");
  const [selectedClient, setSelectedClient] = useState<User | null>(null);
  const [dossierView, setDossierView] = useState(false);

  const { data: allUsers = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAuthenticated && isAdmin,
  });

  const { data: quotes = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/quotes"],
    enabled: isAuthenticated && isAdmin,
  });

  const { data: invoices = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/invoices"],
    enabled: isAuthenticated && isAdmin,
  });

  const clients = useMemo(() => {
    return allUsers.filter(
      (u) => u.role === "client" || u.role === "client_professionnel"
    );
  }, [allUsers]);

  const cities = useMemo(() => {
    const set = new Set<string>();
    clients.forEach((c) => { if (c.city) set.add(c.city); });
    return Array.from(set).sort();
  }, [clients]);

  function getClientStats(clientId: string) {
    const clientQuotes = quotes.filter((q: any) => q.clientId === clientId);
    const clientInvoices = invoices.filter((i: any) => i.clientId === clientId);
    const totalRevenue = clientInvoices.reduce((sum: number, inv: any) => sum + (parseFloat(inv.totalTTC) || 0), 0);
    const paidInvoices = clientInvoices.filter((i: any) => i.status === "paid" || i.status === "completed");
    return { quotesCount: clientQuotes.length, invoicesCount: clientInvoices.length, totalRevenue, paidCount: paidInvoices.length };
  }

  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      const q = searchQuery.toLowerCase();
      const matchSearch = !q ||
        (c.firstName || "").toLowerCase().includes(q) ||
        (c.lastName || "").toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.phone || "").includes(q) ||
        (c.companyName || "").toLowerCase().includes(q) ||
        (c.city || "").toLowerCase().includes(q);
      const matchRole = roleFilter === "all" || c.role === roleFilter;
      const matchCity = cityFilter === "all" || c.city === cityFilter;
      const stats = getClientStats(c.id);
      const loyalty = getLoyaltyTier(stats.totalRevenue, stats.paidCount);
      const matchLoyalty = loyaltyFilter === "all" || loyalty.label === loyaltyFilter;
      return matchSearch && matchRole && matchCity && matchLoyalty;
    });
  }, [clients, searchQuery, roleFilter, cityFilter, loyaltyFilter, invoices, quotes]);

  const globalStats = useMemo(() => {
    const totalRevenue = clients.reduce((sum, c) => sum + getClientStats(c.id).totalRevenue, 0);
    const proClients = clients.filter(c => c.role === "client_professionnel").length;
    const recentClients = clients.filter(c => {
      if (!c.createdAt) return false;
      return (Date.now() - new Date(c.createdAt).getTime()) < 30 * 24 * 60 * 60 * 1000;
    }).length;
    const platinumClients = clients.filter(c => {
      const s = getClientStats(c.id);
      return getLoyaltyTier(s.totalRevenue, s.paidCount).label === "Platine";
    }).length;
    return { totalRevenue, proClients, recentClients, platinumClients };
  }, [clients, invoices]);

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4" data-testid="page-admin-clients">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-clients-title">Clients</h1>
          <p className="text-sm text-muted-foreground">
            {filteredClients.length} client{filteredClients.length !== 1 ? "s" : ""} trouvé{filteredClients.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button variant="outline" onClick={() => setLocation("/admin/users")} data-testid="button-go-to-users">
          <Users className="h-4 w-4 mr-2" />
          Utilisateurs
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Total clients</p>
                <p className="text-2xl font-bold mt-1">{clients.length}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Professionnels</p>
                <p className="text-2xl font-bold mt-1">{globalStats.proClients}</p>
              </div>
              <Building2 className="h-8 w-8 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Nouveaux (30j)</p>
                <p className="text-2xl font-bold mt-1">{globalStats.recentClients}</p>
              </div>
              <UserPlus className="h-8 w-8 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">CA total</p>
                <p className="text-2xl font-bold mt-1">{globalStats.totalRevenue.toFixed(0)}<span className="text-sm font-normal ml-1">EUR</span></p>
              </div>
              <TrendingUp className="h-8 w-8 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom, email, téléphone, société..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-clients"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[140px]" data-testid="select-role-filter">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous types</SelectItem>
                  <SelectItem value="client">Particulier</SelectItem>
                  <SelectItem value="client_professionnel">Professionnel</SelectItem>
                </SelectContent>
              </Select>
              <Select value={loyaltyFilter} onValueChange={setLoyaltyFilter}>
                <SelectTrigger className="w-[130px]" data-testid="select-loyalty-filter">
                  <Award className="h-4 w-4 mr-1" />
                  <SelectValue placeholder="Fidélité" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous niveaux</SelectItem>
                  <SelectItem value="Platine">Platine</SelectItem>
                  <SelectItem value="Or">Or</SelectItem>
                  <SelectItem value="Argent">Argent</SelectItem>
                  <SelectItem value="Bronze">Bronze</SelectItem>
                </SelectContent>
              </Select>
              {cities.length > 0 && (
                <Select value={cityFilter} onValueChange={setCityFilter}>
                  <SelectTrigger className="w-[140px]" data-testid="select-city-filter">
                    <MapPin className="h-4 w-4 mr-1" />
                    <SelectValue placeholder="Ville" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes villes</SelectItem>
                    {cities.map((city) => <SelectItem key={city} value={city}>{city}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {filteredClients.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <UserIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">Aucun client trouvé</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredClients.map((client) => {
            const stats = getClientStats(client.id);
            const loyalty = getLoyaltyTier(stats.totalRevenue, stats.paidCount);
            return (
              <Card
                key={client.id}
                className="hover-elevate cursor-pointer"
                onClick={() => { setSelectedClient(client); setDossierView(false); }}
                data-testid={`card-client-${client.id}`}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-11 w-11 shrink-0">
                      <AvatarImage src={client.profileImageUrl || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                        {getInitials(client)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold truncate">
                          {client.firstName || ""} {client.lastName || ""}
                        </h3>
                        <Badge variant={client.role === "client_professionnel" ? "default" : "secondary"} className="text-[10px]">
                          {client.role === "client_professionnel" ? "Pro" : "Particulier"}
                        </Badge>
                      </div>
                      {client.companyName && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Building2 className="h-3 w-3" />
                          {client.companyName}
                        </p>
                      )}
                      <div className="flex items-center gap-1 mt-1">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${loyalty.color}`}>
                          {loyalty.label}
                        </span>
                        {[1,2,3,4].map(n => (
                          <Star key={n} className={`h-2.5 w-2.5 ${n <= loyalty.stars ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground/20"}`} />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{client.email}</span>
                    </div>
                    {client.phone && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span>{client.phone}</span>
                      </div>
                    )}
                    {client.city && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span>{[client.postalCode, client.city].filter(Boolean).join(" ")}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t flex-wrap">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {stats.quotesCount} devis
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        {stats.paidCount} payée{stats.paidCount > 1 ? "s" : ""}
                      </span>
                    </div>
                    <span className="text-xs font-semibold">
                      {stats.totalRevenue.toFixed(2)} EUR
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!selectedClient} onOpenChange={() => setSelectedClient(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedClient && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={selectedClient.profileImageUrl || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {getInitials(selectedClient)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <span>{selectedClient.firstName || ""} {selectedClient.lastName || ""}</span>
                    <Badge variant={selectedClient.role === "client_professionnel" ? "default" : "secondary"} className="ml-2 text-xs">
                      {selectedClient.role === "client_professionnel" ? "Professionnel" : "Particulier"}
                    </Badge>
                  </div>
                </DialogTitle>
              </DialogHeader>

              <Tabs defaultValue="info" className="mt-2">
                <TabsList className="w-full">
                  <TabsTrigger value="info" className="flex-1 text-xs">
                    <UserIcon className="h-3.5 w-3.5 mr-1" />
                    Infos
                  </TabsTrigger>
                  <TabsTrigger value="dossier" className="flex-1 text-xs">
                    <Archive className="h-3.5 w-3.5 mr-1" />
                    Dossier
                  </TabsTrigger>
                  <TabsTrigger value="ai" className="flex-1 text-xs">
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    Insights IA
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="info" className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">Email</p>
                      <p className="text-sm">{selectedClient.email}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">Téléphone</p>
                      <p className="text-sm">{selectedClient.phone || "-"}</p>
                      {selectedClient.smsConsent && (
                        <Badge variant="outline" className="text-xs">SMS actif</Badge>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">Adresse</p>
                      <p className="text-sm">
                        {[selectedClient.address, selectedClient.postalCode, selectedClient.city].filter(Boolean).join(", ") || "-"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">Inscrit le</p>
                      <p className="text-sm">{formatDate(selectedClient.createdAt as any)}</p>
                    </div>
                  </div>

                  {selectedClient.companyName && (
                    <div className="border-t pt-3">
                      <p className="text-xs text-muted-foreground font-medium mb-2">Informations société</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Société</p>
                          <p className="text-sm">{selectedClient.companyName}</p>
                        </div>
                        {selectedClient.siret && (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">SIRET</p>
                            <p className="text-sm">{selectedClient.siret}</p>
                          </div>
                        )}
                        {selectedClient.tvaNumber && (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">TVA</p>
                            <p className="text-sm">{selectedClient.tvaNumber}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2 flex-wrap">
                    <Button variant="outline" className="flex-1" onClick={() => { setSelectedClient(null); setLocation("/admin/quotes"); }} data-testid="button-view-client-quotes">
                      <FileText className="h-4 w-4 mr-2" />
                      Devis
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => { setSelectedClient(null); setLocation("/admin/invoices"); }} data-testid="button-view-client-invoices">
                      <DollarSign className="h-4 w-4 mr-2" />
                      Factures
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => { setSelectedClient(null); setLocation("/admin/chat"); }} data-testid="button-chat-client">
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Chat
                    </Button>
                    <Button size="icon" variant="outline" onClick={() => { setSelectedClient(null); setLocation("/admin/users"); }} data-testid="button-edit-client-user">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="dossier" className="mt-4">
                  <ClientDossier client={selectedClient} />
                </TabsContent>

                <TabsContent value="ai" className="mt-4">
                  <ClientAIInsights client={selectedClient} />
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
