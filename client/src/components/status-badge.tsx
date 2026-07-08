import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusType = 
  | "draft" 
  | "pending" 
  | "approved" 
  | "accepted" 
  | "rejected" 
  | "completed" 
  | "cancelled" 
  | "paid" 
  | "overdue" 
  | "confirmed"
  | "sent"
  | "issued"
  | "refunded"
  | "signed"
  | "in_progress"
  | "finalized";

const statusConfig: Record<StatusType, { label: string; className: string }> = {
  draft: { label: "Brouillon", className: "bg-slate-400 text-white border-slate-500" },
  pending: { label: "En attente", className: "bg-sky-500 text-white border-sky-600" },
  approved: { label: "Approuvé", className: "bg-emerald-500 text-white border-emerald-600" },
  accepted: { label: "Accepté", className: "bg-emerald-600 text-white border-emerald-700" },
  rejected: { label: "Refusé", className: "bg-rose-500 text-white border-rose-600" },
  completed: { label: "Terminé", className: "bg-slate-500 text-white border-slate-600" },
  cancelled: { label: "Annulé", className: "bg-rose-500 text-white border-rose-600" },
  paid: { label: "Payée", className: "bg-emerald-500 text-white border-emerald-600" },
  overdue: { label: "En retard", className: "bg-rose-600 text-white border-rose-700" },
  confirmed: { label: "Confirmée", className: "bg-emerald-500 text-white border-emerald-600" },
  sent: { label: "Envoyée", className: "bg-blue-500 text-white border-blue-600" },
  issued: { label: "Émis", className: "bg-blue-500 text-white border-blue-600" },
  refunded: { label: "Remboursé", className: "bg-amber-500 text-white border-amber-600" },
  signed: { label: "Signé", className: "bg-emerald-500 text-white border-emerald-600" },
  in_progress: { label: "En cours", className: "bg-amber-500 text-white border-amber-600" },
  finalized: { label: "Finalisé", className: "bg-emerald-600 text-white border-emerald-700" },
};

const fallbackConfig = { label: "Inconnu", className: "bg-gray-400 text-white border-gray-500" };

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const config = statusConfig[status as StatusType] || fallbackConfig;
  
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs uppercase tracking-wide font-medium",
        config.className,
        className
      )}
      data-testid={`badge-status-${status}`}
    >
      {config.label}
    </Badge>
  );
}
