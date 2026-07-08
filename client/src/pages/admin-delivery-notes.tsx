import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Plus, Download, Trash2, Eye, Truck, FileText } from "lucide-react";
import type { Invoice, User, DeliveryNote } from "@shared/schema";

type DeliveryNoteWithDetails = DeliveryNote & {
  client?: User;
  invoices?: Invoice[];
};

const statusLabels: Record<string, { label: string; className: string }> = {
  draft: { label: "Brouillon", className: "bg-muted text-muted-foreground" },
  finalized: { label: "Finalisé", className: "bg-secondary text-secondary-foreground" },
  paid: { label: "Payé", className: "bg-primary text-primary-foreground" },
};

export default function AdminDeliveryNotes() {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<DeliveryNoteWithDetails | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [showPrices, setShowPrices] = useState(true);

  const { data: deliveryNotes, isLoading } = useQuery<DeliveryNoteWithDetails[]>({
    queryKey: ['/api/admin/delivery-notes'],
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ['/api/admin/users'],
  });

  const { data: clientInvoices, isLoading: isLoadingInvoices } = useQuery<Invoice[]>({
    queryKey: ['/api/admin/clients', selectedClientId, 'invoices'],
    enabled: !!selectedClientId,
    queryFn: async () => {
      const res = await fetch(`/api/admin/clients/${selectedClientId}/invoices`);
      if (!res.ok) throw new Error("Failed to fetch invoices");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { clientId: string; invoiceIds: string[]; notes: string; showPrices: boolean }) => {
      const res = await apiRequest("POST", "/api/admin/delivery-notes", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/delivery-notes'] });
      setCreateDialogOpen(false);
      resetForm();
      toast({ title: "Bon de livraison créé avec succès" });
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/delivery-notes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/delivery-notes'] });
      toast({ title: "Bon de livraison supprimé" });
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, showPrices }: { id: string; status?: string; showPrices?: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/delivery-notes/${id}`, { status, showPrices });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/delivery-notes'] });
      toast({ title: "Mise à jour réussie" });
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setSelectedClientId("");
    setSelectedInvoiceIds([]);
    setNotes("");
    setShowPrices(true);
  };

  const handleCreate = () => {
    if (!selectedClientId || selectedInvoiceIds.length === 0) {
      toast({ title: "Erreur", description: "Sélectionnez un client et au moins une facture", variant: "destructive" });
      return;
    }
    createMutation.mutate({ clientId: selectedClientId, invoiceIds: selectedInvoiceIds, notes, showPrices });
  };

  const handleViewDetails = async (noteId: string) => {
    try {
      const res = await fetch(`/api/admin/delivery-notes/${noteId}`);
      if (!res.ok) throw new Error("Failed to fetch details");
      const data = await res.json();
      setSelectedNote(data);
      setViewDialogOpen(true);
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible de charger les détails", variant: "destructive" });
    }
  };

  const handleDownloadPDF = async (noteId: string) => {
    try {
      const res = await fetch(`/api/admin/delivery-notes/${noteId}`);
      if (!res.ok) throw new Error("Failed to fetch details");
      const noteData = await res.json();

      const settingsRes = await fetch("/api/admin/settings");
      const settings = settingsRes.ok ? await settingsRes.json() : null;

      const { generateDeliveryNotePDF } = await import("@/lib/pdf-generator");
      await generateDeliveryNotePDF(noteData, noteData.client, noteData.invoices, settings);
      toast({ title: "PDF téléchargé" });
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible de générer le PDF", variant: "destructive" });
    }
  };

  const toggleInvoice = (invoiceId: string) => {
    setSelectedInvoiceIds(prev =>
      prev.includes(invoiceId)
        ? prev.filter(id => id !== invoiceId)
        : [...prev, invoiceId]
    );
  };

  const clients = users?.filter(u => u.role === "client" || u.role === "client_professionnel") || [];

  const getClientName = (client?: User) => {
    if (!client) return "Client inconnu";
    if (client.companyName) return client.companyName;
    if (client.firstName && client.lastName) return `${client.firstName} ${client.lastName}`;
    return client.email;
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Bons de Livraison</h1>
          <p className="text-muted-foreground">Regroupez les factures par client pour le paiement en fin de mois</p>
        </div>
        <Button onClick={() => { resetForm(); setCreateDialogOpen(true); }} data-testid="button-create-delivery-note">
          <Plus className="h-4 w-4 mr-2" />
          Nouveau bon
        </Button>
      </div>

      {(!deliveryNotes || deliveryNotes.length === 0) ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Truck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Aucun bon de livraison</p>
            <p className="text-sm text-muted-foreground mt-1">Créez un bon de livraison pour regrouper les factures d'un client</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {deliveryNotes.map((note) => (
            <Card key={note.id} data-testid={`card-delivery-note-${note.id}`}>
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <CardTitle className="text-lg">{note.deliveryNoteNumber}</CardTitle>
                  <Badge className={statusLabels[note.status]?.className || ""}>
                    {statusLabels[note.status]?.label || note.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => handleViewDetails(note.id)} data-testid={`button-view-${note.id}`}>
                    <Eye className="h-4 w-4" />
                  </Button>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`show-prices-${note.id}`}
                              checked={note.showPrices !== false}
                              onCheckedChange={(checked) => {
                                updateStatusMutation.mutate({
                                  id: note.id,
                                  status: note.status,
                                  showPrices: checked === true,
                                } as any);
                              }}
                            />
                            <Label htmlFor={`show-prices-${note.id}`} className="text-xs">Prix sur PDF</Label>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadPDF(note.id)}
                            className="flex items-center gap-2"
                            data-testid={`button-download-${note.id}`}
                          >
                            <Download className="h-4 w-4" />
                            PDF
                          </Button>
                  {note.status === "draft" && (
                    <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(note.id)} data-testid={`button-delete-${note.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Client: </span>
                    <span className="font-medium" data-testid={`text-client-${note.id}`}>{getClientName(note.client)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Factures: </span>
                    <span className="font-medium" data-testid={`text-invoice-count-${note.id}`}>{note.invoices?.length || 0}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total TTC: </span>
                    <span className="font-medium" data-testid={`text-total-${note.id}`}>{parseFloat(note.totalAmount || '0').toFixed(2)} &euro;</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="text-xs text-muted-foreground">
                    Créé le {note.createdAt ? format(new Date(note.createdAt), "dd/MM/yyyy", { locale: fr }) : "N/A"}
                  </span>
                  {note.status === "draft" && (
                    <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: note.id, status: "finalized" })} data-testid={`button-finalize-${note.id}`}>
                      Finaliser
                    </Button>
                  )}
                  {note.status === "finalized" && (
                    <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: note.id, status: "paid" })} data-testid={`button-mark-paid-${note.id}`}>
                      Marquer payé
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nouveau Bon de Livraison</DialogTitle>
            <DialogDescription>Sélectionnez un client puis les factures à regrouper</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Client</Label>
              <Select value={selectedClientId} onValueChange={(val) => { setSelectedClientId(val); setSelectedInvoiceIds([]); }}>
                <SelectTrigger data-testid="select-client">
                  <SelectValue placeholder="Sélectionner un client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id} data-testid={`option-client-${client.id}`}>
                      {getClientName(client)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedClientId && (
              <div>
                <Label>Factures du client</Label>
                {isLoadingInvoices ? (
                  <div className="space-y-2 mt-2">
                    {[1, 2].map(i => <Skeleton key={i} className="h-12" />)}
                  </div>
                ) : clientInvoices && clientInvoices.length > 0 ? (
                  <div className="space-y-2 mt-2 max-h-60 overflow-y-auto">
                    {clientInvoices.map((invoice) => (
                      <div
                        key={invoice.id}
                        className="flex items-center gap-3 p-3 rounded-md border border-border"
                        data-testid={`invoice-option-${invoice.id}`}
                      >
                        <Checkbox
                          checked={selectedInvoiceIds.includes(invoice.id)}
                          onCheckedChange={() => toggleInvoice(invoice.id)}
                          data-testid={`checkbox-invoice-${invoice.id}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-medium text-sm">{invoice.invoiceNumber}</span>
                            <Badge className="text-xs" variant="outline">
                              {parseFloat(invoice.amount).toFixed(2)} &euro;
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {invoice.createdAt ? format(new Date(invoice.createdAt), "dd/MM/yyyy", { locale: fr }) : ""}
                            {invoice.status === "paid" ? " - Payée" : invoice.status === "pending" ? " - En attente" : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mt-2">Aucune facture trouvée pour ce client</p>
                )}
                {selectedInvoiceIds.length > 0 && (
                  <p className="text-sm text-muted-foreground mt-2" data-testid="text-selected-count">
                    {selectedInvoiceIds.length} facture(s) sélectionnée(s)
                  </p>
                )}
              </div>
            )}

            <div>
              <Label>Notes (optionnel)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes additionnelles..."
                className="mt-1"
                data-testid="input-notes"
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="showPrices"
                checked={showPrices}
                onCheckedChange={(val) => setShowPrices(!!val)}
                data-testid="checkbox-show-prices"
              />
              <Label htmlFor="showPrices">Afficher les prix sur le bon de livraison</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} data-testid="button-cancel">
              Annuler
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!selectedClientId || selectedInvoiceIds.length === 0 || createMutation.isPending}
              data-testid="button-submit"
            >
              {createMutation.isPending ? "Création..." : "Créer le bon"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Détails - {selectedNote?.deliveryNoteNumber}</DialogTitle>
            <DialogDescription>
              Client: {getClientName(selectedNote?.client)}
            </DialogDescription>
          </DialogHeader>
          {selectedNote && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-md border border-border">
                  <p className="text-xs text-muted-foreground">Total HT</p>
                  <p className="font-medium" data-testid="text-detail-ht">{parseFloat(selectedNote.totalHT || '0').toFixed(2)} &euro;</p>
                </div>
                <div className="p-3 rounded-md border border-border">
                  <p className="text-xs text-muted-foreground">TVA</p>
                  <p className="font-medium" data-testid="text-detail-tva">{parseFloat(selectedNote.totalTVA || '0').toFixed(2)} &euro;</p>
                </div>
                <div className="p-3 rounded-md border border-border">
                  <p className="text-xs text-muted-foreground">Total TTC</p>
                  <p className="font-medium" data-testid="text-detail-ttc">{parseFloat(selectedNote.totalAmount || '0').toFixed(2)} &euro;</p>
                </div>
                <div className="p-3 rounded-md border border-border">
                  <p className="text-xs text-muted-foreground">Afficher prix</p>
                  <p className="font-medium">{selectedNote.showPrices ? "Oui" : "Non"}</p>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-2">Factures incluses ({selectedNote.invoices?.length || 0})</h3>
                <div className="space-y-3">
                  {(selectedNote.invoices as any[])?.map((invoice: any) => (
                    <Card key={invoice.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                          <span className="font-medium">{invoice.invoiceNumber}</span>
                          <span className="text-sm">{parseFloat(invoice.amount).toFixed(2)} &euro;</span>
                        </div>
                        {invoice.items && invoice.items.length > 0 && (
                          <div className="text-sm space-y-1">
                            {invoice.items.map((item: any) => (
                              <div key={item.id} className="flex justify-between text-muted-foreground">
                                <span>{item.description} (Qté: {item.quantity})</span>
                                {selectedNote.showPrices && (
                                  <span>{parseFloat(item.totalIncludingTax || '0').toFixed(2)} &euro;</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {invoice.media && invoice.media.length > 0 && (
                          <div className="mt-3">
                            <p className="text-xs text-muted-foreground mb-1">Photos ({invoice.media.length})</p>
                            <div className="flex flex-wrap gap-2">
                              {invoice.media.filter((m: any) => m.fileType === "image").slice(0, 6).map((media: any) => (
                                <div key={media.id} className="w-16 h-16 rounded-md overflow-hidden border border-border">
                                  <img
                                    src={media.filePath}
                                    alt={media.fileName}
                                    className="w-full h-full object-cover"
                                    data-testid={`img-media-${media.id}`}
                                    onError={(e) => {
                                      const img = e.target as HTMLImageElement;
                                      img.onerror = null;
                                      img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23f3f4f6'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%239ca3af' font-size='8' font-family='sans-serif'%3EN/A%3C/text%3E%3C/svg%3E";
                                    }}
                                  />
                                </div>
                              ))}
                              {invoice.media.filter((m: any) => m.fileType === "image").length > 6 && (
                                <div className="w-16 h-16 rounded-md border border-border flex items-center justify-center text-xs text-muted-foreground">
                                  +{invoice.media.filter((m: any) => m.fileType === "image").length - 6}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {selectedNote.notes && (
                <div>
                  <h3 className="font-medium mb-1">Notes</h3>
                  <p className="text-sm text-muted-foreground">{selectedNote.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Fermer
            </Button>
            <Button onClick={() => selectedNote && handleDownloadPDF(selectedNote.id)} data-testid="button-download-pdf-detail">
              <Download className="h-4 w-4 mr-2" />
              Télécharger PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
