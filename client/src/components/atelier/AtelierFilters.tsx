import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface AtelierFiltersProps {
  filters: Record<string, string>;
  onFiltersChange: (f: Record<string, string>) => void;
}

const URGENCY_OPTIONS = [
  { value: "all", label: "Toutes urgences" },
  { value: "critical", label: "🔴 Critique" },
  { value: "high", label: "🟠 Urgent" },
  { value: "medium", label: "🟡 Moyen" },
  { value: "low", label: "🔵 Faible" },
  { value: "none", label: "⚪ Aucune" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "Tous statuts" },
  { value: "pending", label: "En attente" },
  { value: "confirmed", label: "Confirmé" },
  { value: "completed", label: "Terminé" },
];

export function AtelierFilters({ filters, onFiltersChange }: AtelierFiltersProps) {
  const [showMore, setShowMore] = useState(false);

  const set = (key: string, value: string) =>
    onFiltersChange({ ...filters, [key]: value });

  const reset = () => onFiltersChange({});

  const hasActive = Object.values(filters).some((v) => v && v !== "all" && v !== "");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
        <Input
          placeholder="Client, immatriculation, référence…"
          value={filters.search || ""}
          onChange={(e) => set("search", e.target.value)}
          className="pl-9 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 h-9"
        />
        {filters.search && (
          <button onClick={() => set("search", "")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Urgence filter */}
      <select
        value={filters.urgency || "all"}
        onChange={(e) => set("urgency", e.target.value)}
        className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 h-9 cursor-pointer"
      >
        {URGENCY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Status filter */}
      <select
        value={filters.status || "all"}
        onChange={(e) => set("status", e.target.value)}
        className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 h-9 cursor-pointer"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Date filter */}
      {showMore && (
        <>
          <input
            type="date"
            value={filters.dateFrom || ""}
            onChange={(e) => set("dateFrom", e.target.value)}
            className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-1.5 h-9"
          />
          <input
            type="date"
            value={filters.dateTo || ""}
            onChange={(e) => set("dateTo", e.target.value)}
            className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-1.5 h-9"
          />
        </>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowMore((v) => !v)}
        className="text-gray-400 hover:text-white h-9 px-2"
      >
        <SlidersHorizontal className="h-4 w-4" />
      </Button>

      {hasActive && (
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          className="text-red-400 hover:text-red-300 h-9 px-2"
        >
          <X className="h-4 w-4" />
          Réinitialiser
        </Button>
      )}
    </div>
  );
}
