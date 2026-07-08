import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Car, ScanLine, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export interface VehicleData {
  vehicleRegistration?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleVin?: string | null;
  vehicleFuelType?: string | null;
  vehicleFiscalPower?: string | null;
  vehicleFirstRegDate?: string | null;
  vehicleColor?: string | null;
}

interface VehicleFieldsProps {
  value: VehicleData;
  onChange: (next: VehicleData) => void;
  title?: string;
}

function normalizeDate(input: string | null | undefined): string {
  if (!input) return "";
  const s = String(input).trim();
  // ISO 2024-05-12 -> 12/05/2024
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  // 12-05-2024 -> 12/05/2024
  const dashed = s.match(/^(\d{2})[-/.](\d{2})[-/.](\d{4})/);
  if (dashed) return `${dashed[1]}/${dashed[2]}/${dashed[3]}`;
  return s;
}

function normalizeFiscal(input: string | null | undefined): string {
  if (!input) return "";
  const m = String(input).match(/(\d+)/);
  return m ? m[1] : String(input);
}

export function VehicleFields({ value, onChange, title = "Véhicule" }: VehicleFieldsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const { toast } = useToast();

  const update = (patch: Partial<VehicleData>) => onChange({ ...value, ...patch });

  const handleScan = async (file: File) => {
    if (!file) return;
    setIsScanning(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/ocr/scan-carte-grise", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(err || "Erreur lors du scan");
      }
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || "Le scan a échoué");
      }
      const v = result.vehicleInfo || {};
      const next: VehicleData = {
        vehicleRegistration: v.registrationNumber ? String(v.registrationNumber).toUpperCase() : value.vehicleRegistration ?? "",
        vehicleMake: v.make || value.vehicleMake || "",
        vehicleModel: v.commercialName || v.model || value.vehicleModel || "",
        vehicleVin: v.vin ? String(v.vin).toUpperCase() : value.vehicleVin ?? "",
        vehicleFuelType: v.fuelType || value.vehicleFuelType || "",
        vehicleFiscalPower: normalizeFiscal(v.fiscalPower) || value.vehicleFiscalPower || "",
        vehicleFirstRegDate: normalizeDate(v.firstRegistrationDate) || value.vehicleFirstRegDate || "",
        vehicleColor: v.color || value.vehicleColor || "",
      };
      onChange(next);
      const filledCount = Object.values(next).filter(Boolean).length;
      toast({
        title: "Carte grise scannée",
        description: `${filledCount} champ${filledCount > 1 ? "s" : ""} renseigné${filledCount > 1 ? "s" : ""} automatiquement.`,
      });
    } catch (e: any) {
      toast({
        title: "Échec du scan",
        description: e?.message || "Impossible de lire la carte grise.",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Car className="h-5 w-5" />
          {title}
        </CardTitle>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleScan(f);
            }}
            data-testid="input-vehicle-scan-file"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isScanning}
            data-testid="button-scan-carte-grise"
          >
            {isScanning ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ScanLine className="mr-2 h-4 w-4" />
            )}
            {isScanning ? "Scan en cours…" : "Scanner la carte grise"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="vehicleRegistration">Immatriculation</Label>
            <Input
              id="vehicleRegistration"
              value={value.vehicleRegistration ?? ""}
              onChange={(e) => update({ vehicleRegistration: e.target.value.toUpperCase() })}
              placeholder="AB-123-CD"
              data-testid="input-vehicle-registration"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vehicleVin">Numéro VIN</Label>
            <Input
              id="vehicleVin"
              value={value.vehicleVin ?? ""}
              onChange={(e) => update({ vehicleVin: e.target.value.toUpperCase() })}
              placeholder="VF1XXXXXXXXXXXXXX"
              maxLength={17}
              data-testid="input-vehicle-vin"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vehicleMake">Marque</Label>
            <Input
              id="vehicleMake"
              value={value.vehicleMake ?? ""}
              onChange={(e) => update({ vehicleMake: e.target.value })}
              placeholder="Renault"
              data-testid="input-vehicle-make"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vehicleModel">Modèle</Label>
            <Input
              id="vehicleModel"
              value={value.vehicleModel ?? ""}
              onChange={(e) => update({ vehicleModel: e.target.value })}
              placeholder="Megane"
              data-testid="input-vehicle-model"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vehicleFuelType">Carburant</Label>
            <Input
              id="vehicleFuelType"
              value={value.vehicleFuelType ?? ""}
              onChange={(e) => update({ vehicleFuelType: e.target.value })}
              placeholder="Essence, Diesel, Hybride…"
              data-testid="input-vehicle-fuel-type"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vehicleFiscalPower">Puissance fiscale (CV)</Label>
            <Input
              id="vehicleFiscalPower"
              value={value.vehicleFiscalPower ?? ""}
              onChange={(e) => update({ vehicleFiscalPower: e.target.value })}
              placeholder="7"
              data-testid="input-vehicle-fiscal-power"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vehicleFirstRegDate">1ère mise en circulation</Label>
            <Input
              id="vehicleFirstRegDate"
              value={value.vehicleFirstRegDate ?? ""}
              onChange={(e) => update({ vehicleFirstRegDate: e.target.value })}
              placeholder="JJ/MM/AAAA"
              data-testid="input-vehicle-first-reg-date"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vehicleColor">Couleur</Label>
            <Input
              id="vehicleColor"
              value={value.vehicleColor ?? ""}
              onChange={(e) => update({ vehicleColor: e.target.value })}
              placeholder="Noir"
              data-testid="input-vehicle-color"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
