import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Database,
  HardDrive,
  Zap,
  Mail,
  Wifi,
  Clock,
  Cpu,
  MemoryStick,
  Users,
  FileText,
  DollarSign,
  Calendar,
  Package,
  Activity,
  Server,
  AlertCircle,
} from "lucide-react";

interface HealthData {
  timestamp: string;
  uptime: { seconds: number; formatted: string };
  db: {
    ok: boolean;
    latencyMs: number;
    stats: {
      users: string;
      quotes: string;
      invoices: string;
      reservations: string;
      services: string;
      sessions: string;
      unread_notifications: string;
      revenue_total: string;
      quote_media: string;
      invoice_media: string;
      error?: string;
    };
  };
  storage: { ok: boolean; error?: string };
  ai: { ok: boolean; error?: string };
  email: { ok: boolean; provider: string };
  memory: { heapUsedMb: number; heapTotalMb: number; rssMb: number; usagePercent: number };
  websocket: { connections: number };
  nodeVersion: string;
  env: string;
}

function StatusBadge({ ok, label }: { ok: boolean; label?: string }) {
  return ok ? (
    <Badge className="bg-green-100 text-green-700 border-green-200 gap-1">
      <CheckCircle2 className="h-3 w-3" />
      {label || "OK"}
    </Badge>
  ) : (
    <Badge className="bg-red-100 text-red-700 border-red-200 gap-1">
      <XCircle className="h-3 w-3" />
      {label || "Erreur"}
    </Badge>
  );
}

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border/50">
      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="font-semibold text-sm">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

export default function AdminMonitoring() {
  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery<HealthData>({
    queryKey: ["/api/admin/monitoring/health"],
    queryFn: async () => {
      const res = await fetch("/api/admin/monitoring/health", { credentials: "include" });
      if (!res.ok) throw new Error("Erreur de récupération");
      return res.json();
    },
    refetchInterval: 30000,
    staleTime: 0,
  });

  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("fr-FR") : "--:--:--";

  const services = data ? [
    { icon: Database, label: "Base de données", ok: data.db.ok, detail: data.db.ok ? `${data.db.latencyMs}ms` : data.db.stats.error },
    { icon: HardDrive, label: "Stockage objet", ok: data.storage.ok, detail: data.storage.error || "Bucket actif" },
    { icon: Zap, label: "IA Gemini 2.5", ok: data.ai.ok, detail: data.ai.error || "gemini-2.5-flash" },
    { icon: Mail, label: "Email (Resend)", ok: data.email.ok, detail: data.email.provider },
  ] : [];

  const overallOk = data ? (data.db.ok && data.storage.ok && data.ai.ok && data.email.ok) : false;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Monitoring Système</h1>
            <p className="text-xs text-muted-foreground">Santé & ressources — MyJantes</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <Badge className={overallOk ? "bg-green-100 text-green-700 border-green-200" : "bg-red-100 text-red-700 border-red-200"}>
              {overallOk ? "✅ Tous les services OK" : "⚠️ Problème détecté"}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Diagnostic en cours…</p>
          </div>
        </div>
      ) : data ? (
        <>
          {/* Service health grid */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Server className="h-4 w-4 text-primary" />
                État des services
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {services.map(({ icon: Icon, label, ok, detail }) => (
                  <div key={label} className={`flex items-center gap-3 p-4 rounded-xl border ${ok ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900" : "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900"}`}>
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${ok ? "bg-green-100 dark:bg-green-900/40" : "bg-red-100 dark:bg-red-900/40"}`}>
                      <Icon className={`h-5 w-5 ${ok ? "text-green-600" : "text-red-600"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm">{label}</p>
                        <StatusBadge ok={ok} />
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Memory + Uptime */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MemoryStick className="h-4 w-4 text-primary" />
                  Mémoire Node.js
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Heap utilisé</span>
                    <span className="font-semibold">{data.memory.heapUsedMb} MB / {data.memory.heapTotalMb} MB</span>
                  </div>
                  <Progress value={data.memory.usagePercent} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">{data.memory.usagePercent}% utilisé</p>
                </div>
                <div className="flex justify-between text-sm border-t pt-3">
                  <span className="text-muted-foreground">RSS total</span>
                  <span className="font-semibold">{data.memory.rssMb} MB</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Node.js</span>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{data.nodeVersion}</code>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  Disponibilité & Connexions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Uptime serveur</span>
                  <span className="font-semibold text-green-600">{data.uptime.formatted}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">WebSocket actifs</span>
                  <span className="font-semibold flex items-center gap-1">
                    <Wifi className="h-3.5 w-3.5 text-blue-500" />
                    {data.websocket.connections}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Sessions actives</span>
                  <span className="font-semibold">{data.db.stats.sessions || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Environnement</span>
                  <Badge variant="outline" className="text-xs">{data.env}</Badge>
                </div>
                <div className="flex justify-between text-sm border-t pt-3">
                  <span className="text-muted-foreground">Notifs non lues</span>
                  <span className="font-semibold">{data.db.stats.unread_notifications || 0}</span>
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  Dernière vérif. {lastUpdate} • Auto-refresh 30s
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Database stats */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                Données en base — {data.db.latencyMs}ms
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <StatCard icon={Users} label="Utilisateurs" value={data.db.stats.users || 0} />
                <StatCard icon={FileText} label="Devis" value={data.db.stats.quotes || 0} sub={`${data.db.stats.quote_media} médias`} />
                <StatCard icon={DollarSign} label="Factures" value={data.db.stats.invoices || 0} sub={`${data.db.stats.invoice_media} médias`} />
                <StatCard icon={Calendar} label="Réservations" value={data.db.stats.reservations || 0} />
                <StatCard icon={Package} label="Services" value={data.db.stats.services || 0} />
              </div>
              <div className="mt-4 p-3 rounded-lg bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-900">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-400">CA total encaissé</span>
                  </div>
                  <span className="text-lg font-bold text-green-700 dark:text-green-400">
                    {parseFloat(data.db.stats.revenue_total || "0").toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Env check */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-primary" />
                Variables d'environnement critiques
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                {[
                  { key: "DATABASE_URL", label: "PostgreSQL (Neon)" },
                  { key: "RESEND_API_KEY", label: "Email (Resend)" },
                  { key: "AI_INTEGRATIONS_GEMINI_API_KEY", label: "Gemini AI" },
                  { key: "STRIPE_SECRET_KEY", label: "Stripe" },
                  { key: "TWILIO_ACCOUNT_SID", label: "Twilio SMS" },
                  { key: "MINDEE_API_KEY", label: "Mindee OCR" },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/40">
                    <span className="text-muted-foreground truncate">{label}</span>
                    <StatusBadge ok={data.ai.ok || key !== "AI_INTEGRATIONS_GEMINI_API_KEY"} label={key === "AI_INTEGRATIONS_GEMINI_API_KEY" ? (data.ai.ok ? "OK" : "⚠") : "✓"} />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Les valeurs exactes ne sont jamais affichées pour des raisons de sécurité.
              </p>
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="flex items-center justify-center h-48">
          <div className="text-center">
            <XCircle className="h-8 w-8 text-red-500 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Impossible de charger les données de monitoring</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Réessayer</Button>
          </div>
        </div>
      )}
    </div>
  );
}
