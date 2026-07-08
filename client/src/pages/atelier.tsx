import { useState, useCallback, useEffect } from "react";
import { Link } from "wouter";
import { Maximize2, Minimize2, RefreshCw, ArrowLeft, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/atelier/KanbanBoard";
import { AtelierDashboard } from "@/components/atelier/AtelierDashboard";
import { AtelierFilters } from "@/components/atelier/AtelierFilters";
import { SyncIndicator } from "@/components/atelier/SyncIndicator";
import { ConflictModal } from "@/components/atelier/ConflictModal";
import { useDossiers } from "@/hooks/useDossiers";
import { useToast } from "@/hooks/use-toast";
import logoMyJantes from "@assets/cropped-Logo-2-1-768x543_(3)_1767977972324.png";

interface ConflictState {
  open: boolean;
  id: string;
  conflicts: any[];
  clientData: any;
  serverData: any;
}

export default function AtelierPage() {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { toast } = useToast();

  const [conflict, setConflict] = useState<ConflictState>({
    open: false,
    id: "",
    conflicts: [],
    clientData: {},
    serverData: {},
  });

  const { dossiers, isLoading, refetch, stats, statsLoading, updateStatus } = useDossiers(
    Object.fromEntries(Object.entries(filters).filter(([, v]) => v && v !== "all" && v !== ""))
  );

  // Fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const handleMove = useCallback(
    async (id: string, newStatus: string, clientVersion: number) => {
      try {
        const result = await updateStatus.mutateAsync({ id, atelierStatus: newStatus, clientVersion });
        if (!result?.offline) {
          toast({ title: "Dossier déplacé", description: `→ ${newStatus}`, duration: 2000 });
        }
      } catch (err: any) {
        if (err?.conflict) {
          setConflict({
            open: true,
            id,
            conflicts: err.conflict.fields || [],
            clientData: { atelierStatus: newStatus, version: clientVersion },
            serverData: err.conflict.serverData || {},
          });
        } else {
          toast({ title: "Erreur", description: err.message, variant: "destructive" });
        }
      }
    },
    [updateStatus, toast]
  );

  const handleUrgencyChange = useCallback(
    async (id: string, urgency: string, clientVersion: number) => {
      try {
        await updateStatus.mutateAsync({ id, urgency, clientVersion });
      } catch (err: any) {
        toast({ title: "Erreur urgence", description: err.message, variant: "destructive" });
      }
    },
    [updateStatus, toast]
  );

  const handleConflictKeepServer = async () => {
    setConflict((c) => ({ ...c, open: false }));
    await refetch();
    toast({ title: "Serveur conservé", duration: 2000 });
  };

  const handleConflictKeepClient = async () => {
    try {
      await fetch(`/api/dossiers/${conflict.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientData: conflict.clientData, baseData: {} }),
      });
      await refetch();
      toast({ title: "Modifications locales conservées", duration: 2000 });
    } catch {
      toast({ title: "Erreur résolution", variant: "destructive" });
    }
    setConflict((c) => ({ ...c, open: false }));
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
      {/* Top Bar */}
      <header className="flex items-center gap-3 px-4 py-2.5 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        {/* Logo + Nav */}
        <Link href="/admin/workshop" className="flex items-center gap-2 flex-shrink-0 hover:opacity-80 transition-opacity">
          <ArrowLeft className="h-4 w-4 text-gray-400" />
          <img src={logoMyJantes} alt="MyJantes" className="h-7 object-contain" />
        </Link>

        <div className="h-6 w-px bg-gray-700 flex-shrink-0" />

        <h1 className="text-base font-bold text-white flex-shrink-0">
          Mode Atelier <span className="text-red-500">●</span>
        </h1>

        <div className="flex-1" />

        {/* Filters */}
        <div className="flex-1 max-w-2xl">
          <AtelierFilters filters={filters} onFiltersChange={setFilters} />
        </div>

        <div className="flex-1" />

        {/* Right controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <SyncIndicator />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            className="text-gray-400 hover:text-white h-8 w-8"
            title="Actualiser"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFullscreen}
            className="text-gray-400 hover:text-white h-8 w-8"
            title="Plein écran"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>

          <Link href="/admin/settings">
            <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white h-8 w-8">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </header>

      {/* Stats Dashboard */}
      <div className="px-4 py-2.5 bg-gray-900/50 border-b border-gray-800 flex-shrink-0">
        <AtelierDashboard stats={stats} loading={statsLoading} />
      </div>

      {/* Kanban */}
      <main className="flex-1 overflow-hidden px-3 py-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <RefreshCw className="h-8 w-8 animate-spin text-red-500 mx-auto mb-3" />
              <p className="text-gray-400">Chargement des dossiers…</p>
            </div>
          </div>
        ) : (
          <KanbanBoard
            dossiers={dossiers}
            onMove={handleMove}
            onUrgencyChange={handleUrgencyChange}
          />
        )}
      </main>

      {/* Barre de statut bas */}
      <footer className="px-4 py-1.5 bg-gray-900 border-t border-gray-800 flex items-center justify-between text-xs text-gray-600 flex-shrink-0">
        <span>{dossiers.length} dossier{dossiers.length !== 1 ? "s" : ""} affichés</span>
        <span>Actualisation auto toutes les 25s</span>
        <span>MyJantes Atelier v2</span>
      </footer>

      {/* Conflict Modal */}
      <ConflictModal
        open={conflict.open}
        conflicts={conflict.conflicts}
        onKeepServer={handleConflictKeepServer}
        onKeepClient={handleConflictKeepClient}
        onClose={() => setConflict((c) => ({ ...c, open: false }))}
      />
    </div>
  );
}
