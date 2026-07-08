import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Plus, 
  Search, 
  Download, 
  Eye, 
  Mail, 
  Pencil, 
  ExternalLink, 
  FileCode, 
  CircleX, 
  Loader2,
  FileText,
  Send,
  EyeOff,
  MailX,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { formatDistanceToNow, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { StatusBadge } from "@/components/status-badge";
import { SendEmailDialog } from "@/components/send-email-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import type { Invoice, Quote, User } from "@shared/schema";
import { VehicleFields, type VehicleData } from "@/components/vehicle-fields";

export default function AdminInvoices() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAdmin, isSuperAdmin } = useAuth();

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/admin/invoices"],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: quotes = [] } = useQuery<Quote[]>({
    queryKey: ["/api/admin/quotes"],
  });

  const { data: servicesList = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/services"],
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [quoteSearchTerm, setQuoteSearchTerm] = useState("");
  const [quoteStatusFilter, setQuoteStatusFilter] = useState("approved");
  const [selectedQuoteId, setSelectedQuoteId] = useState("");
  const [invoiceDueDate, setInvoiceDueDate] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [fromQuotePaymentMethod, setFromQuotePaymentMethod] = useState("wire_transfer");
  const [selectedServiceId, setSelectedServiceId] = useState<string>("custom");
  const [customServiceName, setCustomServiceName] = useState("");
  const [invoiceMediaFiles, setInvoiceMediaFiles] = useState<string[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [isManualCustomer, setIsManualCustomer] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [invoiceItemsList, setInvoiceItemsList] = useState<{ description: string; quantity: string; unitPrice: string }[]>([
    { description: "", quantity: "1", unitPrice: "" }
  ]);
  const [invoiceWheelCount, setInvoiceWheelCount] = useState("4");
  const [invoiceDiameter, setInvoiceDiameter] = useState("");
  const [invoiceTaxRate, setInvoiceTaxRate] = useState("20");
  const [invoicePaymentMethod, setInvoicePaymentMethod] = useState("wire_transfer");
  const [directInvoiceVehicle, setDirectInvoiceVehicle] = useState<VehicleData>({
    vehicleRegistration: "",
    vehicleMake: "",
    vehicleModel: "",
    vehicleVin: "",
    vehicleFuelType: "",
    vehicleFiscalPower: "",
    vehicleFirstRegDate: "",
    vehicleColor: "",
  });

  const [createDirectInvoiceDialog, setCreateDirectInvoiceDialog] = useState(false);
  const [deleteInvoiceDialog, setDeleteInvoiceDialog] = useState<any>(null);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [selectedInvoiceForEmail, setSelectedInvoiceForEmail] = useState<any>(null);

  const deleteInvoiceMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/invoices/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Facture supprimée définitivement et notification envoyée." });
      setDeleteInvoiceDialog(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invoices"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erreur",
        description: error.message || "Échec de la suppression.",
        variant: "destructive",
      });
    },
  });

  const getClientName = (clientId: string | null | undefined) => {
    if (!clientId) return "Client inconnu";
    const client = users.find((u: any) => u.id === clientId);
    return client ? `${client.firstName || ""} ${client.lastName || ""}`.trim() || client.email : "Client inconnu";
  };

  const getServiceNameFromInvoice = (invoice: any) => {
    if (invoice.quoteId) {
      const quote = quotes.find((q: any) => q.id === invoice.quoteId);
      return quote ? "Service de jantes" : "Service";
    }
    return invoice.productDetails || "Service direct";
  };

  const filteredInvoices = invoices.filter((invoice: any) => {
    const clientName = getClientName(invoice.clientId).toLowerCase();
    const invoiceNum = (invoice.invoiceNumber || "").toLowerCase();
    const matchesSearch = clientName.includes(searchTerm.toLowerCase()) || 
                         invoiceNum.includes(searchTerm.toLowerCase()) ||
                         (invoice.productDetails || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || invoice.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const approvedQuotes = quotes.filter((quote: any) => {
    const matchesSearch = getClientName(quote.clientId).toLowerCase().includes(quoteSearchTerm.toLowerCase()) ||
                         (quote.reference || "").toLowerCase().includes(quoteSearchTerm.toLowerCase());
    const matchesStatus = quoteStatusFilter === "all" || quote.status === quoteStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateInvoiceFromQuote = useMutation({
    mutationFn: async (data: { quoteId: string, paymentMethod?: string, dueDate?: string, notes?: string, mediaFiles?: string[] }) => {
      const res = await apiRequest("POST", "/api/admin/invoices", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Facture créée avec succès" });
      setIsDialogOpen(false);
      setSelectedQuoteId("");
      setInvoiceDueDate("");
      setInvoiceNotes("");
      setFromQuotePaymentMethod("wire_transfer");
      setInvoiceMediaFiles([]);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invoices"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erreur de création",
        description: error.message || "Impossible de créer la facture depuis le devis",
        variant: "destructive",
      });
    },
  });

  const createDirectInvoiceMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/invoices/direct", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Facture directe créée avec succès" });
      setCreateDirectInvoiceDialog(false);
      setSelectedClientId("");
      setSelectedServiceId("custom");
      setCustomServiceName("");
      setInvoiceMediaFiles([]);
      setInvoiceNotes("");
      setDirectInvoiceVehicle({
        vehicleRegistration: "",
        vehicleMake: "",
        vehicleModel: "",
        vehicleVin: "",
        vehicleFuelType: "",
        vehicleFiscalPower: "",
        vehicleFirstRegDate: "",
        vehicleColor: "",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invoices"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erreur de création",
        description: error.message || "Impossible de créer la facture directe",
        variant: "destructive",
      });
    },
  });

  const handleDownloadPDF = async (invoice: any) => {
    try {
      const response = await fetch(`/api/invoices/${invoice.id}/pdf`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) throw new Error("Erreur lors de la récupération des données");
      const data = await response.json();
      
      const { generateInvoicePDF } = await import("@/lib/pdf-generator");
      const doc = await generateInvoicePDF(data.invoice, data.client, data.quote, data.service, data.items, data.settings);
      if (doc) {
        doc.save(`Facture_${invoice.invoiceNumber || invoice.id}.pdf`);
      }
    } catch (error) {
      console.error("PDF Download Error:", error);
      toast({ title: "Erreur", description: "Impossible de générer le PDF", variant: "destructive" });
    }
  };

  const handleDownloadFacturX = async (invoice: any) => {
    try {
      const response = await fetch(`/api/invoices/${invoice.id}/facturx`);
      if (!response.ok) throw new Error("Erreur de téléchargement");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Facture_FacturX_${invoice.invoiceNumber || invoice.id}.xml`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible de télécharger le Factur-X", variant: "destructive" });
    }
  };

  const handlePreviewPDF = async (invoice: any) => {
    try {
      const response = await fetch(`/api/invoices/${invoice.id}/pdf`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) throw new Error("Erreur lors de la récupération des données");
      const data = await response.json();
      
      const { generateInvoicePDF } = await import("@/lib/pdf-generator");
      const doc = await generateInvoicePDF(data.invoice, data.client, data.quote, data.service, data.items, data.settings, true);
      if (doc) {
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible de prévisualiser le PDF", variant: "destructive" });
    }
  };

  const handleViewOnline = async (invoiceId: string) => {
    try {
      const res = await apiRequest("POST", `/api/invoices/${invoiceId}/view-link`);
      const data = await res.json();
      window.open(data.viewUrl, '_blank');
    } catch (error: any) {
      toast({ title: "Erreur", description: "Impossible de générer le lien de la facture", variant: "destructive" });
    }
  };

  const handleOpenEmailDialog = (invoice: any) => {
    const client = users.find((u: any) => u.id === invoice.clientId);
    setSelectedInvoiceForEmail({ ...invoice, client });
    setEmailDialogOpen(true);
  };

  const handleSendEmail = async (data: any) => {
    try {
      await apiRequest("POST", `/api/admin/invoices/${selectedInvoiceForEmail.id}/send-email`, data);
      toast({ title: "Email envoyé avec succès" });
      setEmailDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invoices"] });
    } catch (error) {
      toast({ 
        title: "Erreur lors de l'envoi", 
        description: "Impossible d'envoyer l'email.",
        variant: "destructive" 
      });
    }
  };

  if (invoicesLoading || !isAdmin) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold">Gestion des Factures</h1>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button
            onClick={() => setIsDialogOpen(true)}
            variant="outline"
            className="w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Depuis Devis
          </Button>
          <Button
            onClick={() => setCreateDirectInvoiceDialog(true)}
            className="w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Créer une Facture
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Toutes les Factures</CardTitle>
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => {
                const params = new URLSearchParams();
                if (statusFilter !== "all") params.set("status", statusFilter);
                window.open(`/api/admin/export/invoices?${params.toString()}`, '_blank');
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              Exporter CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par client, n° facture, produits..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="paid">Payées</SelectItem>
                <SelectItem value="overdue">En retard</SelectItem>
                <SelectItem value="cancelled">Annulées</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredInvoices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>{invoices.length === 0 ? "Aucune facture pour le moment. Créez-en une pour commencer!" : "Aucune facture ne correspond à votre recherche"}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="hidden lg:table-header-group">
                  <TableRow>
                    <TableHead>Facture</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice: any) => (
                    <TableRow key={invoice.id} className="flex flex-col lg:table-row py-4 lg:py-0 border-b">
                      <TableCell className="lg:table-cell font-medium">
                        <div className="flex items-center justify-between lg:justify-start">
                          <span className="lg:hidden text-xs text-muted-foreground uppercase font-bold">Facture:</span>
                          <span>{invoice.invoiceNumber || (invoice.id ? invoice.id.slice(0, 8) : "—")}</span>
                        </div>
                      </TableCell>
                      <TableCell className="lg:table-cell">
                        <div className="flex items-center justify-between lg:justify-start">
                          <span className="lg:hidden text-xs text-muted-foreground uppercase font-bold">Client:</span>
                          <span>{getClientName(invoice.clientId)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="lg:table-cell">
                        <div className="flex items-center justify-between lg:justify-start">
                          <span className="lg:hidden text-xs text-muted-foreground uppercase font-bold">Service:</span>
                          <span>{getServiceNameFromInvoice(invoice)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="lg:table-cell font-bold text-primary">
                        <div className="flex items-center justify-between lg:justify-start">
                          <span className="lg:hidden text-xs text-muted-foreground uppercase font-bold">Montant:</span>
                          <span>{parseFloat(invoice.amount || "0").toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>
                        </div>
                      </TableCell>
                      <TableCell className="lg:table-cell text-muted-foreground">
                        <div className="flex items-center justify-between lg:justify-start">
                          <span className="lg:hidden text-xs text-muted-foreground uppercase font-bold">Date:</span>
                          <span>{invoice.createdAt ? formatDistanceToNow(new Date(invoice.createdAt), { addSuffix: true, locale: fr }) : "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="lg:table-cell">
                        <div className="flex items-center justify-between lg:justify-start">
                          <span className="lg:hidden text-xs text-muted-foreground uppercase font-bold">Statut:</span>
                          <StatusBadge status={invoice.status as any} />
                        </div>
                      </TableCell>
                      <TableCell className="lg:table-cell text-right">
                        <div className="flex items-center justify-end gap-1 mt-2 lg:mt-0 flex-wrap">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handlePreviewPDF(invoice)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Prévisualiser</TooltipContent>
                          </Tooltip>
                          
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenEmailDialog(invoice)}
                              >
                                <Mail className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Envoyer par email</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setLocation(`/admin/invoices/${invoice.id}/edit`)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Modifier</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDownloadPDF(invoice)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Télécharger PDF</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDownloadFacturX(invoice)}
                              >
                                <FileCode className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Factur-X</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setDeleteInvoiceDialog(invoice)}
                              >
                                <CircleX className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Supprimer définitivement</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteInvoiceDialog} onOpenChange={(open) => !open && setDeleteInvoiceDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suppression définitive</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer définitivement la facture <strong>{deleteInvoiceDialog?.invoiceNumber}</strong> ? 
              Cette action est irréversible, supprimera toutes les données associées, et enverra une notification d'alerte à l'administration.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteInvoiceDialog && deleteInvoiceMutation.mutate(deleteInvoiceDialog.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteInvoiceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Supprimer définitivement"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SendEmailDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        onSend={handleSendEmail}
        isPending={false}
        defaultRecipient={selectedInvoiceForEmail?.client?.email || ""}
        defaultSubject={`Facture ${selectedInvoiceForEmail?.invoiceNumber} - MY JANTES`}
        defaultMessage={`Bonjour ${selectedInvoiceForEmail?.client?.firstName},\n\nVeuillez trouver ci-joint votre facture ${selectedInvoiceForEmail?.invoiceNumber} pour un montant de ${selectedInvoiceForEmail?.amount} €.\n\nCordialement,\nL'équipe MY JANTES`}
        type="invoice"
        documentNumber={selectedInvoiceForEmail?.invoiceNumber || ""}
        amount={selectedInvoiceForEmail?.amount || "0"}
        clientId={selectedInvoiceForEmail?.client?.id}
        clientName={`${selectedInvoiceForEmail?.client?.firstName || ""} ${selectedInvoiceForEmail?.client?.lastName || ""}`}
        documentId={selectedInvoiceForEmail?.id}
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Créer une Facture depuis un Devis</DialogTitle>
            <DialogDescription>
              Sélectionnez un devis approuvé pour générer une facture automatiquement.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rechercher un devis</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Client ou Référence..." 
                    className="pl-8"
                    value={quoteSearchTerm}
                    onChange={(e) => setQuoteSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Statut du devis</Label>
                <Select value={quoteStatusFilter} onValueChange={setQuoteStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrer par statut" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les devis</SelectItem>
                    <SelectItem value="approved">Approuvés uniquement</SelectItem>
                    <SelectItem value="pending">En attente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Choisir le devis *</Label>
              <Select value={selectedQuoteId} onValueChange={setSelectedQuoteId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un devis" />
                </SelectTrigger>
                <SelectContent>
                  {approvedQuotes.length === 0 ? (
                    <div className="p-2 text-center text-sm text-muted-foreground">Aucun devis trouvé</div>
                  ) : (
                    approvedQuotes.map((quote: any) => (
                      <SelectItem key={quote.id} value={quote.id}>
                        {quote.reference || `Devis #${quote.id.slice(0, 8)}`} - {getClientName(quote.clientId)} ({quote.quoteAmount} €)
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
              <div className="space-y-2">
                <Label>Date d'échéance</Label>
                <Input 
                  type="date" 
                  value={invoiceDueDate} 
                  onChange={(e) => setInvoiceDueDate(e.target.value)} 
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Mode de Paiement</Label>
              <Select value={fromQuotePaymentMethod} onValueChange={setFromQuotePaymentMethod}>
                <SelectTrigger data-testid="select-from-quote-payment-method">
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

            <div className="space-y-2">
              <Label>Notes (optionnel)</Label>
              <Textarea 
                placeholder="Notes visibles sur la facture..." 
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Photos supplémentaires (optionnel)</Label>
              <p className="text-xs text-muted-foreground">Les photos du devis seront automatiquement copiées. Ajoutez des photos supplémentaires si nécessaire.</p>
              <Input
                type="file"
                multiple
                accept="image/*"
                data-testid="input-invoice-media"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  setInvoiceMediaFiles(files);
                }}
              />
              {invoiceMediaFiles.length > 0 && (
                <p className="text-sm text-muted-foreground">{invoiceMediaFiles.length} photo(s) supplémentaire(s) sélectionnée(s)</p>
              )}
            </div>

            <Button 
              className="w-full mt-4" 
              data-testid="button-create-invoice-from-quote"
              disabled={!selectedQuoteId || handleCreateInvoiceFromQuote.isPending || isUploading}
              onClick={async () => {
                setIsUploading(true);
                try {
                  const uploadedPaths: string[] = [];
                  for (const file of invoiceMediaFiles) {
                    const formData = new FormData();
                    formData.append("file", file);
                    const res = await fetch("/api/admin/upload", { method: "POST", body: formData });
                    if (res.ok) {
                      const data = await res.json();
                      uploadedPaths.push(data.filePath);
                    }
                  }
                  handleCreateInvoiceFromQuote.mutate({
                    quoteId: selectedQuoteId,
                    paymentMethod: fromQuotePaymentMethod || "wire_transfer",
                    dueDate: invoiceDueDate || undefined,
                    notes: invoiceNotes || undefined,
                    ...(uploadedPaths.length > 0 ? { mediaFiles: uploadedPaths } : {}),
                  });
                } finally {
                  setIsUploading(false);
                }
              }}
            >
              {isUploading || handleCreateInvoiceFromQuote.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Générer la Facture
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Direct Invoice Dialog */}
      <Dialog open={createDirectInvoiceDialog} onOpenChange={setCreateDirectInvoiceDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Créer une Facture Directe</DialogTitle>
            <DialogDescription>
              Générez une facture sans passer par un devis préalable.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4 max-h-[70vh] overflow-y-auto">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="manual-customer" 
                          checked={isManualCustomer} 
                          onCheckedChange={(checked) => setIsManualCustomer(!!checked)}
                        />
                        <Label htmlFor="manual-customer">Client non enregistré (saisie manuelle)</Label>
                      </div>

                      {isManualCustomer ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border p-3 rounded-md bg-muted/30">
                          <div className="space-y-2">
                            <Label>Nom / Entreprise *</Label>
                            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Ex: Jean Dupont" />
                          </div>
                          <div className="space-y-2">
                            <Label>Email</Label>
                            <Input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="email@exemple.com" />
                          </div>
                          <div className="space-y-2">
                            <Label>Téléphone</Label>
                            <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="06..." />
                          </div>
                          <div className="space-y-2">
                            <Label>Adresse</Label>
                            <Input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="123 rue..." />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label htmlFor="client">Client *</Label>
                          <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                            <SelectTrigger id="client" data-testid="select-direct-client">
                              <SelectValue placeholder="Sélectionner un client" />
                            </SelectTrigger>
                            <SelectContent>
                              {users.filter((u: any) => u.role === "client" || u.role === "client_professionnel").map((user: any) => (
                                <SelectItem key={user.id} value={user.id}>
                                  {user.firstName} {user.lastName} ({user.email})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label>Service</Label>
                        <Select value={selectedServiceId} onValueChange={(val) => {
                          setSelectedServiceId(val);
                          if (val !== "custom") {
                            const svc = servicesList.find((s: any) => s.id === val);
                            if (svc) {
                              setCustomServiceName(svc.name);
                              if (invoiceItemsList.length === 1 && !invoiceItemsList[0].description) {
                                setInvoiceItemsList([{
                                  description: svc.name,
                                  quantity: "1",
                                  unitPrice: svc.basePrice || ""
                                }]);
                              }
                            }
                          } else {
                            setCustomServiceName("");
                          }
                        }}>
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionner un service" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="custom">Saisie libre (service personnalisé)</SelectItem>
                            {servicesList.map((svc: any) => (
                              <SelectItem key={svc.id} value={svc.id}>
                                {svc.name} - {parseFloat(svc.basePrice || "0").toFixed(2)}€ HT
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {selectedServiceId === "custom" && (
                        <div className="space-y-2">
                          <Label>Nom du service personnalisé</Label>
                          <Input
                            placeholder="Ex: Réparation jante alliage"
                            value={customServiceName}
                            onChange={(e) => setCustomServiceName(e.target.value)}
                          />
                        </div>
                      )}

                      <div className="space-y-4 border-t pt-4">
                        <div className="flex items-center justify-between">
                          <Label className="text-base font-semibold">Lignes de facture</Label>
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm"
                            onClick={() => setInvoiceItemsList([...invoiceItemsList, { description: "", quantity: "1", unitPrice: "" }])}
                          >
                            <Plus className="h-4 w-4 mr-1" /> Ajouter une ligne
                          </Button>
                        </div>
                        
                        {invoiceItemsList.map((item, index) => (
                          <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border p-2 rounded-md">
                            <div className="md:col-span-6 space-y-1">
                              <Label className="text-xs">Description</Label>
                              <Input 
                                value={item.description} 
                                onChange={(e) => {
                                  const newList = [...invoiceItemsList];
                                  newList[index].description = e.target.value;
                                  setInvoiceItemsList(newList);
                                }}
                                placeholder="Service ou produit..."
                              />
                            </div>
                            <div className="md:col-span-2 space-y-1">
                              <Label className="text-xs">Qté</Label>
                              <Input 
                                type="number"
                                value={item.quantity} 
                                onChange={(e) => {
                                  const newList = [...invoiceItemsList];
                                  newList[index].quantity = e.target.value;
                                  setInvoiceItemsList(newList);
                                }}
                              />
                            </div>
                            <div className="md:col-span-3 space-y-1">
                              <Label className="text-xs">Prix Unitaire HT</Label>
                              <Input 
                                type="number"
                                value={item.unitPrice} 
                                onChange={(e) => {
                                  const newList = [...invoiceItemsList];
                                  newList[index].unitPrice = e.target.value;
                                  setInvoiceItemsList(newList);
                                }}
                                placeholder="0.00"
                              />
                            </div>
                            <div className="md:col-span-1">
                              <Button 
                                type="button" 
                                variant="ghost" 
                                size="icon"
                                className="text-destructive"
                                disabled={invoiceItemsList.length === 1}
                                onClick={() => setInvoiceItemsList(invoiceItemsList.filter((_, i) => i !== index))}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="payment-method">Mode de paiement</Label>
                <Select value={invoicePaymentMethod} onValueChange={setInvoicePaymentMethod}>
                  <SelectTrigger id="payment-method" data-testid="select-payment-method">
                    <SelectValue placeholder="Non spécifié" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="card">Carte Bancaire</SelectItem>
                    <SelectItem value="wire_transfer">Virement</SelectItem>
                    <SelectItem value="cash">Espèces</SelectItem>
                    <SelectItem value="stripe">Stripe</SelectItem>
                    <SelectItem value="sepa">SEPA</SelectItem>
                    <SelectItem value="klarna">Klarna</SelectItem>
                    <SelectItem value="alma">Alma</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax">Taux TVA (%)</Label>
                <Input 
                  id="tax" 
                  type="number" 
                  value={invoiceTaxRate} 
                  onChange={(e) => setInvoiceTaxRate(e.target.value)} 
                  data-testid="input-tax-rate"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="wheels">Nombre de jantes</Label>
                <Input 
                  id="wheels" 
                  type="number" 
                  min="1" 
                  max="4" 
                  value={invoiceWheelCount} 
                  onChange={(e) => setInvoiceWheelCount(e.target.value)} 
                  data-testid="input-wheel-count"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="diameter">Diamètre (pouces)</Label>
                <Input 
                  id="diameter" 
                  placeholder="Ex: 19" 
                  value={invoiceDiameter} 
                  onChange={(e) => setInvoiceDiameter(e.target.value)} 
                  data-testid="input-diameter"
                />
              </div>
            </div>

            <VehicleFields value={directInvoiceVehicle} onChange={setDirectInvoiceVehicle} />

            <div className="space-y-2">
              <Label htmlFor="direct-due-date">Date d'échéance</Label>
              <Input 
                id="direct-due-date" 
                type="date"
                value={invoiceDueDate} 
                onChange={(e) => setInvoiceDueDate(e.target.value)} 
                data-testid="input-due-date"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="direct-notes">Notes internes</Label>
              <Textarea 
                id="direct-notes" 
                placeholder="Notes non visibles sur la facture..." 
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
                data-testid="input-direct-notes"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Photos de l'intervention (optionnel)</Label>
              <Input
                type="file"
                multiple
                accept="image/*"
                data-testid="input-direct-media"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  setInvoiceMediaFiles(files);
                }}
              />
              {invoiceMediaFiles.length > 0 && (
                <p className="text-sm text-muted-foreground">{invoiceMediaFiles.length} photo(s) sélectionnée(s)</p>
              )}
            </div>
            
            <Button 
              className="w-full" 
              data-testid="button-create-direct-invoice"
              disabled={createDirectInvoiceMutation.isPending || isUploading || (!isManualCustomer && !selectedClientId) || (isManualCustomer && !customerName)}
              onClick={async () => {
                const serviceName = selectedServiceId !== "custom"
                  ? servicesList.find((s: any) => s.id === selectedServiceId)?.name || customServiceName
                  : customServiceName;

                if (!isManualCustomer && !selectedClientId) {
                  toast({ title: "Erreur", description: "Veuillez sélectionner un client ou saisir les informations manuellement", variant: "destructive" });
                  return;
                }
                if (isManualCustomer && !customerName) {
                  toast({ title: "Erreur", description: "Le nom du client est obligatoire pour une saisie manuelle", variant: "destructive" });
                  return;
                }
                if (invoiceItemsList.some(item => !item.description || !item.unitPrice)) {
                  toast({ title: "Erreur", description: "Toutes les lignes de facture doivent avoir une description et un prix", variant: "destructive" });
                  return;
                }
                if (invoiceItemsList.some(item => isNaN(parseFloat(item.unitPrice)) || isNaN(parseFloat(item.quantity)) || parseFloat(item.quantity) <= 0)) {
                  toast({ title: "Erreur", description: "La quantité et le prix unitaire doivent être des nombres valides et positifs", variant: "destructive" });
                  return;
                }

                setIsUploading(true);
                try {
                  const uploadedPaths: string[] = [];
                  for (const file of invoiceMediaFiles) {
                    const formData = new FormData();
                    formData.append("file", file);
                    const res = await fetch("/api/admin/upload", { method: "POST", body: formData });
                    if (res.ok) {
                      const data = await res.json();
                      uploadedPaths.push(data.filePath);
                    }
                  }

                  // Calculate total amount from items
                  const totalHT = invoiceItemsList.reduce((acc, item) => acc + (parseFloat(item.unitPrice) * parseFloat(item.quantity)), 0);
                  const taxRateNum = parseFloat(invoiceTaxRate) / 100;
                  const totalTTC = totalHT * (1 + taxRateNum);

                  createDirectInvoiceMutation.mutate({
                    clientId: isManualCustomer ? null : selectedClientId,
                    customerName: isManualCustomer ? customerName : null,
                    customerEmail: isManualCustomer ? customerEmail : null,
                    customerAddress: isManualCustomer ? customerAddress : null,
                    customerPhone: isManualCustomer ? customerPhone : null,
                    paymentMethod: invoicePaymentMethod || null,
                    wheelCount: parseInt(invoiceWheelCount) || null,
                    diameter: invoiceDiameter || null,
                    taxRate: invoiceTaxRate,
                    amount: totalTTC.toFixed(2),
                    priceExcludingTax: totalHT.toFixed(2),
                    taxAmount: (totalTTC - totalHT).toFixed(2),
                    notes: invoiceNotes || null,
                    dueDate: invoiceDueDate ? new Date(invoiceDueDate) : undefined,
                    status: "draft",
                    productDetails: serviceName || null,
                    mediaFiles: uploadedPaths,
                    vehicleRegistration: directInvoiceVehicle.vehicleRegistration || null,
                    vehicleMake: directInvoiceVehicle.vehicleMake || null,
                    vehicleModel: directInvoiceVehicle.vehicleModel || null,
                    vehicleVin: directInvoiceVehicle.vehicleVin || null,
                    vehicleFuelType: directInvoiceVehicle.vehicleFuelType || null,
                    vehicleFiscalPower: directInvoiceVehicle.vehicleFiscalPower || null,
                    vehicleFirstRegDate: directInvoiceVehicle.vehicleFirstRegDate || null,
                    vehicleColor: directInvoiceVehicle.vehicleColor || null,
                    items: invoiceItemsList.map(item => ({
                      description: item.description,
                      quantity: item.quantity,
                      unitPriceExcludingTax: item.unitPrice,
                      taxRate: invoiceTaxRate,
                    }))
                  });
                } finally {
                  setIsUploading(false);
                }
              }}
            >
              {isUploading || createDirectInvoiceMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Créer la Facture
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
