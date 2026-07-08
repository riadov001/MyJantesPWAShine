import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ScanLine, Upload, FileText, Car, UserCheck, Globe, Loader2, Copy, X, Plus, Trash2, FileCheck, Receipt, History, Eye, Clock, RotateCcw, Wallet, Landmark } from "lucide-react";
import type { User, OcrScan, Invoice, ExpenseCategory } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type DocumentType = "invoice" | "carte_grise" | "id_card" | "passport" | "quote" | "bank_statement" | "other";

interface DocumentTypeOption {
  value: DocumentType;
  label: string;
  icon: any;
  description: string;
}

const documentTypes: DocumentTypeOption[] = [
  { value: "invoice", label: "Facture", icon: FileText, description: "Factures et documents financiers" },
  { value: "carte_grise", label: "Carte Grise", icon: Car, description: "Certificat d'immatriculation" },
  { value: "id_card", label: "Carte d'identité", icon: UserCheck, description: "CNI française" },
  { value: "passport", label: "Passeport", icon: Globe, description: "Passeport international" },
  { value: "quote", label: "Devis", icon: FileText, description: "Devis client ou fournisseur" },
  { value: "bank_statement", label: "Relevé bancaire", icon: Landmark, description: "Relevé de compte bancaire" },
  { value: "other", label: "Autre", icon: FileText, description: "Autre type de document" },
];

interface OcrLineItem {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
}

