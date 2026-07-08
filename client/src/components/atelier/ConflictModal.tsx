import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ConflictField {
  field: string;
  serverValue: any;
  clientValue: any;
  resolution: string;
  resolvedValue: any;
}

interface ConflictModalProps {
  open: boolean;
  conflicts: ConflictField[];
  onKeepServer: () => void;
  onKeepClient: () => void;
  onClose: () => void;
}

const FIELD_LABELS: Record<string, string> = {
  atelierStatus: "Statut Kanban",
  urgency: "Urgence",
  status: "Statut réservation",
  notes: "Notes",
  technicianNotes: "Notes technicien",
  estimatedEndDate: "Date de fin estimée",
  assignedEmployeeId: "Employé assigné",
};

function ValueBadge({ value }: { value: any }) {
  const str = value === null || value === undefined ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return <span className="px-2 py-0.5 bg-gray-700 rounded text-sm font-mono">{str}</span>;
}

export function ConflictModal({ open, conflicts, onKeepServer, onKeepClient, onClose }: ConflictModalProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-orange-500 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-400">
            <AlertTriangle className="h-5 w-5" />
            Conflit de modifications
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-400 mb-4">
          Des modifications ont eu lieu simultanément. Choisissez quelle version conserver.
        </p>
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {conflicts.map((c) => (
            <div key={c.field} className="bg-gray-800 rounded-lg p-3 border border-gray-700">
              <div className="font-medium text-sm mb-2">{FIELD_LABELS[c.field] || c.field}</div>
              <div className="flex gap-3 items-center text-xs">
                <div className="flex-1">
                  <div className="text-gray-500 mb-1">Serveur</div>
                  <ValueBadge value={c.serverValue} />
                </div>
                <div className="text-gray-600">→</div>
                <div className="flex-1">
                  <div className="text-gray-500 mb-1">Local</div>
                  <ValueBadge value={c.clientValue} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2 mt-4">
          <Button variant="outline" onClick={onClose} className="border-gray-600 text-gray-300">
            Annuler
          </Button>
          <Button onClick={onKeepServer} className="bg-blue-600 hover:bg-blue-700">
            Garder le serveur
          </Button>
          <Button onClick={onKeepClient} className="bg-orange-600 hover:bg-orange-700">
            Garder mes modifs
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
