import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, Clock, Disc, Car, User, GripVertical, Camera } from "lucide-react";
import { type DossierRecord } from "@/lib/dossierDb";
import { formatDistanceToNow, isPast, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

const URGENCY_CONFIG = {
  none: { color: "border-gray-700", badge: "", label: "" },
  low: { color: "border-blue-600", badge: "bg-blue-600", label: "Faible" },
  medium: { color: "border-yellow-500", badge: "bg-yellow-500", label: "Moyen" },
  high: { color: "border-orange-500", badge: "bg-orange-500", label: "Urgent" },
  critical: { color: "border-red-500", badge: "bg-red-500", label: "CRITIQUE" },
};

interface DossierCardProps {
  dossier: DossierRecord;
  onUrgencyChange?: (id: string, urgency: string, version: number) => void;
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return formatDistanceToNow(typeof d === "string" ? parseISO(d) : new Date(d), { addSuffix: true, locale: fr });
  } catch { return "—"; }
}

function isLate(d: string | null | undefined): boolean {
  if (!d) return false;
  try {
    return isPast(typeof d === "string" ? parseISO(d) : new Date(d));
  } catch { return false; }
}

export function DossierCard({ dossier, onUrgencyChange }: DossierCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dossier.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const urgency = (dossier.urgency as keyof typeof URGENCY_CONFIG) || "none";
  const cfg = URGENCY_CONFIG[urgency];
  const late = isLate(dossier.estimatedEndDate);
  const photosArr: any[] = Array.isArray(dossier.repairOrder?.photos) ? dossier.repairOrder.photos : [];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-gray-800 border-2 ${cfg.color} rounded-xl p-3 cursor-default select-none shadow-lg hover:shadow-xl transition-shadow ${late && urgency !== "none" ? "ring-2 ring-red-500/40" : ""}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <div
            {...attributes}
            {...listeners}
            className="text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
          >
            <GripVertical className="h-4 w-4" />
          </div>
          <span className="text-xs font-mono text-gray-400 truncate">{dossier.reference || dossier.id.slice(0, 8)}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {cfg.badge && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${cfg.badge} ${urgency === "critical" ? "animate-pulse" : ""}`}>
              {cfg.label}
            </span>
          )}
          {late && (
            <span className="flex items-center gap-1 text-xs font-bold text-red-400 animate-pulse">
              <AlertTriangle className="h-3 w-3" /> RETARD
            </span>
          )}
        </div>
      </div>

      {/* Client */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <User className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
        <span className="text-sm font-semibold text-white truncate">{dossier.clientName || "Client"}</span>
      </div>

      {/* Véhicule */}
      {(dossier.vehicleMake || dossier.vehicleRegistration) && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <Car className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
          <span className="text-xs text-gray-300 truncate">
            {[dossier.vehicleMake, dossier.vehicleModel].filter(Boolean).join(" ")}
            {dossier.vehicleRegistration && <span className="ml-1 font-mono text-gray-400">· {dossier.vehicleRegistration}</span>}
          </span>
        </div>
      )}

      {/* Prestation + Jantes */}
      <div className="flex items-center gap-3 mb-2">
        {dossier.serviceName && (
          <span className="text-xs text-blue-300 font-medium truncate">{dossier.serviceName}</span>
        )}
        {dossier.wheelCount && (
          <div className="flex items-center gap-1 text-xs text-teal-300 flex-shrink-0">
            <Disc className="h-3 w-3" /> {dossier.wheelCount} jante{dossier.wheelCount > 1 ? "s" : ""}
            {dossier.diameter && <span className="text-gray-400"> · {dossier.diameter}"</span>}
          </div>
        )}
      </div>

      {/* Mini photos */}
      {photosArr.length > 0 && (
        <div className="flex gap-1 mb-2">
          {photosArr.slice(0, 3).map((url: string, i: number) => (
            <img key={i} src={url} alt="" className="h-8 w-8 rounded object-cover border border-gray-600" />
          ))}
          {photosArr.length > 3 && (
            <div className="h-8 w-8 rounded bg-gray-700 border border-gray-600 flex items-center justify-center text-xs text-gray-400">
              +{photosArr.length - 3}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <Clock className="h-3 w-3" />
          <span className={late ? "text-red-400 font-medium" : ""}>{formatDate(dossier.scheduledDate)}</span>
        </div>
        {photosArr.length === 0 && (
          <Camera className="h-3.5 w-3.5 text-gray-600" />
        )}
      </div>
    </div>
  );
}
