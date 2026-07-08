import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  LayoutDashboard,
  Trophy,
  Users,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Wrench,
  ArrowLeft,
  RefreshCw,
  Star,
  TrendingUp,
  Zap,
  Target,
  ChevronUp,
  ChevronDown,
  User,
  Settings2,
  BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AtelierStats {
  summary: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    urgent: number;
    today: number;
    late: number;
    completedToday: number;
    wheelsInProgress: number;
    unassigned: number;
  };
  byAtelierStatus: Record<string, number>;
  byUrgency: Record<string, number>;
}

interface EmployeeScore {
  score: number;
  tasksCompleted: number;
  avgCompletionHours: number;
  urgentHandled: number;
  rank: string;
}

interface EmployeeWithScore extends EmployeeScore {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  role: string;
  profileImageUrl?: string;
  activeDossiers: number;
  position: number;
}

interface AdminDashboardData {
  employees: EmployeeWithScore[];
  globalLoad: {
    totalActive: number;
    totalUrgent: number;
    totalUnassigned: number;
    totalCompleted: number;
  };
}

interface EmployeeDashboardData {
  employee: {
    id: string;
    firstName?: string;
    lastName?: string;
    email: string;
    role: string;
    profileImageUrl?: string;
  };
  stats: {
    assignedTotal: number;
    active: number;
    completed: number;
    urgent: number;
    tasksCompleted: number;
    pendingTasks: number;
  };
  scoring: EmployeeScore;
  dossiers: Array<{
    id: string;
    reference?: string;
    atelierStatus?: string;
    urgency?: string;
    status?: string;
    scheduledDate?: string;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleRegistration?: string;
    serviceName?: string;
  }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function urgencyLabel(urgency?: string) {
  switch (urgency) {
    case "critical": return { label: "Critique", color: "bg-red-600 text-white" };
    case "high": return { label: "Urgent", color: "bg-orange-500 text-white" };
    case "medium": return { label: "Moyen", color: "bg-yellow-500 text-black" };
    case "low": return { label: "Bas", color: "bg-blue-500 text-white" };
    default: return { label: "Normal", color: "bg-gray-500 text-white" };
  }
}

function atelierStatusLabel(status?: string) {
  const map: Record<string, { label: string; color: string }> = {
    reception: { label: "Réception", color: "bg-slate-500" },
    attente: { label: "En attente", color: "bg-gray-500" },
    preparation: { label: "Préparation", color: "bg-blue-500" },
    reparation: { label: "Réparation", color: "bg-amber-500" },
    finition: { label: "Finition", color: "bg-purple-500" },
    controle: { label: "Contrôle", color: "bg-indigo-500" },
    termine: { label: "Terminé", color: "bg-green-600" },
    restitution: { label: "Restitution", color: "bg-teal-600" },
  };
  return map[status || ""] || { label: status || "—", color: "bg-gray-400" };
}

function RankBadge({ rank }: { rank: string }) {
  const colors: Record<string, string> = {
    Expert: "bg-amber-500 text-black",
    Confirmé: "bg-blue-500 text-white",
    Intermédiaire: "bg-slate-500 text-white",
    Débutant: "bg-gray-400 text-white",
  };
  return (
    <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", colors[rank] || "bg-gray-400 text-white")}>
      {rank}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 85 ? "bg-amber-500" : score >= 65 ? "bg-blue-500" : score >= 40 ? "bg-slate-400" : "bg-gray-300";
  return (
    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
      <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${score}%` }} />
    </div>
  );
}

function PositionIcon({ pos }: { pos: number }) {
  if (pos === 1) return <Trophy className="h-5 w-5 text-amber-500" />;
  if (pos === 2) return <Trophy className="h-5 w-5 text-slate-400" />;
  if (pos === 3) return <Trophy className="h-5 w-5 text-amber-700" />;
  return <span className="text-muted-foreground font-bold text-sm w-5 text-center">#{pos}</span>;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  variant = "default",
}: {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  variant?: "default" | "urgent" | "success" | "warning";
}) {
  const colors = {
    default: "border-l-4 border-l-primary",
    urgent: "border-l-4 border-l-red-500",
    success: "border-l-4 border-l-green-500",
    warning: "border-l-4 border-l-yellow-500",
  };
  return (
    <Card className={cn("transition-all hover:shadow-md", colors[variant])}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn(
          "p-2.5 rounded-lg shrink-0",
          variant === "urgent" ? "bg-red-100 dark:bg-red-950" :
          variant === "success" ? "bg-green-100 dark:bg-green-950" :
          variant === "warning" ? "bg-yellow-100 dark:bg-yellow-950" :
          "bg-primary/10"
        )}>
          <Icon className={cn(
            "h-5 w-5",
            variant === "urgent" ? "text-red-600" :
            variant === "success" ? "text-green-600" :
            variant === "warning" ? "text-yellow-600" :
            "text-primary"
          )} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground font-medium truncate">{title}</p>
          <p className="text-2xl font-bold leading-tight">{value}</p>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Vue Globale Atelier ──────────────────────────────────────────────────────

function GlobalAtelierView() {
  const { data, isLoading, refetch, isFetching } = useQuery<AtelierStats>({
    queryKey: ["/api/dashboard/atelier"],
    refetchInterval: 30000,
  });

  if (isLoading) return <div className="flex justify-center p-12"><RefreshCw className="animate-spin h-6 w-6 text-muted-foreground" /></div>;

  const s = data?.summary;

  return (
    <div className="space-y-6">
      {/* Bouton rafraîchir */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
          Actualiser
        </Button>
      </div>

      {/* KPIs principaux */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard title="En attente" value={s?.pending ?? 0} icon={Clock} variant="warning" />
        <StatCard title="En cours" value={s?.inProgress ?? 0} icon={Wrench} variant="default" />
        <StatCard title="Terminés" value={s?.completed ?? 0} icon={CheckCircle2} variant="success" />
        <StatCard title="Urgences" value={s?.urgent ?? 0} icon={AlertTriangle} variant="urgent" />
        <StatCard title="Aujourd'hui" value={s?.today ?? 0} icon={Target} />
      </div>

      {/* Ligne secondaire */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="Terminés ce jour" value={s?.completedToday ?? 0} icon={CheckCircle2} variant="success" description="Depuis minuit" />
        <StatCard title="Jantes en cours" value={s?.wheelsInProgress ?? 0} icon={Zap} description="En atelier" />
        <StatCard title="En retard" value={s?.late ?? 0} icon={AlertTriangle} variant="urgent" description="Délai dépassé" />
        <StatCard title="Non assignés" value={s?.unassigned ?? 0} icon={User} variant="warning" description="Sans technicien" />
      </div>

      {/* Répartition par statut atelier */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Répartition par statut atelier
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data?.byAtelierStatus && Object.entries(data.byAtelierStatus).map(([status, count]) => {
              const { label, color } = atelierStatusLabel(status);
              const total = Object.values(data.byAtelierStatus).reduce((a, b) => a + b, 0) || 1;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={status} className="flex items-center gap-2 text-sm">
                  <span className="w-24 text-muted-foreground text-xs shrink-0">{label}</span>
                  <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                    <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-6 text-xs font-semibold text-right">{count}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Répartition par priorité
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data?.byUrgency && Object.entries(data.byUrgency).map(([urgency, count]) => {
              const { label, color } = urgencyLabel(urgency);
              const total = Object.values(data.byUrgency).reduce((a, b) => a + b, 0) || 1;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={urgency} className="flex items-center gap-2 text-sm">
                  <span className="w-16 text-muted-foreground text-xs shrink-0">{label}</span>
                  <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                    <div className={cn("h-full rounded-full", color.split(" ")[0])} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-6 text-xs font-semibold text-right">{count}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Vue Admin (Classement employés) ─────────────────────────────────────────

function AdminView() {
  const { data, isLoading, refetch, isFetching } = useQuery<AdminDashboardData>({
    queryKey: ["/api/dashboard/admin"],
    refetchInterval: 60000,
  });

  const [expanded, setExpanded] = useState<string | null>(null);

  if (isLoading) return <div className="flex justify-center p-12"><RefreshCw className="animate-spin h-6 w-6 text-muted-foreground" /></div>;

  const gl = data?.globalLoad;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
          Actualiser
        </Button>
      </div>

      {/* Charge globale */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="Dossiers actifs" value={gl?.totalActive ?? 0} icon={Wrench} />
        <StatCard title="Urgences" value={gl?.totalUrgent ?? 0} icon={AlertTriangle} variant="urgent" />
        <StatCard title="Non assignés" value={gl?.totalUnassigned ?? 0} icon={User} variant="warning" />
        <StatCard title="Total terminés" value={gl?.totalCompleted ?? 0} icon={CheckCircle2} variant="success" />
      </div>

      {/* Classement employés */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            Classement des techniciens — 30 derniers jours
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-3">
          {data?.employees?.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-6">Aucun employé trouvé</p>
          )}
          {data?.employees?.map((emp) => (
            <div key={emp.id} className="border rounded-lg overflow-hidden">
              {/* Ligne principale */}
              <button
                className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
                onClick={() => setExpanded(expanded === emp.id ? null : emp.id)}
              >
                <PositionIcon pos={emp.position} />

                {emp.profileImageUrl ? (
                  <img src={emp.profileImageUrl} alt={emp.name} className="h-8 w-8 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate">{emp.name}</span>
                    <RankBadge rank={emp.rank} />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <ScoreBar score={emp.score} />
                    <span className="text-xs font-bold text-primary shrink-0">{emp.score}/100</span>
                  </div>
                </div>

                <div className="text-right shrink-0 hidden sm:block">
                  <p className="text-xs text-muted-foreground">Actifs</p>
                  <p className="font-bold text-sm">{emp.activeDossiers}</p>
                </div>

                {expanded === emp.id ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
              </button>

              {/* Détail expandable */}
              {expanded === emp.id && (
                <div className="border-t bg-muted/30 px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div className="text-center">
                    <p className="text-muted-foreground text-xs">Tâches complétées</p>
                    <p className="font-bold text-lg">{emp.tasksCompleted}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground text-xs">Temps moyen</p>
                    <p className="font-bold text-lg">{emp.avgCompletionHours}h</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground text-xs">Urgences traitées</p>
                    <p className="font-bold text-lg">{emp.urgentHandled}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground text-xs">Dossiers actifs</p>
                    <p className="font-bold text-lg">{emp.activeDossiers}</p>
                  </div>
                  <div className="col-span-2 sm:col-span-4">
                    <Link href={`/admin/atelier-dashboard?employe=${emp.id}`}>
                      <Button variant="outline" size="sm" className="w-full sm:w-auto">
                        <User className="h-3 w-3 mr-1.5" />
                        Voir dashboard employé
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Vue Employé individuel ────────────────────────────────────────────────────

function EmployeeView({ employeeId }: { employeeId: string }) {
  const { data, isLoading, refetch, isFetching } = useQuery<EmployeeDashboardData>({
    queryKey: [`/api/dashboard/employe/${employeeId}`],
    refetchInterval: 30000,
    enabled: !!employeeId,
  });

  if (isLoading) return <div className="flex justify-center p-12"><RefreshCw className="animate-spin h-6 w-6 text-muted-foreground" /></div>;
  if (!data) return <div className="text-center p-6 text-muted-foreground">Employé introuvable</div>;

  const { employee, stats, scoring, dossiers } = data;
  const name = [employee.firstName, employee.lastName].filter(Boolean).join(" ") || employee.email;

  return (
    <div className="space-y-6">
      {/* En-tête employé */}
      <div className="flex items-center gap-4 flex-wrap">
        {employee.profileImageUrl ? (
          <img src={employee.profileImageUrl} alt={name} className="h-14 w-14 rounded-full object-cover border-2 border-primary" />
        ) : (
          <div className="h-14 w-14 rounded-full bg-primary/20 flex items-center justify-center border-2 border-primary">
            <User className="h-7 w-7 text-primary" />
          </div>
        )}
        <div>
          <h2 className="text-xl font-bold">{name}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-sm text-muted-foreground capitalize">{employee.role}</span>
            <RankBadge rank={scoring.rank} />
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Score</p>
            <p className="text-3xl font-black text-primary">{scoring.score}</p>
            <p className="text-xs text-muted-foreground">/100</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Score détail */}
      <Card className="border-primary/30">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Score de performance (30 derniers jours)</span>
          </div>
          <ScoreBar score={scoring.score} />
          <div className="grid grid-cols-3 gap-2 mt-4 text-center text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Tâches</p>
              <p className="font-bold">{scoring.tasksCompleted}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Temps moyen</p>
              <p className="font-bold">{scoring.avgCompletionHours}h</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Urgences</p>
              <p className="font-bold">{scoring.urgentHandled}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard title="Total assignés" value={stats.assignedTotal} icon={Wrench} />
        <StatCard title="En cours" value={stats.active} icon={Clock} />
        <StatCard title="Terminés" value={stats.completed} icon={CheckCircle2} variant="success" />
        <StatCard title="Urgences" value={stats.urgent} icon={AlertTriangle} variant="urgent" />
        <StatCard title="Tâches faites" value={stats.tasksCompleted} icon={Star} variant="success" />
        <StatCard title="Tâches restantes" value={stats.pendingTasks} icon={Target} variant="warning" />
      </div>

      {/* Liste dossiers assignés */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" />
            Mes dossiers assignés ({dossiers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {dossiers.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-6">Aucun dossier assigné</p>
          )}
          <div className="divide-y">
            {dossiers.map((d) => {
              const urgInfo = urgencyLabel(d.urgency);
              const statusInfo = atelierStatusLabel(d.atelierStatus);
              return (
                <div key={d.id} className="flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{d.reference || d.id.slice(0, 8)}</span>
                      <Badge className={cn("text-xs", urgInfo.color)}>{urgInfo.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {[d.vehicleMake, d.vehicleModel, d.vehicleRegistration].filter(Boolean).join(" · ")}
                      {d.serviceName && ` · ${d.serviceName}`}
                    </p>
                  </div>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full text-white shrink-0", statusInfo.color)}>
                    {statusInfo.label}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function AdminAtelierDashboard() {
  const { user, isAdmin } = useAuth();
  const [tab, setTab] = useState<"global" | "admin" | "employe">(
    isAdmin ? "global" : "employe"
  );

  // Récupère l'ID employé depuis la query string si admin navigue vers un employé
  const params = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(
    params.get("employe") || user?.id || ""
  );

  // Récupère la liste des employés pour le sélecteur admin
  const { data: adminData } = useQuery<AdminDashboardData>({
    queryKey: ["/api/dashboard/admin"],
    enabled: isAdmin,
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-3 sm:p-6 space-y-6">
        {/* En-tête */}
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/admin/workshop">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-black flex items-center gap-2">
              <LayoutDashboard className="h-6 w-6 text-primary shrink-0" />
              Dashboard Atelier
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Scoring, priorités et suivi en temps réel
            </p>
          </div>
          <Link href="/atelier">
            <Button variant="outline" size="sm" className="shrink-0">
              <Settings2 className="h-4 w-4 mr-2" />
              Mode TV
            </Button>
          </Link>
        </div>

        {/* Onglets */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3">
            <TabsTrigger value="global" className="gap-1.5 text-xs sm:text-sm">
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Vue globale</span>
              <span className="sm:hidden">Atelier</span>
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="admin" className="gap-1.5 text-xs sm:text-sm">
                <Trophy className="h-4 w-4" />
                <span className="hidden sm:inline">Classement équipe</span>
                <span className="sm:hidden">Équipe</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="employe" className="gap-1.5 text-xs sm:text-sm">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Vue employé</span>
              <span className="sm:hidden">Employé</span>
            </TabsTrigger>
          </TabsList>

          {/* Vue globale */}
          <TabsContent value="global" className="mt-4">
            <GlobalAtelierView />
          </TabsContent>

          {/* Vue admin — classement */}
          {isAdmin && (
            <TabsContent value="admin" className="mt-4">
              <AdminView />
            </TabsContent>
          )}

          {/* Vue employé */}
          <TabsContent value="employe" className="mt-4">
            {isAdmin && (
              <div className="mb-4">
                <label className="text-sm font-medium mb-1 block">Sélectionner un employé</label>
                <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue placeholder="Choisir un employé…" />
                  </SelectTrigger>
                  <SelectContent>
                    {adminData?.employees?.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.name} — {emp.role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {selectedEmployeeId ? (
              <EmployeeView employeeId={selectedEmployeeId} />
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Sélectionnez un employé pour voir son dashboard</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