function ResultField({ label, value }: { label: string; value: string | number | null | undefined }) {
  const { toast } = useToast();
  if (value === null || value === undefined || value === "") return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(String(value));
    toast({ title: "Copié", description: `${label} copié dans le presse-papier` });
  };

  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <div className="flex items-center gap-1">
        <span className="text-sm font-medium text-right" data-testid={`text-ocr-${label.toLowerCase().replace(/\s+/g, "-")}`}>{String(value)}</span>
        <Button size="icon" variant="ghost" onClick={handleCopy} data-testid={`button-copy-${label.toLowerCase().replace(/\s+/g, "-")}`}>
          <Copy className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function InvoiceResult({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div className="space-y-0">
        <ResultField label="N° Facture" value={data.invoiceNumber} />
        <ResultField label="Date" value={data.invoiceDate} />
        <ResultField label="Échéance" value={data.dueDate} />
        <ResultField label="Fournisseur" value={data.supplierName} />
        <ResultField label="Adresse fournisseur" value={data.supplierAddress} />
        <ResultField label="Client" value={data.customerName} />
        <ResultField label="Adresse client" value={data.customerAddress} />
        <ResultField label="Total HT" value={data.totalNet != null ? `${data.totalNet} €` : null} />
        <ResultField label="TVA" value={data.totalTax != null ? `${data.totalTax} €` : null} />
        <ResultField label="Total TTC" value={data.totalAmount != null ? `${data.totalAmount} €` : null} />
      </div>
      {data.lineItems && data.lineItems.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Lignes de facture</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1 pr-2">Description</th>
                  <th className="text-right py-1 px-2">Qté</th>
                  <th className="text-right py-1 px-2">P.U.</th>
                  <th className="text-right py-1 pl-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.lineItems.map((item: any, i: number) => (
                  <tr key={i} className="border-b border-border last:border-0" data-testid={`row-line-item-${i}`}>
                    <td className="py-1 pr-2">{item.description || "-"}</td>
                    <td className="text-right py-1 px-2">{item.quantity ?? "-"}</td>
                    <td className="text-right py-1 px-2">{item.unitPrice != null ? `${item.unitPrice} €` : "-"}</td>
                    <td className="text-right py-1 pl-2">{item.totalAmount != null ? `${item.totalAmount} €` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CarteGriseResult({ data }: { data: any }) {
  return (
    <div className="space-y-0">
      <ResultField label="Immatriculation" value={data.registrationNumber} />
      <ResultField label="Première immatriculation" value={data.firstRegistrationDate} />
      <ResultField label="Propriétaire" value={data.ownerFullName} />
      <ResultField label="Prénom" value={data.ownerFirstName} />
      <ResultField label="Nom" value={data.ownerSurname} />
      <ResultField label="Adresse" value={data.ownerAddress} />
      <ResultField label="Marque" value={data.make} />
      <ResultField label="Modèle" value={data.model} />
      <ResultField label="VIN" value={data.vin} />
      <ResultField label="N° Formule" value={data.formula} />
      <ResultField label="Catégorie" value={data.category} />
      <ResultField label="Carburant" value={data.fuelType} />
      <ResultField label="Puissance fiscale" value={data.fiscalPower} />
    </div>
  );
}

function IdCardResult({ data }: { data: any }) {
  return (
    <div className="space-y-0">
      <ResultField label="N° Document" value={data.documentNumber} />
      <ResultField label="Nom" value={data.surname} />
      <ResultField label="Prénoms" value={data.givenNames?.join(" ")} />
      <ResultField label="Date de naissance" value={data.birthDate} />
      <ResultField label="Lieu de naissance" value={data.birthPlace} />
      <ResultField label="Sexe" value={data.gender} />
      <ResultField label="Nationalité" value={data.nationality} />
      <ResultField label="Date d'expiration" value={data.expiryDate} />
      <ResultField label="Date de délivrance" value={data.issueDate} />
      <ResultField label="Autorité" value={data.authority} />
    </div>
  );
}

function PassportResult({ data }: { data: any }) {
  return (
    <div className="space-y-0">
      <ResultField label="N° Document" value={data.documentId} />
      <ResultField label="Nom" value={data.surname} />
      <ResultField label="Prénoms" value={data.givenNames?.join(" ")} />
      <ResultField label="Date de naissance" value={data.birthDate} />
      <ResultField label="Lieu de naissance" value={data.birthPlace} />
      <ResultField label="Sexe" value={data.gender} />
      <ResultField label="Pays" value={data.country} />
      <ResultField label="Date d'expiration" value={data.expiryDate} />
      <ResultField label="Date de délivrance" value={data.issuanceDate} />
      <ResultField label="MRZ Ligne 1" value={data.mrz1} />
      <ResultField label="MRZ Ligne 2" value={data.mrz2} />
    </div>
  );
}

async function scanDocument(formData: FormData) {
  const response = await fetch("/api/ocr/scan-vision", {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    let errorMessage = "Erreur lors du scan";
    try {
      const text = await response.text();
      try {
        const error = JSON.parse(text);
        errorMessage = error.message || errorMessage;
      } catch {
        if (text.includes("<!DOCTYPE html>")) {
          errorMessage = "Le serveur a renvoyé une erreur système. Veuillez réessayer.";
        }
      }
    } catch {
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

function OcrCreateDialog({
  open,
  onOpenChange,
  mode,
  ocrData,
  scanId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "quote" | "invoice" | "credit_note" | "expense";
  ocrData: any;
  scanId?: string | null;
}) {
  const { toast } = useToast();
  const [clientId, setClientId] = useState("");
  const [lineItems, setLineItems] = useState<OcrLineItem[]>([]);
  const [wheelCount, setWheelCount] = useState("4");
  const [diameter, setDiameter] = useState("");
  const [taxRate, setTaxRate] = useState("20");
  const [productDetails, setProductDetails] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("wire_transfer");
  const [reason, setReason] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [supplier, setSupplier] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [receiptRef, setReceiptRef] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: invoicesList = [] } = useQuery<Invoice[]>({
    queryKey: ["/api/admin/invoices"],
    enabled: mode === "credit_note",
  });

  const { data: expenseCategories = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ["/api/admin/expense-categories"],
    enabled: mode === "expense",
  });

  useEffect(() => {
    if (open && ocrData) {
      const items: OcrLineItem[] = [];
      if (ocrData.lineItems && ocrData.lineItems.length > 0) {
        ocrData.lineItems.forEach((item: any) => {
          items.push({
            description: item.description || "",
            quantity: String(item.quantity ?? 1),
            unitPrice: String(item.unitPrice ?? 0),
            taxRate: String(item.taxRate ?? 20),
          });
        });
      } else if (ocrData.totalNet != null) {
        items.push({
          description: ocrData.supplierName ? `Prestation ${ocrData.supplierName}` : "Prestation scannée",
          quantity: "1",
          unitPrice: String(ocrData.totalNet),
          taxRate: "20",
        });
      }
      setLineItems(items);

      const supplierInfo = [
        ocrData.supplierName,
        ocrData.customerName,
        ocrData.invoiceNumber ? `Réf: ${ocrData.invoiceNumber}` : null,
      ].filter(Boolean).join(" - ");
      setProductDetails(supplierInfo || "");

      if (ocrData.supplierName) {
        setSupplier(ocrData.supplierName);
      }
      if (ocrData.totalNet != null) {
        setExpenseAmount(String(ocrData.totalNet));
      }
      if (ocrData.invoiceNumber) {
        setReceiptRef(ocrData.invoiceNumber);
      }
      if (ocrData.invoiceDate) {
        const d = new Date(ocrData.invoiceDate);
        if (!isNaN(d.getTime())) {
          setExpenseDate(d.toISOString().split("T")[0]);
        }
      }

      if (ocrData.dueDate) {
        const d = new Date(ocrData.dueDate);
        if (!isNaN(d.getTime())) {
          setDueDate(d.toISOString().split("T")[0]);
        }
      }

      const ocrNotes = [
        ocrData.invoiceNumber ? `Facture source: ${ocrData.invoiceNumber}` : null,
        ocrData.invoiceDate ? `Date facture: ${ocrData.invoiceDate}` : null,
        ocrData.supplierName ? `Fournisseur: ${ocrData.supplierName}` : null,
      ].filter(Boolean).join("\n");
      setNotes(ocrNotes);
    }
  }, [open, ocrData]);

  const addLineItem = () => {
    setLineItems([...lineItems, { description: "", quantity: "1", unitPrice: "0", taxRate: taxRate }]);
  };

  const updateLineItem = (index: number, field: keyof OcrLineItem, value: string) => {
    const updated = [...lineItems];
    updated[index][field] = value;
    setLineItems(updated);
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const calculateTotalHT = () => {
    if (mode === "expense") return parseFloat(expenseAmount) || 0;
    const wMult = (mode === "quote" || mode === "invoice") ? (parseInt(wheelCount) || 1) : 1;
    return lineItems.reduce((total, item) => {
      return total + (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0) * wMult;
    }, 0);
  };

  const calculateTaxAmount = () => {
    return (calculateTotalHT() * (parseFloat(taxRate) || 0)) / 100;
  };

  const calculateTotalTTC = () => {
    return calculateTotalHT() + calculateTaxAmount();
  };

  const createQuoteMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/admin/ocr/create-quote", data);
    },
    onSuccess: () => {
      toast({ title: "Devis créé", description: "Le devis a été créé à partir du scan OCR" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quotes"] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message || "Échec de la création du devis", variant: "destructive" });
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/admin/ocr/create-invoice", data);
    },
    onSuccess: () => {
      toast({ title: "Facture créée", description: "La facture a été créée à partir du scan OCR" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invoices"] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message || "Échec de la création de la facture", variant: "destructive" });
    },
  });

  const createCreditNoteMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/admin/ocr/create-credit-note", data);
    },
    onSuccess: () => {
      toast({ title: "Avoir créé", description: "L'avoir a été créé à partir du scan OCR" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/credit-notes"] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message || "Échec de la création de l'avoir", variant: "destructive" });
    },
  });

  const createExpenseMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/admin/ocr/create-expense", data);
    },
    onSuccess: () => {
      toast({ title: "Dépense créée", description: "La dépense a été créée à partir du scan OCR" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message || "Échec de la création de la dépense", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setClientId("");
    setLineItems([]);
    setWheelCount("4");
    setDiameter("");
    setTaxRate("20");
    setProductDetails("");
    setNotes("");
    setDueDate("");
    setPaymentMethod("wire_transfer");
    setReason("");
    setInvoiceId("");
    setCategoryId("");
    setSupplier("");
    setExpenseDate("");
    setReceiptRef("");
    setExpenseAmount("");
  };

  const handleSubmit = () => {
    if (mode === "expense") {
      if (!supplier) {
        toast({ title: "Fournisseur requis", description: "Veuillez saisir un fournisseur", variant: "destructive" });
        return;
      }
      createExpenseMutation.mutate({
        categoryId: categoryId || null,
        supplier,
        amountHT: expenseAmount || "0",
        taxRate,
        date: expenseDate || undefined,
        description: productDetails || null,
        notes: notes || null,
        receiptRef: receiptRef || null,
        scanId: scanId || undefined,
      });
      return;
    }

    if (mode === "credit_note") {
      if (!clientId) {
        toast({ title: "Client requis", description: "Veuillez sélectionner un client", variant: "destructive" });
        return;
      }
      if (!invoiceId) {
        toast({ title: "Facture requise", description: "Veuillez sélectionner une facture liée", variant: "destructive" });
        return;
      }
      if (!reason) {
        toast({ title: "Motif requis", description: "Veuillez saisir un motif", variant: "destructive" });
        return;
      }
      if (lineItems.length === 0) {
        toast({ title: "Lignes requises", description: "Veuillez ajouter au moins une ligne", variant: "destructive" });
        return;
      }
      const creditLineItems = lineItems.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPriceHT: item.unitPrice,
        taxRate: item.taxRate,
      }));
      createCreditNoteMutation.mutate({
        clientId,
        invoiceId,
        reason,
        taxRate,
        notes: notes || null,
        lineItems: creditLineItems,
        scanId: scanId || undefined,
      });
      return;
    }

    if (!clientId) {
      toast({ title: "Client requis", description: "Veuillez sélectionner un client", variant: "destructive" });
      return;
    }
    if (lineItems.length === 0) {
      toast({ title: "Lignes requises", description: "Veuillez ajouter au moins une ligne", variant: "destructive" });
      return;
    }

    const wMult = parseInt(wheelCount) || 1;

    if (mode === "quote") {
      const quoteServices = lineItems.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      }));

      createQuoteMutation.mutate({
        clientId,
        wheelCount: parseInt(wheelCount),
        diameter: diameter || null,
        taxRate,
        productDetails: productDetails || null,
        notes: notes || null,
        services: quoteServices,
        scanId: scanId || undefined,
      });
    } else {
      const invoiceItems = lineItems.map(item => {
        const qty = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.unitPrice) || 0;
        const baseTotal = qty * price;
        const totalWithWheels = baseTotal * wMult;
        const itemTaxRate = parseFloat(item.taxRate || taxRate) || 0;
        const itemTaxAmount = (totalWithWheels * itemTaxRate) / 100;

        return {
          description: item.description,
          quantity: qty,
          unitPriceExcludingTax: price,
          totalExcludingTax: totalWithWheels,
          taxRate: itemTaxRate,
          taxAmount: itemTaxAmount,
          totalIncludingTax: totalWithWheels + itemTaxAmount,
        };
      });

      createInvoiceMutation.mutate({
        clientId,
        paymentMethod,
        wheelCount: parseInt(wheelCount),
        diameter: diameter || null,
        taxRate,
        productDetails: productDetails || null,
        notes: notes || null,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        invoiceItems,
        scanId: scanId || undefined,
      });
    }
  };

  const isPending = createQuoteMutation.isPending || createInvoiceMutation.isPending || createCreditNoteMutation.isPending || createExpenseMutation.isPending;
  const clients = users.filter(u => u.role === "client" || u.role === "client_professionnel");

  const dialogTitle = mode === "quote" ? "Créer un Devis depuis le Scan"
    : mode === "invoice" ? "Créer une Facture depuis le Scan"
    : mode === "credit_note" ? "Créer un Avoir depuis le Scan"
    : "Créer une Dépense depuis le Scan";

  const lineLabel = mode === "quote" ? "devis" : mode === "invoice" ? "facture" : mode === "credit_note" ? "avoir" : "dépense";

  const showWheelFields = mode === "quote" || mode === "invoice";
  const showLineItems = mode !== "expense";
  const showClientField = mode !== "expense";

  const isSubmitDisabled = isPending || (showClientField && !clientId) || (showLineItems && lineItems.length === 0) || (mode === "expense" && !supplier);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            Les données ont été pré-remplies à partir du scan OCR. Vérifiez et ajustez les informations avant de créer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {showClientField && (
            <div className="space-y-2">
              <Label>Client *</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger data-testid="select-ocr-client">
                  <SelectValue placeholder="Sélectionner un client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.firstName} {user.lastName} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === "credit_note" && (
            <>
              <div className="space-y-2">
                <Label>Facture liée *</Label>
                <Select value={invoiceId} onValueChange={setInvoiceId}>
                  <SelectTrigger data-testid="select-ocr-invoice">
                    <SelectValue placeholder="Sélectionner une facture" />
                  </SelectTrigger>
                  <SelectContent>
                    {invoicesList.map((inv) => (
                      <SelectItem key={inv.id} value={inv.id}>
                        {inv.invoiceNumber} - {inv.amount} EUR
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Motif de l'avoir *</Label>
                <Textarea
                  placeholder="Motif de l'avoir..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  data-testid="textarea-ocr-reason"
                />
              </div>
            </>
          )}

          {mode === "expense" && (
            <>
              <div className="space-y-2">
                <Label>Fournisseur *</Label>
                <Input
                  placeholder="Nom du fournisseur"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  data-testid="input-ocr-supplier"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Catégorie</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger data-testid="select-ocr-category">
                      <SelectValue placeholder="Sélectionner une catégorie" />
                    </SelectTrigger>
                    <SelectContent>
                      {expenseCategories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    data-testid="input-ocr-expense-date"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Montant HT</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    data-testid="input-ocr-expense-amount"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Réf. reçu</Label>
                  <Input
                    placeholder="Référence du reçu"
                    value={receiptRef}
                    onChange={(e) => setReceiptRef(e.target.value)}
                    data-testid="input-ocr-receipt-ref"
                  />
                </div>
              </div>
            </>
          )}

          {showLineItems && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label>Lignes de {lineLabel}</Label>
                <Button variant="outline" size="sm" onClick={addLineItem} data-testid="button-add-ocr-line">
                  <Plus className="h-4 w-4 mr-1" />
                  Ajouter
                </Button>
              </div>
              {lineItems.length > 0 ? (
                <div className="space-y-2">
                  {lineItems.map((item, index) => (
                    <div key={index} className="p-3 border border-border rounded-md space-y-2" data-testid={`card-ocr-line-${index}`}>
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <Input
                            placeholder="Description"
                            value={item.description}
                            onChange={(e) => updateLineItem(index, "description", e.target.value)}
                            data-testid={`input-ocr-line-desc-${index}`}
                          />
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeLineItem(index)}
                          data-testid={`button-remove-ocr-line-${index}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Quantité</Label>
                          <Input
                            type="number"
                            step="1"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateLineItem(index, "quantity", e.target.value)}
                            data-testid={`input-ocr-line-qty-${index}`}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Prix unitaire HT</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.unitPrice}
                            onChange={(e) => updateLineItem(index, "unitPrice", e.target.value)}
                            data-testid={`input-ocr-line-price-${index}`}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">TVA (%)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={item.taxRate}
                            onChange={(e) => updateLineItem(index, "taxRate", e.target.value)}
                            data-testid={`input-ocr-line-tax-${index}`}
                          />
                        </div>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        Sous-total: {((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)).toFixed(2)} EUR
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Aucune ligne. Cliquez sur "Ajouter" pour en créer.</p>
              )}
            </div>
          )}

          {showWheelFields && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Nombre de jantes</Label>
                <Select value={wheelCount} onValueChange={setWheelCount}>
                  <SelectTrigger className="mt-1" data-testid="select-ocr-wheel-count">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 jante</SelectItem>
                    <SelectItem value="2">2 jantes</SelectItem>
                    <SelectItem value="3">3 jantes</SelectItem>
                    <SelectItem value="4">4 jantes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Diamètre</Label>
                <Input
                  type="text"
                  placeholder="Ex: 17 pouces"
                  value={diameter}
                  onChange={(e) => setDiameter(e.target.value)}
                  className="mt-1"
                  data-testid="input-ocr-diameter"
                />
              </div>
            </div>
          )}

          <div>
            <Label>TVA globale (%)</Label>
            <Input
              type="number"
              step="0.01"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              className="mt-1"
              data-testid="input-ocr-tax-rate"
            />
          </div>

          {mode === "invoice" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Moyen de paiement</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="mt-1" data-testid="select-ocr-payment-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Espèces</SelectItem>
                    <SelectItem value="wire_transfer">Virement</SelectItem>
                    <SelectItem value="card">Carte bancaire</SelectItem>
                    <SelectItem value="stripe">Stripe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date d'échéance</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1"
                  data-testid="input-ocr-due-date"
                />
              </div>
            </div>
          )}

          {(showLineItems ? lineItems.length > 0 : parseFloat(expenseAmount) > 0) && (
            <div className="p-4 bg-muted rounded-md space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span>Total HT :</span>
                <span className="font-mono" data-testid="text-ocr-total-ht">{calculateTotalHT().toFixed(2)} EUR</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span>TVA ({taxRate}%) :</span>
                <span className="font-mono" data-testid="text-ocr-total-tax">{calculateTaxAmount().toFixed(2)} EUR</span>
              </div>
              <div className="flex justify-between items-center font-bold text-base pt-2 border-t border-border">
                <span>Total TTC :</span>
                <span className="font-mono text-primary" data-testid="text-ocr-total-ttc">{calculateTotalTTC().toFixed(2)} EUR</span>
              </div>
            </div>
          )}

          <div>
            <Label>{mode === "expense" ? "Description" : "Détails du produit"}</Label>
            <Textarea
              placeholder={mode === "expense" ? "Description de la dépense..." : "Description du produit, références..."}
              value={productDetails}
              onChange={(e) => setProductDetails(e.target.value)}
              className="mt-1"
              rows={2}
              data-testid="textarea-ocr-product-details"
            />
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              placeholder="Notes additionnelles..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1"
              rows={3}
              data-testid="textarea-ocr-notes"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-ocr-create">
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            data-testid="button-submit-ocr-create"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Création...
              </>
            ) : mode === "quote" ? (
              <>
                <FileCheck className="h-4 w-4 mr-2" />
                Créer le Devis
              </>
            ) : mode === "invoice" ? (
              <>
                <Receipt className="h-4 w-4 mr-2" />
                Créer la Facture
              </>
            ) : mode === "credit_note" ? (
              <>
                <RotateCcw className="h-4 w-4 mr-2" />
                Créer l'Avoir
              </>
            ) : (
              <>
                <Wallet className="h-4 w-4 mr-2" />
                Créer la Dépense
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScanHistoryTab() {
  const { toast } = useToast();
  const [viewingScan, setViewingScan] = useState<OcrScan | null>(null);

  const { data: scans = [], isLoading } = useQuery<OcrScan[]>({
    queryKey: ["/api/admin/ocr/history"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/ocr/history/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ocr/history"] });
      toast({ title: "Supprimé", description: "L'entrée d'historique a été supprimée" });
    },
  });

  const docTypeLabels: Record<string, string> = {
    invoice: "Facture",
    carte_grise: "Carte Grise",
    id_card: "Carte d'identité",
    passport: "Passeport",
  };

  const docTypeIcons: Record<string, typeof FileText> = {
    invoice: FileText,
    carte_grise: Car,
    id_card: UserCheck,
    passport: Globe,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (scans.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
          <History className="h-8 w-8" />
          <p className="text-sm">Aucun scan dans l'historique</p>
          <p className="text-xs">Les résultats de vos prochains scans apparaîtront ici</p>
        </CardContent>
      </Card>
    );
  }

  const getScanSummary = (scan: OcrScan) => {
    const resultData = scan.result as any;
    let summary = scan.fileName || "Document";
    if (resultData && scan.documentType === "invoice") {
      summary = [resultData.supplierName, resultData.invoiceNumber, resultData.totalAmount ? `${resultData.totalAmount} \u20AC` : null].filter(Boolean).join(" - ") || summary;
    } else if (resultData && scan.documentType === "carte_grise") {
      summary = [resultData.registrationNumber, resultData.ownerName].filter(Boolean).join(" - ") || summary;
    } else if (resultData && (scan.documentType === "id_card" || scan.documentType === "passport")) {
      summary = [resultData.lastName, resultData.firstName].filter(Boolean).join(" ") || summary;
    }
    return summary;
  };

  return (
    <>
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="pb-3 font-medium text-muted-foreground">Document</th>
              <th className="pb-3 font-medium text-muted-foreground">Type</th>
              <th className="pb-3 font-medium text-muted-foreground">Liens</th>
              <th className="pb-3 font-medium text-muted-foreground">Date</th>
              <th className="pb-3 font-medium text-muted-foreground text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {scans.map((scan) => {
              const Icon = docTypeIcons[scan.documentType] || FileText;
              return (
                <tr key={scan.id} className="hover-elevate group" data-testid={`card-scan-${scan.id}`}>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium truncate max-w-[300px]">{getScanSummary(scan)}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge variant="secondary">{docTypeLabels[scan.documentType] || scan.documentType}</Badge>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-1.5">
                      {scan.createdQuoteId && <Badge variant="outline">Devis</Badge>}
                      {scan.createdInvoiceId && <Badge variant="outline">Facture</Badge>}
                      {!scan.createdQuoteId && !scan.createdInvoiceId && <span className="text-muted-foreground">-</span>}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                    {scan.createdAt ? new Date(scan.createdAt).toLocaleString("fr-FR") : "-"}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setViewingScan(scan)} data-testid={`button-view-scan-${scan.id}`}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(scan.id)} disabled={deleteMutation.isPending} data-testid={`button-delete-scan-${scan.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="lg:hidden space-y-3">
        {scans.map((scan) => {
          const Icon = docTypeIcons[scan.documentType] || FileText;
          return (
            <Card key={scan.id} data-testid={`card-scan-mobile-${scan.id}`}>
              <CardContent className="flex items-center gap-3 py-3 px-4">
                <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{getScanSummary(scan)}</span>
                    <Badge variant="secondary">{docTypeLabels[scan.documentType] || scan.documentType}</Badge>
                    {scan.createdQuoteId && <Badge variant="outline">Devis</Badge>}
                    {scan.createdInvoiceId && <Badge variant="outline">Facture</Badge>}
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {scan.createdAt ? new Date(scan.createdAt).toLocaleString("fr-FR") : "-"}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => setViewingScan(scan)} data-testid={`button-view-scan-${scan.id}`}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(scan.id)} disabled={deleteMutation.isPending} data-testid={`button-delete-scan-${scan.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!viewingScan} onOpenChange={(open) => { if (!open) setViewingScan(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Résultat du scan</DialogTitle>
            <DialogDescription>
              {viewingScan?.fileName} - {docTypeLabels[viewingScan?.documentType || ""] || viewingScan?.documentType}
            </DialogDescription>
          </DialogHeader>
          {viewingScan?.result && (() => {
            const r = viewingScan.result as any;
            switch (viewingScan.documentType) {
              case "invoice": return <InvoiceResult data={r} />;
              case "carte_grise": return <CarteGriseResult data={r} />;
              case "id_card": return <IdCardResult data={r} />;
              case "passport": return <PassportResult data={r} />;
              default: return <pre className="text-xs overflow-auto">{JSON.stringify(r, null, 2)}</pre>;
            }
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function AdminScanner() {
  const { toast } = useToast();
  const [documentType, setDocumentType] = useState<DocumentType>("invoice");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<"quote" | "invoice" | "credit_note" | "expense" | null>(null);

  const scanMutation = useMutation({
    mutationFn: scanDocument,
    onSuccess: (data) => {
      const r = data.result;
      const flatResult = r?.data ? { ...r.data, type: r.type || r.data?.type, confidence: r.confidence } : r;
      setResult(flatResult);
      setScanId(data.scanId || null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ocr/history"] });
      toast({ title: "Scan terminé", description: "Le document a été analysé avec succès" });
    },
    onError: (error: Error) => {
      console.error("Scan error details:", error);
      toast({ 
        title: "Erreur de scan", 
        description: error.message || "Une erreur est survenue lors de l'analyse du document.", 
        variant: "destructive" 
      });
    },
  });

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({ title: "Fichier trop volumineux", description: "La taille maximale est de 10 Mo", variant: "destructive" });
      return;
    }

    setSelectedFile(file);
    setResult(null);

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }
  }, [toast]);

  const handleScan = () => {
    if (!selectedFile) {
      toast({ title: "Aucun fichier", description: "Veuillez sélectionner un fichier à scanner", variant: "destructive" });
      return;
    }

    setResult(null);
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("documentType", documentType);
    scanMutation.mutate(formData);
  };

  const handleClear = () => {
    setSelectedFile(null);
    setPreview(null);
    setResult(null);
  };

  const currentDocType = documentTypes.find(dt => dt.value === documentType);

  const renderResult = () => {
    if (!result) return null;
    switch (result.type) {
      case "invoice": return <InvoiceResult data={result} />;
      case "carte_grise": return <CarteGriseResult data={result} />;
      case "id_card": return <IdCardResult data={result} />;
      case "passport": return <PassportResult data={result} />;
      default: return <pre className="text-xs overflow-auto">{JSON.stringify(result, null, 2)}</pre>;
    }
  };

  const canCreateDocument = result && result.type === "invoice";

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-scanner-title">Scanner OCR</h1>
        <p className="text-muted-foreground mt-1">Numérisez et extrayez les données de vos documents</p>
      </div>

      <Tabs defaultValue="scanner">
        <TabsList>
          <TabsTrigger value="scanner" data-testid="tab-scanner">
            <ScanLine className="h-4 w-4 mr-2" />
            Scanner
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <History className="h-4 w-4 mr-2" />
            Historique
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-4">
          <ScanHistoryTab />
        </TabsContent>

        <TabsContent value="scanner" className="mt-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Type de document</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={documentType} onValueChange={(v) => setDocumentType(v as DocumentType)}>
                <SelectTrigger data-testid="select-document-type">
                  <SelectValue placeholder="Sélectionner un type" />
                </SelectTrigger>
                <SelectContent>
                  {documentTypes.map((dt) => (
                    <SelectItem key={dt.value} value={dt.value} data-testid={`option-${dt.value}`}>
                      <span className="flex items-center gap-2">
                        <dt.icon className="h-4 w-4" />
                        {dt.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {currentDocType && (
                <p className="text-xs text-muted-foreground mt-2">{currentDocType.description}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Document</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedFile ? (
                <label
                  className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-md p-8 cursor-pointer hover-elevate transition-colors"
                  data-testid="label-file-upload"
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-sm font-medium">Cliquez pour importer</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG (max 10 Mo)</p>
                  </div>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff,.bmp"
                    onChange={handleFileChange}
                    className="hidden"
                    data-testid="input-file-upload"
                  />
                </label>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate" data-testid="text-file-name">{selectedFile.name}</span>
                    </div>
                    <Button size="icon" variant="ghost" onClick={handleClear} data-testid="button-clear-file">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {preview && (
                    <div className="rounded-md overflow-hidden border border-border">
                      <img src={preview} alt="Aperçu" className="w-full max-h-64 object-contain bg-muted" data-testid="img-preview" />
                    </div>
                  )}
                  <Button
                    onClick={handleScan}
                    disabled={scanMutation.isPending}
                    className="w-full"
                    data-testid="button-scan"
                  >
                    {scanMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Analyse en cours...
                      </>
                    ) : (
                      <>
                        <ScanLine className="h-4 w-4 mr-2" />
                        Scanner le document
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="min-h-[300px]">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                Résultats
                {result && (
                  <Badge variant="secondary">{currentDocType?.label || result.type}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {scanMutation.isPending ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Analyse du document en cours...</p>
                </div>
              ) : result ? (
                renderResult()
              ) : (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                  <ScanLine className="h-8 w-8" />
                  <p className="text-sm">Importez un document et lancez le scan pour voir les résultats</p>
                </div>
              )}
            </CardContent>
          </Card>

          {canCreateDocument && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Créer depuis le scan</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  Utilisez les données extraites pour créer un document pré-rempli.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={() => setCreateMode("quote")}
                    data-testid="button-create-quote-from-ocr"
                  >
                    <FileCheck className="h-4 w-4 mr-2" />
                    Créer un Devis
                  </Button>
                  <Button
                    onClick={() => setCreateMode("invoice")}
                    data-testid="button-create-invoice-from-ocr"
                  >
                    <Receipt className="h-4 w-4 mr-2" />
                    Créer une Facture
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setCreateMode("credit_note")}
                    data-testid="button-create-credit-note-from-ocr"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Créer un Avoir
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setCreateMode("expense")}
                    data-testid="button-create-expense-from-ocr"
                  >
                    <Wallet className="h-4 w-4 mr-2" />
                    Créer une Dépense
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

        </TabsContent>
      </Tabs>

      {createMode && result && (
        <OcrCreateDialog
          open={!!createMode}
          onOpenChange={(open) => { if (!open) setCreateMode(null); }}
          mode={createMode}
          ocrData={result}
          scanId={scanId}
        />
      )}
    </div>
  );
}