import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  Loader2, Upload, Download, AlertCircle, Database,
  FileJson, FileText, FileSpreadsheet, RefreshCw, CheckCircle2, ArrowLeftRight,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

function detectDelimiter(headerLine: string): string {
  // Count unquoted occurrences of ; and , in the header row
  let commas = 0, semis = 0, inQ = false;
  for (let i = 0; i < headerLine.length; i++) {
    const ch = headerLine[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (inQ) continue;
    if (ch === ',') commas++;
    else if (ch === ';') semis++;
  }
  return semis > commas ? ";" : ",";
}

function parseCSVRow(row: string, sep: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      if (inQ && row[i + 1] === '"') { field += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === sep && !inQ) {
      fields.push(field); field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

function parseCSVRFC4180(text: string): Record<string, any>[] {
  const lines: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuote && text[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if ((ch === '\n' || ch === '\r') && !inQuote) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      if (cur.trim()) lines.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) lines.push(cur);
  if (lines.length < 2) return [];

  // Detect delimiter once from header, reuse for all rows
  const sep = detectDelimiter(lines[0]);
  const headers = parseCSVRow(lines[0], sep).map(h => h.trim().replace(/^"|"$/g, ""));
  const result: Record<string, any>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVRow(lines[i], sep);
    if (vals.length === 0) continue;
    const obj: Record<string, any> = {};
    for (let j = 0; j < headers.length; j++) {
      let val: any = (vals[j] ?? "").trim();
      if (val === "true") val = true;
      else if (val === "false") val = false;
      else if (val === "NULL" || val === "null" || val === "") val = null;
      else if (!isNaN(Number(val)) && val !== "") val = Number(val);
      obj[headers[j]] = val;
    }
    result.push(obj);
  }
  return result;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ImportExportPage() {
  const { toast } = useToast();
  const { isSuperAdmin } = useAuth();

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvTable, setCsvTable] = useState<string>("users");
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<{ successCount: number; errorCount: number; total: number } | null>(null);

  const [exporting, setExporting] = useState<string | null>(null);

  const [jsonImporting, setJsonImporting] = useState(false);
  const [sqlImporting, setSqlImporting] = useState(false);
  const [sqlReplaceExisting, setSqlReplaceExisting] = useState(false);
  const [showSqlDialog, setShowSqlDialog] = useState(false);
  const [pendingSqlFile, setPendingSqlFile] = useState<File | null>(null);

  const jsonImportRef = useRef<HTMLInputElement>(null);
  const sqlImportRef = useRef<HTMLInputElement>(null);

  const handleExportCSV = async (type: "quotes" | "invoices") => {
    const key = `csv-${type}`;
    setExporting(key);
    try {
      const res = await fetch(`/api/admin/export/${type}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const blob = await res.blob();
      const label = type === "quotes" ? "devis" : "factures";
      downloadBlob(blob, `export_${label}_${new Date().toISOString().slice(0, 10)}.csv`);
      toast({ title: `Export ${label} CSV`, description: "Fichier téléchargé avec succès" });
    } catch (err: any) {
      toast({ title: "Erreur export CSV", description: err.message, variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const handleExportJSON = async () => {
    setExporting("json");
    try {
      const res = await fetch("/api/admin/export-data", { credentials: "include" });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const blob = await res.blob();
      downloadBlob(blob, `myjantes-data-${new Date().toISOString().slice(0, 10)}.json`);
      toast({ title: "Export JSON terminé", description: "Sauvegarde complète téléchargée" });
    } catch (err: any) {
      toast({ title: "Erreur export JSON", description: err.message, variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const handleExportSQL = async () => {
    setExporting("sql");
    try {
      const res = await fetch("/api/admin/export-database", { credentials: "include" });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const blob = await res.blob();
      downloadBlob(blob, `myjantes-export-${new Date().toISOString().slice(0, 10)}.sql`);
      toast({ title: "Export SQL terminé", description: "Dump PostgreSQL téléchargé" });
    } catch (err: any) {
      toast({ title: "Erreur export SQL", description: err.message, variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const handleCSVImport = async () => {
    if (!csvFile) {
      toast({ title: "Erreur", description: "Sélectionnez un fichier CSV", variant: "destructive" });
      return;
    }
    setCsvImporting(true);
    setCsvResult(null);
    try {
      const text = await csvFile.text();
      const data = parseCSVRFC4180(text);
      if (data.length === 0) throw new Error("Aucune ligne valide trouvée dans le fichier");

      const res = await apiRequest("POST", "/api/admin/import/csv", { table: csvTable, data });
      const result = await res.json();
      setCsvResult(result);
      toast({
        title: "Import CSV terminé",
        description: `${result.successCount} importés, ${result.errorCount} erreurs sur ${result.total} lignes`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${csvTable}`] });
      setCsvFile(null);
    } catch (error: any) {
      toast({ title: "Erreur import CSV", description: error.message, variant: "destructive" });
    } finally {
      setCsvImporting(false);
    }
  };

  const handleJSONImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.name.endsWith(".json")) {
      toast({ title: "Format invalide", description: "Sélectionnez un fichier .json", variant: "destructive" });
      return;
    }
    if (!confirm("Importer ce fichier JSON ? Les enregistrements déjà présents ne seront pas écrasés.")) return;

    setJsonImporting(true);
    const formData = new FormData();
    formData.append("file", file);
    fetch("/api/admin/import-data", { method: "POST", body: formData, credentials: "include" })
      .then(async res => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: "Erreur inconnue" }));
          throw new Error(err.message || `Erreur ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        const summary = Object.entries(data.results || {})
          .map(([t, r]: [string, any]) => `${t}: ${r.imported} importés`)
          .join(", ");
        toast({ title: "Import JSON terminé", description: summary || "Terminé" });
        queryClient.invalidateQueries();
      })
      .catch(err => toast({ title: "Erreur import JSON", description: err.message, variant: "destructive" }))
      .finally(() => setJsonImporting(false));
  };

  const handleSQLImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.name.endsWith(".sql")) {
      toast({ title: "Format invalide", description: "Sélectionnez un fichier .sql", variant: "destructive" });
      return;
    }
    setPendingSqlFile(file);
    setSqlReplaceExisting(false);
    setShowSqlDialog(true);
  };

  const handleConfirmSQLImport = () => {
    setShowSqlDialog(false);
    if (!pendingSqlFile) return;
    setSqlImporting(true);
    const formData = new FormData();
    formData.append("file", pendingSqlFile);
    formData.append("replaceExisting", String(sqlReplaceExisting));
    setPendingSqlFile(null);

    fetch("/api/admin/import-sql", { method: "POST", body: formData, credentials: "include" })
      .then(async res => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: "Erreur inconnue" }));
          throw new Error(err.message || `Erreur ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        const summary = Object.entries(data.results || {})
          .map(([t, r]: [string, any]) => `${t}: ${r.imported} ajoutés`)
          .join(", ");
        toast({ title: "Import SQL terminé", description: summary || "Terminé" });
        queryClient.invalidateQueries();
      })
      .catch(err => toast({ title: "Erreur import SQL", description: err.message, variant: "destructive" }))
      .finally(() => setSqlImporting(false));
  };

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex items-center gap-3">
        <ArrowLeftRight className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Import / Export</h1>
          <p className="text-sm text-muted-foreground">Échangez vos données en CSV, JSON ou SQL</p>
        </div>
      </div>

      {/* ── SECTION 1 : Export CSV ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            Export CSV
          </CardTitle>
          <CardDescription>
            Téléchargez vos devis ou factures au format CSV (Excel compatible, séparateur point-virgule, UTF-8 BOM)
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => handleExportCSV("quotes")}
            disabled={exporting === "csv-quotes"}
          >
            {exporting === "csv-quotes"
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Download className="mr-2 h-4 w-4" />}
            Exporter Devis (.csv)
          </Button>
          <Button
            variant="outline"
            onClick={() => handleExportCSV("invoices")}
            disabled={exporting === "csv-invoices"}
          >
            {exporting === "csv-invoices"
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Download className="mr-2 h-4 w-4" />}
            Exporter Factures (.csv)
          </Button>
        </CardContent>
      </Card>

      {/* ── SECTION 2 : Import CSV ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-blue-600" />
            Import CSV
          </CardTitle>
          <CardDescription>
            Importez massivement des données depuis un fichier CSV. Supporte les guillemets et virgules dans les champs (RFC 4180) ainsi que les séparateurs , et ;
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Type de données</label>
              <Select value={csvTable} onValueChange={setCsvTable}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="users">Utilisateurs / Clients</SelectItem>
                  <SelectItem value="quotes">Devis</SelectItem>
                  <SelectItem value="invoices">Factures</SelectItem>
                  <SelectItem value="reservations">Réservations</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Fichier CSV</label>
              <Input
                type="file"
                accept=".csv"
                key={csvFile ? "has-file" : "no-file"}
                onChange={e => setCsvFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="p-3 bg-muted rounded-md text-xs font-mono">
            <p className="font-semibold mb-1">Colonnes par type :</p>
            <p><strong>users :</strong> email, firstName, lastName, phone, role, password</p>
            <p><strong>quotes :</strong> clientId, serviceId, status, quoteAmount, reference</p>
            <p><strong>invoices :</strong> clientId, quoteId, invoiceNumber, amount, status</p>
            <p><strong>reservations :</strong> clientId, serviceId, scheduledDate, status</p>
          </div>

          {csvResult && (
            <div className="flex items-center gap-2 text-sm p-3 bg-green-50 dark:bg-green-950/20 rounded-md border border-green-200 dark:border-green-800">
              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              <span>
                <strong>{csvResult.successCount}</strong> importés,{" "}
                <strong>{csvResult.errorCount}</strong> erreurs sur{" "}
                <strong>{csvResult.total}</strong> lignes
              </span>
            </div>
          )}

          <Button onClick={handleCSVImport} disabled={csvImporting || !csvFile}>
            {csvImporting
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importation en cours…</>
              : <><Upload className="mr-2 h-4 w-4" />Lancer l'import</>}
          </Button>
        </CardContent>
      </Card>

      {/* ── SECTION 3 & 4 : JSON / SQL (superadmin) ── */}
      {isSuperAdmin && (
        <>
          <Separator />
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" />
            Les sections suivantes sont réservées aux super-administrateurs
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Export JSON / SQL */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-purple-600" />
                  Export JSON / SQL
                  <Badge variant="secondary" className="text-xs">Superadmin</Badge>
                </CardTitle>
                <CardDescription>
                  Sauvegarde complète de la base de données. JSON réimportable, SQL compatible PostgreSQL.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleExportJSON} disabled={exporting === "json"}>
                    {exporting === "json"
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : <FileJson className="mr-2 h-4 w-4" />}
                    Export JSON
                  </Button>
                  <Button variant="outline" onClick={handleExportSQL} disabled={exporting === "sql"}>
                    {exporting === "sql"
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : <FileText className="mr-2 h-4 w-4" />}
                    Export SQL
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  L'export JSON contient toutes les tables. L'export SQL est un dump INSERT compatible Neon/PostgreSQL.
                </p>
              </CardContent>
            </Card>

            {/* Import JSON / SQL */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 text-orange-600" />
                  Import JSON / SQL
                  <Badge variant="secondary" className="text-xs">Superadmin</Badge>
                </CardTitle>
                <CardDescription>
                  Restaurez depuis un fichier exporté précédemment. Les conflits d'ID sont ignorés par défaut.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <input
                  type="file"
                  accept=".json"
                  ref={jsonImportRef}
                  className="hidden"
                  onChange={handleJSONImportFile}
                />
                <input
                  type="file"
                  accept=".sql"
                  ref={sqlImportRef}
                  className="hidden"
                  onChange={handleSQLImportFile}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => jsonImportRef.current?.click()}
                    disabled={jsonImporting}
                  >
                    {jsonImporting
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : <FileJson className="mr-2 h-4 w-4" />}
                    {jsonImporting ? "Import en cours…" : "Importer JSON"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => sqlImportRef.current?.click()}
                    disabled={sqlImporting}
                  >
                    {sqlImporting
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : <FileText className="mr-2 h-4 w-4" />}
                    {sqlImporting ? "Import en cours…" : "Importer SQL"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  JSON : restauration douce (ON CONFLICT DO NOTHING). SQL : possibilité d'écraser les données existantes.
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Confirmation SQL */}
      <AlertDialog open={showSqlDialog} onOpenChange={setShowSqlDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer l'import SQL</AlertDialogTitle>
            <AlertDialogDescription>
              Fichier : <strong>{pendingSqlFile?.name}</strong>
              <br />
              Les instructions INSERT seront exécutées sur la base active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2 px-1">
            <Checkbox
              id="replace-existing"
              checked={sqlReplaceExisting}
              onCheckedChange={v => setSqlReplaceExisting(v === true)}
            />
            <Label htmlFor="replace-existing" className="text-sm cursor-pointer">
              Écraser les enregistrements existants (TRUNCATE avant import)
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSqlFile(null)}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSQLImport}>
              Confirmer l'import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
