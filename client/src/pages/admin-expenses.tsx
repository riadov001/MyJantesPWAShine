import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Pencil,
  Trash2,
  Receipt,
  Filter,
  X,
  FolderOpen,
  Settings2,
  ScanLine,
} from "lucide-react";
import type { Expense, ExpenseCategory } from "@shared/schema";

const formatCurrency = (value: number | string) =>
  Number(value).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

const formatDate = (date: string | Date) =>
  new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

const paymentMethodLabels: Record<string, string> = {
  cash: "Espèces",
  wire_transfer: "Virement",
  card: "Carte",
  check: "Chèque",
  direct_debit: "Prélèvement",
};

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  pending: { label: "En attente", variant: "secondary" },
  paid: { label: "Payée", variant: "default" },
  cancelled: { label: "Annulée", variant: "destructive" },
};

export default function AdminExpenses() {
  const { isAuthenticated, isAdmin } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [expenseDialog, setExpenseDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);

  const [form, setForm] = useState({
    vendor: "",
    description: "",
    date: new Date().toISOString().slice(0, 10),
    amountHT: "",
    taxRate: "20.00",
    paymentMethod: "wire_transfer",
    status: "paid",
    categoryId: "",
    notes: "",
  });

  const [categoryForm, setCategoryForm] = useState({
    name: "",
    code: "",
    description: "",
    defaultTaxRate: "20.00",
  });

  const { data: expenses = [], isLoading } = useQuery<Expense[]>({
    queryKey: ["/api/admin/expenses"],
    enabled: isAuthenticated && isAdmin,
  });

  const { data: categories = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ["/api/admin/expense-categories"],
    enabled: isAuthenticated && isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/expenses", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      setExpenseDialog(false);
      resetForm();
      toast({ title: "Dépense créée" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/admin/expenses/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      setExpenseDialog(false);
      setEditingExpense(null);
      resetForm();
      toast({ title: "Dépense mise à jour" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/expenses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      setDeleteDialog(null);
      toast({ title: "Dépense supprimée" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const createCategoryMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/expense-categories", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expense-categories"] });
      setCategoryDialog(false);
      setCategoryForm({ name: "", code: "", description: "", defaultTaxRate: "20.00" });
      toast({ title: "Catégorie créée" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setForm({
      vendor: "",
      description: "",
      date: new Date().toISOString().slice(0, 10),
      amountHT: "",
      taxRate: "20.00",
      paymentMethod: "wire_transfer",
      status: "paid",
      categoryId: "",
      notes: "",
    });
  };

  const openCreate = () => {
    setEditingExpense(null);
    resetForm();
    setExpenseDialog(true);
  };

  const openEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setForm({
      vendor: expense.vendor,
      description: expense.description || "",
      date: new Date(expense.date).toISOString().slice(0, 10),
      amountHT: String(expense.amountHT),
      taxRate: String(expense.taxRate),
      paymentMethod: expense.paymentMethod,
      status: expense.status,
      categoryId: expense.categoryId || "",
      notes: expense.notes || "",
    });
    setExpenseDialog(true);
  };

  const handleSubmit = () => {
    const ht = parseFloat(form.amountHT);
    const rate = parseFloat(form.taxRate);
    if (isNaN(ht) || ht <= 0) {
      toast({ title: "Erreur", description: "Montant HT invalide", variant: "destructive" });
      return;
    }
    if (!form.vendor.trim()) {
      toast({ title: "Erreur", description: "Fournisseur requis", variant: "destructive" });
      return;
    }
    if (!form.date) {
      toast({ title: "Erreur", description: "Date invalide", variant: "destructive" });
      return;
    }
    const taxAmount = ht * rate / 100;
    const ttc = ht + taxAmount;

    const [year, month, day] = form.date.split("-").map(Number);
    const safeDate = new Date(year, month - 1, day, 12, 0, 0);

    const payload = {
      vendor: form.vendor.trim(),
      description: form.description || undefined,
      date: safeDate.toISOString(),
      amountHT: ht.toFixed(2),
      taxRate: rate.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      amountTTC: ttc.toFixed(2),
      paymentMethod: form.paymentMethod,
      status: form.status,
      categoryId: form.categoryId || null,
      notes: form.notes || undefined,
    };

    if (editingExpense) {
      updateMutation.mutate({ id: editingExpense.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const filteredExpenses = expenses.filter(e => {
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (categoryFilter !== "all" && e.categoryId !== categoryFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        e.vendor.toLowerCase().includes(s) ||
        e.expenseNumber.toLowerCase().includes(s) ||
        (e.description && e.description.toLowerCase().includes(s))
      );
    }
    return true;
  });

  const totalHT = filteredExpenses.reduce((sum, e) => sum + Number(e.amountHT), 0);

  if (!isAuthenticated || !isAdmin) return null;

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="page-expenses">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Receipt className="h-6 w-6 text-primary shrink-0" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Dépenses</h1>
            <p className="text-sm text-muted-foreground">{filteredExpenses.length} dépense(s) — Total HT : {formatCurrency(totalHT)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/admin/scanner">
            <Button variant="outline" data-testid="button-ocr-scanner">
              <ScanLine className="h-4 w-4 mr-2" />
              Scanner OCR
            </Button>
          </Link>
          <Button variant="outline" onClick={() => setCategoryDialog(true)} data-testid="button-manage-categories">
            <Settings2 className="h-4 w-4 mr-2" />
            Catégories
          </Button>
          <Button onClick={openCreate} data-testid="button-create-expense">
            <Plus className="h-4 w-4 mr-2" />
            Nouvelle dépense
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher fournisseur, numéro..."
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
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="paid">Payée</SelectItem>
            <SelectItem value="cancelled">Annulée</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-category-filter">
            <FolderOpen className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes catégories</SelectItem>
            {categories.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : filteredExpenses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Aucune dépense trouvée</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredExpenses.map(expense => {
            const cat = categories.find(c => c.id === expense.categoryId);
            const st = statusLabels[expense.status] || statusLabels.pending;
            return (
              <Card key={expense.id} className="hover-elevate" data-testid={`card-expense-${expense.id}`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium" data-testid={`text-vendor-${expense.id}`}>{expense.vendor}</span>
                        <Badge variant="secondary" className="text-xs" data-testid={`badge-number-${expense.id}`}>{expense.expenseNumber}</Badge>
                        <Badge variant={st.variant} data-testid={`badge-status-${expense.id}`}>{st.label}</Badge>
                        {cat && <Badge variant="outline" data-testid={`badge-category-${expense.id}`}>{cat.name}</Badge>}
                      </div>
                      {expense.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{expense.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span>{formatDate(expense.date)}</span>
                        <span>{paymentMethodLabels[expense.paymentMethod] || expense.paymentMethod}</span>
                        <span>TVA {expense.taxRate}%</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="font-bold" data-testid={`text-amount-${expense.id}`}>{formatCurrency(expense.amountTTC)}</div>
                        <div className="text-xs text-muted-foreground">HT : {formatCurrency(expense.amountHT)}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" onClick={() => openEdit(expense)} data-testid={`button-edit-${expense.id}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Modifier</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" onClick={() => setDeleteDialog(expense.id)} data-testid={`button-delete-${expense.id}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Supprimer</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={expenseDialog} onOpenChange={setExpenseDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingExpense ? "Modifier la dépense" : "Nouvelle dépense"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Fournisseur *</Label>
              <Input value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} data-testid="input-vendor" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date *</Label>
                <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} data-testid="input-date" />
              </div>
              <div>
                <Label>Catégorie</Label>
                <Select value={form.categoryId || "none"} onValueChange={v => setForm({ ...form, categoryId: v === "none" ? "" : v })}>
                  <SelectTrigger data-testid="select-category">
                    <SelectValue placeholder="Aucune" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune</SelectItem>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Montant HT *</Label>
                <Input type="number" step="0.01" value={form.amountHT} onChange={e => setForm({ ...form, amountHT: e.target.value })} data-testid="input-amount-ht" />
              </div>
              <div>
                <Label>Taux TVA (%)</Label>
                <Select value={form.taxRate} onValueChange={v => setForm({ ...form, taxRate: v })}>
                  <SelectTrigger data-testid="select-tax-rate">
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
            {form.amountHT && (
              <div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span>HT</span>
                  <span>{formatCurrency(parseFloat(form.amountHT) || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>TVA ({form.taxRate}%)</span>
                  <span>{formatCurrency((parseFloat(form.amountHT) || 0) * parseFloat(form.taxRate) / 100)}</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-1">
                  <span>TTC</span>
                  <span>{formatCurrency((parseFloat(form.amountHT) || 0) * (1 + parseFloat(form.taxRate) / 100))}</span>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Mode de paiement</Label>
                <Select value={form.paymentMethod} onValueChange={v => setForm({ ...form, paymentMethod: v })}>
                  <SelectTrigger data-testid="select-payment-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wire_transfer">Virement</SelectItem>
                    <SelectItem value="card">Carte</SelectItem>
                    <SelectItem value="cash">Espèces</SelectItem>
                    <SelectItem value="check">Chèque</SelectItem>
                    <SelectItem value="direct_debit">Prélèvement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Statut</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger data-testid="select-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">Payée</SelectItem>
                    <SelectItem value="pending">En attente</SelectItem>
                    <SelectItem value="cancelled">Annulée</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} data-testid="input-description" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} data-testid="input-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseDialog(false)}>Annuler</Button>
            <Button onClick={handleSubmit} disabled={!form.vendor || !form.amountHT || createMutation.isPending || updateMutation.isPending} data-testid="button-submit-expense">
              {editingExpense ? "Mettre à jour" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDialog} onOpenChange={setCategoryDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gérer les catégories</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {categories.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50">
                    <div>
                      <span className="font-medium text-sm">{cat.name}</span>
                      {cat.code && <span className="text-xs text-muted-foreground ml-2">({cat.code})</span>}
                    </div>
                    <span className="text-xs text-muted-foreground">TVA {cat.defaultTaxRate}%</span>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t pt-3 space-y-3">
              <p className="text-sm font-medium">Ajouter une catégorie</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Nom *</Label>
                  <Input value={categoryForm.name} onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })} data-testid="input-category-name" />
                </div>
                <div>
                  <Label className="text-xs">Code</Label>
                  <Input value={categoryForm.code} onChange={e => setCategoryForm({ ...categoryForm, code: e.target.value })} data-testid="input-category-code" />
                </div>
              </div>
              <Button
                onClick={() => createCategoryMutation.mutate(categoryForm)}
                disabled={!categoryForm.name || createCategoryMutation.isPending}
                className="w-full"
                data-testid="button-create-category"
              >
                Ajouter
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Cette action est irréversible. La dépense sera définitivement supprimée.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Annuler</Button>
            <Button variant="destructive" onClick={() => deleteDialog && deleteMutation.mutate(deleteDialog)} disabled={deleteMutation.isPending} data-testid="button-confirm-delete">
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
