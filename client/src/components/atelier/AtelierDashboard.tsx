import { Clock, AlertTriangle, Timer, Wrench, Disc, TrendingUp } from "lucide-react";

interface AtelierStats {
  total: number;
  today: number;
  urgent: number;
  late: number;
  wheelsInProgress: number;
  totalWheels: number;
  avgDelayHours: number;
  byAtelierStatus: Record<string, number>;
}

interface AtelierDashboardProps {
  stats?: AtelierStats;
  loading?: boolean;
}

function StatCard({ icon: Icon, label, value, color, blink = false }: {
  icon: any; label: string; value: string | number; color: string; blink?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-800/80 border border-gray-700 flex-1 min-w-[140px]`}>
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <div className={`text-2xl font-bold text-white tabular-nums ${blink && Number(value) > 0 ? "animate-pulse text-red-400" : ""}`}>
          {value}
        </div>
        <div className="text-xs text-gray-400 leading-tight">{label}</div>
      </div>
    </div>
  );
}

export function AtelierDashboard({ stats, loading }: AtelierDashboardProps) {
  if (loading || !stats) {
    return (
      <div className="flex gap-3 flex-wrap">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex-1 min-w-[140px] h-16 rounded-xl bg-gray-800/50 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-3 flex-wrap">
      <StatCard icon={Wrench} label="Dossiers actifs" value={stats.total} color="bg-blue-600" />
      <StatCard icon={Clock} label="Aujourd'hui" value={stats.today} color="bg-purple-600" />
      <StatCard icon={AlertTriangle} label="Urgences" value={stats.urgent} color="bg-orange-500" blink={stats.urgent > 0} />
      <StatCard icon={Timer} label="En retard" value={stats.late} color="bg-red-600" blink={stats.late > 0} />
      <StatCard icon={Disc} label="Jantes en cours" value={stats.wheelsInProgress} color="bg-teal-600" />
      <StatCard icon={TrendingUp} label="Délai moyen" value={`${stats.avgDelayHours}h`} color="bg-gray-600" />
    </div>
  );
}
