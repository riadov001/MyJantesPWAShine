import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import QRCode from "qrcode";
import type { Invoice, Quote } from "@shared/schema";

const POSITION_MAP: Record<string, { pos: string; name: string }> = {
  FL: { pos: 'AVG', name: 'AVANT GAUCHE' },
  FR: { pos: 'AVD', name: 'AVANT DROITE' },
  RL: { pos: 'ARG', name: 'ARRIÈRE GAUCHE' },
  RR: { pos: 'ARD', name: 'ARRIÈRE DROITE' },
};

const ALL_POSITIONS = [
  { pos: 'AVG', name: 'AVANT GAUCHE' },
  { pos: 'AVD', name: 'AVANT DROITE' },
  { pos: 'ARG', name: 'ARRIÈRE GAUCHE' },
  { pos: 'ARD', name: 'ARRIÈRE DROITE' },
];

interface LabelsPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentNumber: string;
  onDownload: () => void;
  type: 'invoice' | 'quote';
  wheelPositions?: string[];
}

interface LabelData {
  position: string;
  name: string;
  qrCodeDataUrl: string;
}

export function LabelsPreview({ open, onOpenChange, documentNumber, onDownload, type, wheelPositions }: LabelsPreviewProps) {
  const [labels, setLabels] = useState<LabelData[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const getActivePositions = () => {
    if (wheelPositions && wheelPositions.length > 0) {
      return wheelPositions
        .map(wp => POSITION_MAP[wp])
        .filter(Boolean);
    }
    return ALL_POSITIONS;
  };

  useEffect(() => {
    if (open && documentNumber) {
      generateQRCodes();
    }
  }, [open, documentNumber, wheelPositions]);

  const generateQRCodes = async () => {
    setIsGenerating(true);
    try {
      const activePositions = getActivePositions();
      const labelDefs = [
        ...activePositions,
        { pos: 'CLÉ', name: 'CLÉ VÉHICULE' }
      ];
      
      const generatedLabels = await Promise.all(
        labelDefs.map(async (label) => {
          const qrData = `${documentNumber}-${label.pos}`;
          const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
            width: 200,
            margin: 1,
          });
          return {
            position: label.pos,
            name: label.name,
            qrCodeDataUrl,
          };
        })
      );
      setLabels(generatedLabels);
    } catch (error) {
      console.error("Error generating QR codes:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const activePositions = getActivePositions();
  const totalLabels = activePositions.length + 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Aperçu des Étiquettes</DialogTitle>
          <DialogDescription>
            {totalLabels} étiquettes avec QR codes pour identifier les jantes et la clé du véhicule
          </DialogDescription>
        </DialogHeader>

        {isGenerating ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Génération des QR codes...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            {labels.map((label, index) => (
              <div
                key={index}
                className="border-2 border-border rounded-lg p-4 flex items-center gap-4 hover-elevate"
                data-testid={`label-preview-${label.position}`}
              >
                <div className="flex-shrink-0">
                  <img
                    src={label.qrCodeDataUrl}
                    alt={`QR Code ${label.position}`}
                    className="w-24 h-24"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-2xl font-bold text-primary mb-1">{label.position}</p>
                  <p className="text-sm font-medium text-muted-foreground mb-2">{label.name}</p>
                  <p className="text-xs font-mono text-muted-foreground">{documentNumber}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-labels-preview"
          >
            Annuler
          </Button>
          <Button
            onClick={() => {
              onDownload();
              onOpenChange(false);
            }}
            disabled={isGenerating}
            data-testid="button-download-labels"
          >
            <Download className="h-4 w-4 mr-2" />
            Télécharger PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
