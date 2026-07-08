import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useState, useMemo } from "react";
import { DossierCard } from "./DossierCard";
import { type DossierRecord } from "@/lib/dossierDb";

export const KANBAN_COLUMNS = [
  { id: "reception",   label: "Réception",        emoji: "📥", color: "border-gray-500",   bg: "bg-gray-900/60" },
  { id: "attente",     label: "En attente",        emoji: "⏳", color: "border-yellow-600", bg: "bg-yellow-950/40" },
  { id: "preparation", label: "Préparation",       emoji: "🔧", color: "border-blue-600",   bg: "bg-blue-950/40" },
  { id: "reparation",  label: "Réparation",        emoji: "⚡", color: "border-orange-500", bg: "bg-orange-950/40" },
  { id: "finition",    label: "Finition",          emoji: "✨", color: "border-purple-500", bg: "bg-purple-950/40" },
  { id: "controle",    label: "Contrôle qualité",  emoji: "🔍", color: "border-teal-500",   bg: "bg-teal-950/40" },
  { id: "termine",     label: "Terminé",           emoji: "✅", color: "border-green-500",  bg: "bg-green-950/40" },
  { id: "restitution", label: "Restitution",       emoji: "🚗", color: "border-indigo-500", bg: "bg-indigo-950/40" },
];

interface KanbanBoardProps {
  dossiers: DossierRecord[];
  onMove: (id: string, newStatus: string, clientVersion: number) => void;
  onUrgencyChange?: (id: string, urgency: string, version: number) => void;
}

export function KanbanBoard({ dossiers, onMove, onUrgencyChange }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const byColumn = useMemo(() => {
    const map: Record<string, DossierRecord[]> = {};
    for (const col of KANBAN_COLUMNS) map[col.id] = [];
    for (const d of dossiers) {
      const col = d.atelierStatus || "reception";
      if (map[col]) map[col].push(d);
      else map["reception"].push(d);
    }
    return map;
  }, [dossiers]);

  const activeDossier = activeId ? dossiers.find((d) => d.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const draggedId = String(active.id);
    const overId = String(over.id);

    // Determine target column
    let targetCol = KANBAN_COLUMNS.find((c) => c.id === overId)?.id;
    if (!targetCol) {
      // over is a card id — find its column
      for (const col of KANBAN_COLUMNS) {
        if (byColumn[col.id].some((d) => d.id === overId)) {
          targetCol = col.id;
          break;
        }
      }
    }
    if (!targetCol) return;

    const dossier = dossiers.find((d) => d.id === draggedId);
    if (!dossier || dossier.atelierStatus === targetCol) return;

    onMove(draggedId, targetCol, dossier.version || 1);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 h-full overflow-x-auto pb-4 pt-1">
        {KANBAN_COLUMNS.map((col) => {
          const cards = byColumn[col.id] || [];
          return (
            <KanbanColumn
              key={col.id}
              col={col}
              cards={cards}
              onUrgencyChange={onUrgencyChange}
            />
          );
        })}
      </div>

      <DragOverlay>
        {activeDossier && (
          <div className="rotate-2 scale-105 shadow-2xl">
            <DossierCard dossier={activeDossier} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  col,
  cards,
  onUrgencyChange,
}: {
  col: (typeof KANBAN_COLUMNS)[0];
  cards: DossierRecord[];
  onUrgencyChange?: (id: string, urgency: string, version: number) => void;
}) {
  return (
    <div
      className={`flex flex-col min-w-[240px] w-[240px] rounded-xl border ${col.color} ${col.bg} flex-shrink-0`}
      id={col.id}
    >
      {/* Column Header */}
      <div className={`flex items-center justify-between px-3 py-2.5 border-b ${col.color} sticky top-0`}>
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{col.emoji}</span>
          <span className="text-sm font-bold text-white truncate">{col.label}</span>
        </div>
        <span className="text-xs font-bold text-white bg-gray-700 px-2 py-0.5 rounded-full min-w-[20px] text-center">
          {cards.length}
        </span>
      </div>

      {/* Cards */}
      <SortableContext
        items={cards.map((c) => c.id)}
        strategy={verticalListSortingStrategy}
        id={col.id}
      >
        <div className="flex flex-col gap-2 p-2 overflow-y-auto flex-1 min-h-[60px]">
          {cards.length === 0 && (
            <div className="text-center py-6 text-gray-600 text-xs">Vide</div>
          )}
          {cards.map((d) => (
            <DossierCard
              key={d.id}
              dossier={d}
              onUrgencyChange={onUrgencyChange}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}
