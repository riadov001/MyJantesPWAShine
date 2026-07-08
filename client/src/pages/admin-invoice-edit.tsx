import { useEffect, useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Save, Mail, Loader2, Mic, Upload, Image, X, ZoomIn, Download } from "lucide-react";
import { VoiceDictationDialog } from "@/components/voice-dictation-dialog";
import { ImageZoomDialog } from "@/components/image-zoom-dialog";
import { VehicleFields, type VehicleData } from "@/components/vehicle-fields";
import type { Invoice, InvoiceItem, User } from "@shared/schema";

interface InvoiceMedia {
  id: string;
  invoiceId: string;
  fileType: string;
  filePath: string;
  fileName: string;
  fileSize: number | null;
  createdAt: string | null;
}

export default function AdminInvoiceEdit() {
  const [, params] = useRoute("/admin/invoices/:id/edit");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated, isAdmin, isSuperAdmin } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const invoiceId = params?.id || "";

  // Fetch invoice data
  const { data: invoice, isLoading: invoiceLoading } = useQuery<Invoice>({
    queryKey: [`/api/admin/invoices/${invoiceId}`],
    enabled: isAuthenticated && isAdmin && !!invoiceId,
  });

  // Fetch invoice items
  const { data: items = [], isLoading: itemsLoading } = useQuery<InvoiceItem[]>({
    queryKey: [`/api/admin/invoices/${invoiceId}/items`],
    enabled: isAuthenticated && isAdmin && !!invoiceId,
  });

  // Fetch invoice media
  const { data: media = [], isLoading: mediaLoading } = useQuery<InvoiceMedia[]>({
    queryKey: [`/api/admin/invoices/${invoiceId}/media`],
    enabled: isAuthenticated && isAdmin && !!invoiceId,
  });

  const [isUploading, setIsUploading] = useState(false);
  const [zoomImage, setZoomImage] = useState<{ src: string; alt: string } | null>(null);

  // Fetch all users to find client for voice dictation
  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ['/api/admin/users'],
    enabled: isAuthenticated && isAdmin,
  });

  // Find client from users list
  const client = useMemo(() => {
    if (!invoice?.clientId || !allUsers.length) return null;
    return allUsers.find(u => u.id === invoice.clientId) || null;
  }, [invoice?.clientId, allUsers]);

  // Voice dictation dialog state
  const [showVoiceDictation, setShowVoiceDictation] = useState(false);

  // Local state for form
  const [formData, setFormData] = useState({
    invoiceNumber: "",
    status: "pending" as "draft" | "pending" | "sent" | "paid" | "overdue" | "cancelled",
    paymentMethod: "wire_transfer" as string,
    dueDate: "",
    notes: "",
  });

  const [vehicleData, setVehicleData] = useState<VehicleData>({
    vehicleRegistration: "",
    vehicleMake: "",
    vehicleModel: "",
    vehicleVin: "",
    vehicleFuelType: "",
    vehicleFiscalPower: "",
    vehicleFirstRegDate: "",
    vehicleColor: "",
  });

  const [localItems, setLocalItems] = useState<Array<Partial<InvoiceItem>>>([]);
  const { data: services = [] } = useQuery<any[]>({
    queryKey: ["/api/services"],
    enabled: isAuthenticated,
  });

  // Initialize form with invoice data
  useEffect(() => {
    if (invoice) {
      setFormData({
        invoiceNumber: invoice.invoiceNumber || "",
        status: invoice.status || "pending",
        paymentMethod: invoice.paymentMethod || "wire_transfer",
        dueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().split('T')[0] : "",
        notes: invoice.notes || "",
      });
      setVehicleData({
        vehicleRegistration: (invoice as any).vehicleRegistration ?? "",
        vehicleMake: (invoice as any).vehicleMake ?? "",
        vehicleModel: (invoice as any).vehicleModel ?? "",
        vehicleVin: (invoice as any).vehicleVin ?? "",
        vehicleFuelType: (invoice as any).vehicleFuelType ?? "",
        vehicleFiscalPower: (invoice as any).vehicleFiscalPower ?? "",
        vehicleFirstRegDate: (invoice as any).vehicleFirstRegDate ?? "",
        vehicleColor: (invoice as any).vehicleColor ?? "",
      });
    }
  }, [invoice]);

  // Initialize items
  useEffect(() => {
    if (items.length > 0) {
      setLocalItems(items);
    }
  }, [items]);

  // Update invoice mutation
  const updateInvoiceMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("PATCH", `/api/admin/invoices/${invoiceId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/invoices/${invoiceId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invoices"] });
      toast({
        title: "Succès",
        description: "Facture mise à jour",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Create item mutation
  const createItemMutation = useMutation({
    mutationFn: async (item: Partial<InvoiceItem>) => {
      return await apiRequest("POST", `/api/admin/invoices/${invoiceId}/items`, item);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/invoices/${invoiceId}/items`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invoices"] });
    },
  });

  // Update item mutation
  const updateItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InvoiceItem> }) => {
      return await apiRequest("PATCH", `/api/admin/invoice-items/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/invoices/${invoiceId}/items`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invoices"] });
    },
  });

  // Delete item mutation
  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/invoice-items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/invoices/${invoiceId}/items`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invoices"] });
      toast({
        title: "Succès",
        description: "Ligne supprimée",
      });
    },
  });

  // Delete media mutation
  const deleteMediaMutation = useMutation({
    mutationFn: async (mediaId: string) => {
      return await apiRequest("DELETE", `/api/admin/invoice-media/${mediaId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/invoices/${invoiceId}/media`] });
      toast({
        title: "Succès",
        description: "Photo supprimée",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete invoice mutation (superadmin only)
  const deleteInvoiceMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/admin/invoices/${invoiceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invoices"] });
      toast({
        title: "Succès",
        description: "Facture supprimée définitivement",
      });
      setLocation("/admin/invoices");
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      toast({
        title: "Photo obligatoire",
        description: "Veuillez ajouter au moins une photo pour enregistrer la facture.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(`/api/admin/invoices/${invoiceId}/media`, {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || "Erreur lors de l'upload");
        }
      }

      queryClient.invalidateQueries({ queryKey: [`/api/admin/invoices/${invoiceId}/media`] });
      toast({
        title: "Succès",
        description: `${files.length} photo(s) ajoutée(s)`,
      });
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleAddItem = () => {
    setLocalItems([
      ...localItems,
      {
        description: "",
        quantity: "1",
        unitPriceExcludingTax: "0",
        totalExcludingTax: "0",
        taxRate: "20",
        taxAmount: "0",
        totalIncludingTax: "0",
      },
    ]);
  };

  const handleItemChange = (index: number, field: string, value: string) => {
    const newItems = [...localItems];
    newItems[index] = { ...newItems[index], [field]: value };

    // Recalculate amounts
    const item = newItems[index];
    const qty = parseFloat(item.quantity || "1");
    const unitPrice = parseFloat(item.unitPriceExcludingTax || "0");
    const taxRate = parseFloat(item.taxRate || "20");

    const totalHT = qty * unitPrice;
    const taxAmount = (totalHT * taxRate) / 100;
    const totalTTC = totalHT + taxAmount;

    newItems[index] = {
      ...item,
      totalExcludingTax: totalHT.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      totalIncludingTax: totalTTC.toFixed(2),
    };

    setLocalItems(newItems);
  };

  const handleSaveItem = async (index: number) => {
    const item = localItems[index];
    
    if (!item.description || !item.quantity || !item.unitPriceExcludingTax) {
      toast({
        title: "Erreur",
        description: "Veuillez remplir tous les champs requis",
        variant: "destructive",
      });
      return;
    }

    if (item.id) {
      // Update existing item
      await updateItemMutation.mutateAsync({ id: item.id, data: item });
    } else {
      // Create new item
      await createItemMutation.mutateAsync({ ...item, invoiceId });
    }

    toast({
      title: "Succès",
      description: "Ligne enregistrée",
    });
  };

  const handleDeleteItem = async (index: number) => {
    const item = localItems[index];
    
    if (item.id) {
      await deleteItemMutation.mutateAsync(item.id);
    }
    
    const newItems = localItems.filter((_, i) => i !== index);
    setLocalItems(newItems);
  };

  const handleSaveInvoice = async () => {
    if (media.length === 0) {
      toast({
        title: "Photo obligatoire",
        description: "Veuillez ajouter au moins une photo avant d'enregistrer la facture.",
        variant: "destructive",
      });
      return;
    }
    await updateInvoiceMutation.mutateAsync({
      ...formData,
      ...vehicleData,
      dueDate: formData.dueDate ? new Date(formData.dueDate) : null,
    });
  };

  // Send email mutation
  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/admin/invoices/${invoiceId}/send-email`, {});
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: "Facture envoyée par email au client",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!isAuthenticated || !isAdmin) {
    return null;
  }

  if (invoiceLoading || itemsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  const totalHT = localItems.reduce((sum, item) => sum + parseFloat(item.totalExcludingTax || "0"), 0);
  const totalTVA = localItems.reduce((sum, item) => sum + parseFloat(item.taxAmount || "0"), 0);
  const totalTTC = totalHT + totalTVA;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/admin/invoices")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-3xl font-bold">Éditer la Facture</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informations Générales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="invoiceNumber">Numéro de Facture</Label>
              <Input
                id="invoiceNumber"
                value={formData.invoiceNumber}
                onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                data-testid="input-invoice-number"
              />
            </div>

            <div>
              <Label htmlFor="status">Statut</Label>
              <Select value={formData.status} onValueChange={(value: any) => setFormData({ ...formData, status: value })}>
                <SelectTrigger id="status" data-testid="select-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Brouillon</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="sent">Envoyée</SelectItem>
                  <SelectItem value="paid">Payée</SelectItem>
                  <SelectItem value="overdue">En retard</SelectItem>
                  <SelectItem value="cancelled">Annulée</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="paymentMethod">Mode de Paiement</Label>
              <Select value={formData.paymentMethod} onValueChange={(value) => setFormData({ ...formData, paymentMethod: value })}>
                <SelectTrigger id="paymentMethod" data-testid="select-payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wire_transfer">Virement bancaire</SelectItem>
                  <SelectItem value="card">Carte bancaire</SelectItem>
                  <SelectItem value="cash">Espèces</SelectItem>
                  <SelectItem value="stripe">Stripe</SelectItem>
                  <SelectItem value="klarna">Klarna</SelectItem>
                  <SelectItem value="alma">Alma</SelectItem>
                  <SelectItem value="sepa">Prélèvement SEPA</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="dueDate">Date d'Échéance</Label>
              <Input
                id="dueDate"
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                data-testid="input-due-date"
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                data-testid="textarea-notes"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Button onClick={handleSaveInvoice} className="w-full" data-testid="button-save-invoice">
                <Save className="mr-2 h-4 w-4" />
                Enregistrer la Facture
              </Button>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => sendEmailMutation.mutate()}
                disabled={sendEmailMutation.isPending}
                data-testid="button-send-invoice-email"
              >
                {sendEmailMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                Envoyer par email
              </Button>
              <Button 
                variant="secondary" 
                className="w-full"
                onClick={() => setShowVoiceDictation(true)}
                disabled={!client?.email}
                data-testid="button-voice-dictation"
              >
                <Mic className="mr-2 h-4 w-4" />
                Dicter le récapitulatif
              </Button>
              {isSuperAdmin && (
                <>
                  {showDeleteConfirm ? (
                    <div className="flex flex-col gap-2">
                      <span className="text-sm text-destructive text-center">Confirmer la suppression ?</span>
                      <div className="flex gap-2">
                        <Button 
                          variant="destructive"
                          size="sm"
                          className="flex-1"
                          onClick={() => deleteInvoiceMutation.mutate()}
                          disabled={deleteInvoiceMutation.isPending}
                          data-testid="button-confirm-delete-invoice"
                        >
                          {deleteInvoiceMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : "Oui"}
                        </Button>
                        <Button 
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setShowDeleteConfirm(false)}
                          data-testid="button-cancel-delete-invoice"
                        >
                          Non
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button 
                      variant="destructive"
                      className="w-full"
                      onClick={() => setShowDeleteConfirm(true)}
                      data-testid="button-delete-invoice"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Supprimer la facture
                    </Button>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Totaux</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total HT :</span>
              <span className="font-medium">{totalHT.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total TVA :</span>
              <span className="font-medium">{totalTVA.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t">
              <span>Total TTC :</span>
              <span>{totalTTC.toFixed(2)} €</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <VehicleFields value={vehicleData} onChange={setVehicleData} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Lignes de Facture</CardTitle>
          <Button onClick={handleAddItem} size="sm" data-testid="button-add-item">
            <Plus className="mr-2 h-4 w-4" />
            Ajouter une Ligne
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {localItems.map((item, index) => (
              <Card key={index} className="p-4">
                <div className="grid gap-4 md:grid-cols-6">
                  <div className="md:col-span-2">
                    <Label htmlFor={`description-${index}`}>Description</Label>
                    <div className="flex gap-2">
                      <Select
                        onValueChange={(value) => {
                          const service = services.find(s => s.id === value);
                          if (service) {
                            handleItemChange(index, "description", service.name);
                            handleItemChange(index, "unitPriceExcludingTax", service.basePrice?.toString() || "0");
                          }
                        }}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Services..." />
                        </SelectTrigger>
                        <SelectContent>
                          {services.map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        id={`description-${index}`}
                        value={item.description || ""}
                        onChange={(e) => handleItemChange(index, "description", e.target.value)}
                        placeholder="Description du produit/service"
                        data-testid={`input-description-${index}`}
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor={`quantity-${index}`}>Quantité</Label>
                    <Input
                      id={`quantity-${index}`}
                      type="number"
                      step="0.01"
                      value={item.quantity || "1"}
                      onChange={(e) => handleItemChange(index, "quantity", e.target.value)}
                      data-testid={`input-quantity-${index}`}
                    />
                  </div>

                  <div>
                    <Label htmlFor={`unitPrice-${index}`}>Prix Unit. HT</Label>
                    <Input
                      id={`unitPrice-${index}`}
                      type="number"
                      step="0.01"
                      value={item.unitPriceExcludingTax || "0"}
                      onChange={(e) => handleItemChange(index, "unitPriceExcludingTax", e.target.value)}
                      data-testid={`input-unit-price-${index}`}
                    />
                  </div>

                  <div>
                    <Label htmlFor={`taxRate-${index}`}>TVA (%)</Label>
                    <Input
                      id={`taxRate-${index}`}
                      type="number"
                      step="0.01"
                      value={item.taxRate || "20"}
                      onChange={(e) => handleItemChange(index, "taxRate", e.target.value)}
                      data-testid={`input-tax-rate-${index}`}
                    />
                  </div>

                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label>Total TTC</Label>
                      <div className="text-sm font-medium pt-2">{parseFloat(item.totalIncludingTax || "0").toFixed(2)} €</div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSaveItem(index)}
                    data-testid={`button-save-item-${index}`}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    Enregistrer
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteItem(index)}
                    data-testid={`button-delete-item-${index}`}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Supprimer
                  </Button>
                </div>
              </Card>
            ))}

            {localItems.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <p>Aucune ligne pour le moment. Cliquez sur "Ajouter une Ligne" pour commencer.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Image className="h-5 w-5" />
              Photos
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <input
                type="file"
                id="invoice-photo-upload"
                multiple
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
              <Button
                size="sm"
                onClick={() => document.getElementById("invoice-photo-upload")?.click()}
                disabled={isUploading}
                data-testid="button-add-photo"
              >
                {isUploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {isUploading ? "Upload en cours..." : "Ajouter des photos"}
              </Button>
              {media.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const link = document.createElement("a");
                    link.href = `/api/admin/invoices/${invoiceId}/media/download-zip`;
                    link.download = "photos.zip";
                    link.click();
                  }}
                  data-testid="button-download-zip"
                >
                  <Download className="mr-2 h-4 w-4" />
                  ZIP
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {mediaLoading ? (
            <div className="text-center py-4 text-muted-foreground">Chargement...</div>
          ) : media.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Aucune photo associée à cette facture
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {media.map((item) => (
                <div key={item.id} className="relative group">
                  <img
                    src={item.filePath}
                    alt={item.fileName}
                    className="w-full h-32 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setZoomImage({ src: item.filePath, alt: item.fileName })}
                    data-testid={`image-media-${item.id}`}
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.onerror = null;
                      img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='128' viewBox='0 0 200 128'%3E%3Crect width='200' height='128' fill='%23f3f4f6'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%239ca3af' font-size='12' font-family='sans-serif'%3EImage non disponible%3C/text%3E%3C/svg%3E";
                    }}
                  />
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute bottom-10 left-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                    onClick={() => setZoomImage({ src: item.filePath, alt: item.fileName })}
                    data-testid={`button-zoom-media-${item.id}`}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                    onClick={() => deleteMediaMutation.mutate(item.id)}
                    disabled={deleteMediaMutation.isPending}
                    data-testid={`button-delete-media-${item.id}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <div className="mt-1 text-xs text-muted-foreground truncate">
                    {item.fileName}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <VoiceDictationDialog
        open={showVoiceDictation}
        onOpenChange={setShowVoiceDictation}
        clientEmail={client?.email || ""}
        clientName={`${client?.firstName || ""} ${client?.lastName || ""}`.trim() || "Client"}
        prestations={localItems.filter(item => item.description).map(item => item.description || "")}
        technicalDetails={formData.notes || ""}
        attachments={["Facture PDF"]}
        documentType="invoice"
        documentNumber={formData.invoiceNumber}
        documentId={invoice?.id || ""}
      />

      <ImageZoomDialog
        isOpen={!!zoomImage}
        onClose={() => setZoomImage(null)}
        imageSrc={zoomImage?.src || ""}
        imageAlt={zoomImage?.alt}
      />
    </div>
  );
}
