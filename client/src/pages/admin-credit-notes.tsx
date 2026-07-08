import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Plus,
  Search,
  FileText,
  Filter,
  CheckCircle2,
  RotateCcw,
  X,
  Trash2,
  ScanLine,
} from "lucide-react";
import type { Invoice, CreditNote } from "@shared/schema";

const formatCurrency = (value: number | string) =>
  Number(value).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

const formatDate = (date: string | Date) =>
  new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Brouillon", variant: "secondary" },
  issued: { label: "Émis", variant: "default" },
  refunded: { label: "Remboursé", variant: "outline" },
  cancelled: { label: "Annulé", variant: "destructive" },
};

interface CreditNoteItem {
  description: string;
  quantity: string;
  unitPriceHT: string;
  taxRate: string;
}

export default function AdminCreditNotes() {
  const { isAuthenticated, isAdmin } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createDialog, setCreateDialog] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<CreditNoteItem[]>([
    { description: "", quantity: "1", unitPriceHT: "", taxRate: "20.00" },
  ]);

  const { data: creditNotes = [], isLoading } = useQuery<CreditNote[]>({
    queryKey: ["/api/admin/credit-notes"],
    enabled: isAuthenticated && isAdmin,
  });

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["/api/admin/invoices"],
    enabled: isAuthenticated && isAdmin,
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAuthenticated && isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/credit-notes", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/credit-notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invoices"] });
      closeDialog();
      toast({ title: "Avoir créé" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/admin/credit-notes/${id}`, {
        status,
        ...(status === "issued" ? { issuedAt: new Date().toISOString() } : {}),
        ...(status === "refunded" ? { refundedAt: new Date().toISOString() } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/credit-notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invoices"] });
      toast({ title: "Statut mis à jour" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const closeDialog = () => {
    setCreateDialog(false);
    setSelectedInvoiceId("");
    setReason("");
    setNotes("");
    setItems([{ description: "", quantity: "1", unitPriceHT: "", taxRate: "20.00" }]);
  };

  const addItem = () => {
    setItems([...items, { description: "", quantity: "1", unitPriceHT: "", taxRate: "20.00" }]);
  };

  const updateItem = (index: number, field: keyof CreditNoteItem, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) setItems(items.filter((_, i) => i !== index));
  };

  const computedItems = items.map(item => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unitPriceHT) || 0;
    const rate = parseFloat(item.taxRate) || 0;
    const totalHT = qty * price;
    const tax = totalHT * rate / 100;
    return { ...item, totalHT, tax, totalTTC: totalHT + tax };
  });

  const totalHT = computedItems.reduce((s, i) => s + i.totalHT, 0);
  const totalTax = computedItems.reduce((s, i) => s + i.tax, 0);
  const totalTTC = totalHT + totalTax;

  const handleCreate = () => {
    const invoice = invoices.find(i => i.id === selectedInvoiceId);
    if (!invoice || !reason) return;

    const avgTaxRate = totalHT > 0 ? (totalTax / totalHT * 100) : 20;

    createMutation.mutate({
      invoiceId: selectedInvoiceId,
      clientId: invoice.clientId,
      reason,
      totalHT: totalHT.toFixed(2),
      taxRate: avgTaxRate.toFixed(2),
      taxAmount: totalTax.toFixed(2),
      totalTTC: totalTTC.toFixed(2),
      notes: notes || undefined,
      items: computedItems.filter(i => i.description && i.totalHT > 0).map(i => ({
        description: i.description,
        quantity: i.quantity,
        unitPriceHT: parseFloat(i.unitPriceHT).toFixed(2),
        totalHT: i.totalHT.toFixed(2),
        taxRate: i.taxRate,
        taxAmount: i.tax.toFixed(2),
        totalTTC: i.totalTTC.toFixed(2),
      })),
    });
  };

  const filteredNotes = creditNotes.filter(cn => {
    if (statusFilter !== "all" && cn.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return cn.creditNoteNumber.toLowerCase().includes(s) || cn.reason.toLowerCase().includes(s);
    }
    return true;
  });

  const getClientName = (clientId: string) => {
    const u = users.find((u: any) => u.id === clientId);
    return u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email : clientId;
  };

  const getInvoiceNumber = (invoiceId: string) => {
    const inv = invoices.find(i => i.id === invoiceId);
    return inv?.invoiceNumber || invoiceId;
  };

  if (!isAuthenticated || !isAdmin) return null;

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="page-credit-notes">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary shrink-0" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Avoirs</h1>
            <p className="text-sm text-muted-foreground">{filteredNotes.length} avoir(s)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/scanner">
            <Button variant="outline" data-testid="button-ocr-scanner">
              <ScanLine className="h-4 w-4 mr-2" />
              Scanner OCR
            </Button>
          </Link>
          <Button onClick={() => setCreateDialog(true)} data-testid="button-create-credit-note">
            <Plus className="h-4 w-4 mr-2" />
            Nouvel avoir
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher numéro, motif..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="draft">Brouillon</SelectItem>
            <SelectItem value="issued">Émis</SelectItem>
            <SelectItem value="refunded">Remboursé</SelectItem>
            <SelectItem value="cancelled">Annulé</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : filteredNotes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Aucun avoir trouvé</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredNotes.map(cn => {
            const st = statusConfig[cn.status] || statusConfig.draft;
            return (
              <Card key={cn.id} className="hover-elevate" data-testid={`card-credit-note-${cn.id}`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium" data-testid={`text-number-${cn.id}`}>{cn.creditNoteNumber}</span>
                        <Badge variant={st.variant} data-testid={`badge-status-${cn.id}`}>{st.label}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{cn.reason}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span>Facture : {getInvoiceNumber(cn.invoiceId)}</span>
                        <span>Client : {getClientName(cn.clientId)}</span>
                        <span>{formatDate(cn.createdAt!)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="font-bold text-red-600" data-testid={`text-amount-${cn.id}`}>-{formatCurrency(cn.totalTTC)}</div>
                        <div className="text-xs text-muted-foreground">HT : -{formatCurrency(cn.totalHT)}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        {cn.status === "draft" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => updateStatusMutation.mutate({ id: cn.id, status: "issued" })}
                                data-testid={`button-issue-${cn.id}`}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Émettre</TooltipContent>
                          </Tooltip>
                        )}
                        {cn.status === "issued" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => updateStatusMutation.mutate({ id: cn.id, status: "refunded" })}
                                data-testid={`button-refund-${cn.id}`}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Marquer remboursé</TooltipContent>
                          </Tooltip>
                        )}
                        {(cn.status === "draft" || cn.status === "issued") && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => updateStatusMutation.mutate({ id: cn.id, status: "cancelled" })}
                                data-testid={`button-cancel-${cn.id}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Annuler</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={createDialog} onOpenChange={v => { if (!v) closeDialog(); else setCreateDialog(true); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Nouvel avoir</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Facture associée *</Label>
              <Select value={selectedInvoiceId} onValueChange={setSelectedInvoiceId}>
                <SelectTrigger data-testid="select-invoice">
                  <SelectValue placeholder="Sélectionner une facture" />
                </SelectTrigger>
                <SelectContent>
                  {invoices.filter(i => i.status === "paid").map(inv => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {inv.invoiceNumber} — {formatCurrency(inv.amount)} — {getClientName(inv.clientId)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Motif de l'avoir *</Label>
              <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} data-testid="input-reason" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Lignes de l'avoir</Label>
                <Button variant="outline" size="sm" onClick={addItem} data-testid="button-add-line">
                  <Plus className="h-3 w-3 mr-1" />
                  Ligne
                </Button>
              </div>
              <div className="space-y-3">
                {items.map((item, idx) => (
                  <div key={idx} className="p-3 rounded-md bg-muted/50 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <Input
                          placeholder="Description"
                          value={item.description}
                          onChange={e => updateItem(idx, "description", e.target.value)}
                          data-testid={`input-item-desc-${idx}`}
                        />
                      </div>
                      {items.length > 1 && (
                        <Button size="icon" variant="ghost" onClick={() => removeItem(idx)} data-testid={`button-remove-line-${idx}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">Quantité</Label>
                        <Input
                          type="number"
                          step="1"
                          min="1"
                          value={item.quantity}
                          onChange={e => updateItem(idx, "quantity", e.target.value)}
                          data-testid={`input-item-qty-${idx}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Prix unit. HT</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.unitPriceHT}
                          onChange={e => updateItem(idx, "unitPriceHT", e.target.value)}
                          data-testid={`input-item-price-${idx}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">TVA %</Label>
                        <Select value={item.taxRate} onValueChange={v => updateItem(idx, "taxRate", v)}>
                          <SelectTrigger data-testid={`select-item-tax-${idx}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0.00">0%</SelectItem>
                            <SelectItem value="5.50">5,5%</SelectItem>
                            <SelectItem value="10.00">10%</SelectItem>
                            <SelectItem value="20.00">20%</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {computedItems[idx]?.totalHT > 0 && (
                      <div className="text-xs text-right text-muted-foreground">
                        Ligne : {formatCurrency(computedItems[idx].totalHT)} HT / {formatCurrency(computedItems[idx].totalTTC)} TTC
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {totalHT > 0 && (
              <div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Total HT</span>
                  <span>{formatCurrency(totalHT)}</span>
                </div>
                <div className="flex justify-between">
                  <span>TVA</span>
                  <span>{formatCurrency(totalTax)}</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-1 text-red-600">
                  <span>Total TTC (avoir)</span>
                  <span>-{formatCurrency(totalTTC)}</span>
                </div>
              </div>
            )}

            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} data-testid="input-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Annuler</Button>
            <Button
              onClick={handleCreate}
              disabled={!selectedInvoiceId || !reason || totalHT <= 0 || createMutation.isPending}
              data-testid="button-submit-credit-note"
            >
              Créer l'avoir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
