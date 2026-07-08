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
import type { Quote, QuoteItem, User } from "@shared/schema";

interface QuoteMedia {
  id: string;
  quoteId: string;
  fileType: string;
  filePath: string;
  fileName: string;
  fileSize: number | null;
  createdAt: string | null;
}

export default function AdminQuoteEdit() {
  const [, params] = useRoute("/admin/quotes/:id/edit");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated, isAdmin, isSuperAdmin } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const quoteId = params?.id || "";

  // Fetch quote data
  const { data: quote, isLoading: quoteLoading } = useQuery<Quote>({
    queryKey: [`/api/admin/quotes/${quoteId}`],
    enabled: isAuthenticated && isAdmin && !!quoteId,
  });

  // Fetch quote items
  const { data: items = [], isLoading: itemsLoading } = useQuery<QuoteItem[]>({
    queryKey: [`/api/admin/quotes/${quoteId}/items`],
    enabled: isAuthenticated && isAdmin && !!quoteId,
  });

  // Fetch quote media
  const { data: media = [], isLoading: mediaLoading } = useQuery<QuoteMedia[]>({
    queryKey: [`/api/admin/quotes/${quoteId}/media`],
    enabled: isAuthenticated && isAdmin && !!quoteId,
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
    if (!quote?.clientId || !allUsers.length) return null;
    return allUsers.find(u => u.id === quote.clientId) || null;
  }, [quote?.clientId, allUsers]);

  // Voice dictation dialog state
  const [showVoiceDictation, setShowVoiceDictation] = useState(false);

  // Local state for form
  const [formData, setFormData] = useState({
    status: "pending" as "pending" | "approved" | "accepted" | "rejected" | "completed",
    validUntil: "",
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

  const canEdit = true; // Permettre la modification même si accepté/refusé

  const [localItems, setLocalItems] = useState<Array<Partial<QuoteItem>>>([]);
  const { data: services = [] } = useQuery<any[]>({
    queryKey: ["/api/services"],
    enabled: isAuthenticated,
  });

  // Initialize form with quote data
  useEffect(() => {
    if (quote) {
      setFormData({
        status: quote.status || "pending",
        validUntil: quote.validUntil ? new Date(quote.validUntil).toISOString().split('T')[0] : "",
        notes: quote.notes || "",
      });
      setVehicleData({
        vehicleRegistration: quote.vehicleRegistration ?? "",
        vehicleMake: quote.vehicleMake ?? "",
        vehicleModel: quote.vehicleModel ?? "",
        vehicleVin: quote.vehicleVin ?? "",
        vehicleFuelType: quote.vehicleFuelType ?? "",
        vehicleFiscalPower: quote.vehicleFiscalPower ?? "",
        vehicleFirstRegDate: quote.vehicleFirstRegDate ?? "",
        vehicleColor: quote.vehicleColor ?? "",
      });
    }
  }, [quote]);

  // Initialize items
  useEffect(() => {
    if (items.length > 0) {
      setLocalItems(items);
    }
  }, [items]);

  // Update quote mutation
  const updateQuoteMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("PATCH", `/api/admin/quotes/${quoteId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/quotes/${quoteId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quotes"] });
      toast({
        title: "Succès",
        description: "Devis mis à jour",
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
    mutationFn: async (item: Partial<QuoteItem>) => {
      return await apiRequest("POST", `/api/admin/quotes/${quoteId}/items`, item);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/quotes/${quoteId}/items`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quotes"] });
    },
  });

  // Update item mutation
  const updateItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<QuoteItem> }) => {
      return await apiRequest("PATCH", `/api/admin/quote-items/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/quotes/${quoteId}/items`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quotes"] });
    },
  });

  // Delete item mutation
  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/quote-items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/quotes/${quoteId}/items`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quotes"] });
      toast({
        title: "Succès",
        description: "Ligne supprimée",
      });
    },
  });

  // Delete media mutation
  const deleteMediaMutation = useMutation({
    mutationFn: async (mediaId: string) => {
      return await apiRequest("DELETE", `/api/admin/quote-media/${mediaId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/quotes/${quoteId}/media`] });
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

  // Delete quote mutation (superadmin only)
  const deleteQuoteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/admin/quotes/${quoteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quotes"] });
      toast({
        title: "Succès",
        description: "Devis supprimé définitivement",
      });
      setLocation("/admin/quotes");
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
        description: "Veuillez ajouter au moins une photo pour enregistrer le devis.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(`/api/admin/quotes/${quoteId}/media`, {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || "Erreur lors de l'upload");
        }
      }

      queryClient.invalidateQueries({ queryKey: [`/api/admin/quotes/${quoteId}/media`] });
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
      await createItemMutation.mutateAsync({ ...item, quoteId });
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

  const handleSaveQuote = async () => {
    if (media.length === 0) {
      toast({
        title: "Photo obligatoire",
        description: "Veuillez ajouter au moins une photo avant d'enregistrer le devis.",
        variant: "destructive",
      });
      return;
    }
    await updateQuoteMutation.mutateAsync({
      ...formData,
      ...vehicleData,
      validUntil: formData.validUntil ? formData.validUntil : null,
    });
  };

  // Send email mutation
  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/admin/quotes/${quoteId}/send-email`, {});
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: "Devis envoyé par email au client",
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

  if (quoteLoading || itemsLoading) {
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
          onClick={() => setLocation("/admin/quotes")}
          data-testid="button-back-to-quotes"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour aux devis
        </Button>
      </div>

      {quote && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-lg font-semibold" data-testid="text-quote-reference">
                  {quote.reference || `Devis #${quote.id.slice(0, 8)}`}
                </p>
                <p className="text-sm text-muted-foreground" data-testid="text-quote-client">
                  Client : {client ? `${client.firstName || ""} ${client.lastName || ""}`.trim() || client.email : "N/A"}
                  {client?.companyName && ` — ${client.companyName}`}
                </p>
                {client?.email && (
                  <p className="text-xs text-muted-foreground">{client.email}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Service principal</p>
                <p className="font-medium" data-testid="text-quote-service">
                  {services.find((s: any) => s.id === quote.serviceId)?.name || "N/A"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Modifier le devis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Statut</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value as any })}
              >
                <SelectTrigger data-testid="select-quote-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="approved">Approuvé</SelectItem>
                  <SelectItem value="accepted">Accepté</SelectItem>
                  <SelectItem value="rejected">Refusé</SelectItem>
                  <SelectItem value="completed">Terminé</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="validUntil">Valable jusqu'au</Label>
              <Input
                id="validUntil"
                type="date"
                value={formData.validUntil}
                onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                data-testid="input-valid-until"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              data-testid="textarea-quote-notes"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button 
              onClick={handleSaveQuote} 
              disabled={updateQuoteMutation.isPending}
              data-testid="button-save-quote"
            >
              {updateQuoteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {updateQuoteMutation.isPending ? "Enregistrement..." : "Enregistrer le devis"}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => sendEmailMutation.mutate()}
              disabled={sendEmailMutation.isPending}
              data-testid="button-send-quote-email"
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
                  <div className="flex gap-2 items-center">
                    <span className="text-sm text-destructive">Confirmer la suppression ?</span>
                    <Button 
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteQuoteMutation.mutate()}
                      disabled={deleteQuoteMutation.isPending}
                      data-testid="button-confirm-delete-quote"
                    >
                      {deleteQuoteMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : "Oui, supprimer"}
                    </Button>
                    <Button 
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDeleteConfirm(false)}
                      data-testid="button-cancel-delete-quote"
                    >
                      Annuler
                    </Button>
                  </div>
                ) : (
                  <Button 
                    variant="destructive"
                    onClick={() => setShowDeleteConfirm(true)}
                    data-testid="button-delete-quote"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Supprimer le devis
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <VehicleFields value={vehicleData} onChange={setVehicleData} />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lignes du devis</CardTitle>
            <Button onClick={handleAddItem} size="sm" data-testid="button-add-quote-item">
              <Plus className="mr-2 h-4 w-4" />
              Ajouter une ligne
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {localItems.map((item, index) => (
              <Card key={index} className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                  <div className="md:col-span-2">
                    <Label>Description</Label>
                    <div className="flex gap-2">
                      <Select
                        value={services.find((s: any) => s.name === item.description)?.id || ""}
                        onValueChange={(value) => {
                          const service = services.find((s: any) => s.id === value);
                          if (service) {
                            const newItems = [...localItems];
                            newItems[index] = { ...newItems[index], description: service.name, unitPriceExcludingTax: service.basePrice?.toString() || "0" };
                            const qty = parseFloat(newItems[index].quantity || "1");
                            const unitPrice = parseFloat(service.basePrice?.toString() || "0");
                            const taxRate = parseFloat(newItems[index].taxRate || "20");
                            const totalHT = qty * unitPrice;
                            const taxAmount = (totalHT * taxRate) / 100;
                            newItems[index].totalExcludingTax = totalHT.toFixed(2);
                            newItems[index].taxAmount = taxAmount.toFixed(2);
                            newItems[index].totalIncludingTax = (totalHT + taxAmount).toFixed(2);
                            setLocalItems(newItems);
                          }
                        }}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Services...">{item.description ? (services.find((s: any) => s.name === item.description)?.name || "Services...") : "Services..."}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {services.map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={item.description || ""}
                        onChange={(e) => handleItemChange(index, "description", e.target.value)}
                        placeholder="Description de l'article"
                        data-testid={`input-item-description-${index}`}
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Quantité</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.quantity || ""}
                      onChange={(e) => handleItemChange(index, "quantity", e.target.value)}
                      data-testid={`input-item-quantity-${index}`}
                    />
                  </div>

                  <div>
                    <Label>Prix HT unitaire</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.unitPriceExcludingTax || ""}
                      onChange={(e) => handleItemChange(index, "unitPriceExcludingTax", e.target.value)}
                      data-testid={`input-item-unit-price-${index}`}
                    />
                  </div>

                  <div>
                    <Label>TVA (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.taxRate || ""}
                      onChange={(e) => handleItemChange(index, "taxRate", e.target.value)}
                      data-testid={`input-item-tax-rate-${index}`}
                    />
                  </div>

                  <div className="flex items-end gap-2">
                    <Button
                      onClick={() => handleSaveItem(index)}
                      size="sm"
                      data-testid={`button-save-item-${index}`}
                      title={localItems[index].description || "Enregistrer"}
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => handleDeleteItem(index)}
                      size="sm"
                      variant="destructive"
                      data-testid={`button-delete-item-${index}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total HT:</span>{" "}
                    <span className="font-medium" data-testid={`text-item-total-ht-${index}`}>
                      {parseFloat(item.totalExcludingTax || "0").toFixed(2)} €
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">TVA:</span>{" "}
                    <span className="font-medium" data-testid={`text-item-tax-amount-${index}`}>
                      {parseFloat(item.taxAmount || "0").toFixed(2)} €
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total TTC:</span>{" "}
                    <span className="font-medium" data-testid={`text-item-total-ttc-${index}`}>
                      {parseFloat(item.totalIncludingTax || "0").toFixed(2)} €
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="mt-6 p-4 bg-muted rounded-lg">
            <div className="grid grid-cols-3 gap-4 text-lg font-semibold">
              <div>
                <span className="text-muted-foreground">Total HT:</span>{" "}
                <span data-testid="text-total-ht">{totalHT.toFixed(2)} €</span>
              </div>
              <div>
                <span className="text-muted-foreground">TVA:</span>{" "}
                <span data-testid="text-total-tva">{totalTVA.toFixed(2)} €</span>
              </div>
              <div>
                <span className="text-muted-foreground">Total TTC:</span>{" "}
                <span data-testid="text-total-ttc">{totalTTC.toFixed(2)} €</span>
              </div>
            </div>
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
                id="photo-upload"
                multiple
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
              <Button
                size="sm"
                onClick={() => document.getElementById("photo-upload")?.click()}
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
                    link.href = `/api/admin/quotes/${quoteId}/media/download-zip`;
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
              Aucune photo associée à ce devis
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
                      img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23f1f5f9'/%3E%3Ctext x='50' y='45' text-anchor='middle' fill='%2394a3b8' font-size='10' font-family='sans-serif'%3EPhoto%3C/text%3E%3Ctext x='50' y='60' text-anchor='middle' fill='%2394a3b8' font-size='10' font-family='sans-serif'%3Eindisponible%3C/text%3E%3C/svg%3E";
                      img.style.cursor = "default";
                      img.onclick = null;
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
        attachments={["Devis PDF"]}
        documentType="quote"
        documentNumber={quote?.reference || quote?.id || ""}
        documentId={quote?.id || ""}
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
