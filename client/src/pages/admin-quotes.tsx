import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Quote, User, ApplicationSettings } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { Check, X, FileText, Calendar, Download, Plus, Pencil, Tags, Search, Mail, Loader2, Eye, CircleCheckBig, Eye as ViewIcon, Send, MailX, EyeOff, CircleX, ExternalLink, Sparkles, Brain } from "lucide-react";
import { VehicleFields, type VehicleData } from "@/components/vehicle-fields";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { generateQuotePDF, generateLabelsPDF } from "@/lib/pdf-generator";
import { ObjectUploader } from "@/components/ObjectUploader";
import { LabelsPreview } from "@/components/labels-preview";
import { CreateClientDialog } from "@/components/create-client-dialog";

import { initiateClientCreationRedirect } from "@/lib/navigation";
import { SendEmailDialog, type EmailParams } from "@/components/send-email-dialog";

export default function AdminQuotes() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading, isAdmin, isSuperAdmin } = useAuth();
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [quoteAmount, setQuoteAmount] = useState("");
  const [notes, setNotes] = useState("");
  
  const [invoiceDialog, setInvoiceDialog] = useState<Quote | null>(null);
  const [invoiceDueDate, setInvoiceDueDate] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [invoiceMediaFiles, setInvoiceMediaFiles] = useState<Array<{key: string; type: string; name: string}>>([]);
  
  const [reservationDialog, setReservationDialog] = useState<Quote | null>(null);
  const [reservationStartDate, setReservationStartDate] = useState("");
  const [reservationStartTime, setReservationStartTime] = useState("09:00");
  const [reservationEndDate, setReservationEndDate] = useState("");
  const [reservationEndTime, setReservationEndTime] = useState("17:00");
  const [reservationAssignedEmployee, setReservationAssignedEmployee] = useState("");
  const [reservationNotes, setReservationNotes] = useState("");

  const [labelsPreviewOpen, setLabelsPreviewOpen] = useState(false);
  const [selectedQuoteForLabels, setSelectedQuoteForLabels] = useState<Quote | null>(null);
  
  const [emailDialogQuote, setEmailDialogQuote] = useState<Quote | null>(null);
  const [emailDialogClient, setEmailDialogClient] = useState<User | null>(null);
  
  const [createQuoteDialog, setCreateQuoteDialog] = useState(false);
  const [createClientDialog, setCreateClientDialog] = useState(false);

  const [aiSmartLoading, setAiSmartLoading] = useState(false);
  const [aiSmartSuggestion, setAiSmartSuggestion] = useState<{ serviceName: string; estimatedPrice: number; productDetails: string; notes: string } | null>(null);

  const [newQuoteClientId, setNewQuoteClientId] = useState("");
  const [selectedClientName, setSelectedClientName] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedServices, setSelectedServices] = useState<Array<{
    serviceId: string;
    serviceName: string;
    quantity: string;
    unitPrice: string;
  }>>([]);
  const [newQuoteDetails, setNewQuoteDetails] = useState("");
  const [newQuoteWheelCount, setNewQuoteWheelCount] = useState<string>("4");
  const [newQuoteDiameter, setNewQuoteDiameter] = useState("");
  const [newQuoteTaxRate, setNewQuoteTaxRate] = useState("20");
  const [newQuoteProductDetails, setNewQuoteProductDetails] = useState("");
  const [newQuoteWheelPositions, setNewQuoteWheelPositions] = useState<string[]>([]);
  const [newQuoteVehicle, setNewQuoteVehicle] = useState<VehicleData>({
    vehicleRegistration: "",
    vehicleMake: "",
    vehicleModel: "",
    vehicleVin: "",
    vehicleFuelType: "",
    vehicleFiscalPower: "",
    vehicleFirstRegDate: "",
    vehicleColor: "",
  });
  const [quoteMediaFiles, setQuoteMediaFiles] = useState<Array<{key: string; type: string; name: string}>>([]);
  const maxPhotos = 1;


  // Redirect non-admin users
  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !isAdmin)) {
      window.location.href = "/";
    }
  }, [isAuthenticated, isLoading, isAdmin]);

  const { data: quotes = [], isLoading: quotesLoading } = useQuery<Quote[]>({
    queryKey: ["/api/admin/quotes"],
    enabled: isAuthenticated && isAdmin,
  });

  const { data: services = [] } = useQuery<any[]>({
    queryKey: ["/api/services"],
    enabled: isAuthenticated,
  });

  const [simuPrefilled, setSimuPrefilled] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shouldOpenDialog = params.get("openDialog") === "true";
    const clientId = params.get("clientId");
    const fromSimulator = params.get("fromSimulator") === "true";

    if (shouldOpenDialog && isAuthenticated && isAdmin) {
      setCreateQuoteDialog(true);
      if (clientId) {
        setNewQuoteClientId(clientId);
      }

      if (!fromSimulator) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, [isAuthenticated, isAdmin]);

  useEffect(() => {
    if (simuPrefilled) return;
    const params = new URLSearchParams(window.location.search);
    const fromSimulator = params.get("fromSimulator") === "true";
    if (!fromSimulator || !isAuthenticated || !isAdmin) return;
    if (services.length === 0) return;

    try {
      const raw = sessionStorage.getItem("devisSimu");
      if (!raw) return;
      const devisSimu = JSON.parse(raw);

      if (devisSimu.selectedServiceIds?.length > 0) {
        const simuServices = devisSimu.selectedServiceIds
          .map((id: string) => {
            const svc = services.find((s: any) => s.id === id);
            if (!svc) return null;
            return {
              serviceId: svc.id,
              serviceName: svc.name,
              quantity: "1",
              unitPrice: svc.basePrice || "0",
            };
          })
          .filter(Boolean);
        if (simuServices.length > 0) {
          setSelectedServices(simuServices);
        }
      }

      const configDesc = [];
      if (devisSimu.config?.colorName) configDesc.push(`Couleur: ${devisSimu.config.colorName}`);
      if (devisSimu.config?.finish) configDesc.push(`Finition: ${devisSimu.config.finish}`);
      if (devisSimu.config?.spokePreset) configDesc.push(`Style: ${devisSimu.config.spokePreset}`);
      if (devisSimu.config?.lisereEnabled) configDesc.push(`Liseré: ${devisSimu.config.lisereColor || "oui"}`);
      if (devisSimu.config?.gravureText) configDesc.push(`Gravure: "${devisSimu.config.gravureText}"`);
      const productText = `[Simulateur 3D] ${configDesc.join(" | ")}`;
      setNewQuoteProductDetails(productText);

      if (devisSimu.config?.spokePreset) {
        setNewQuoteDetails(`Configuration 3D: ${devisSimu.config.spokePreset}, ${devisSimu.config.colorName || ""} ${devisSimu.config.finish || ""}`);
      }

      if (devisSimu.uploadedMedia?.length > 0) {
        setQuoteMediaFiles(devisSimu.uploadedMedia);
      }

      sessionStorage.removeItem("devisSimu");
      setSimuPrefilled(true);
      window.history.replaceState({}, "", window.location.pathname);
    } catch (e) {
      console.error("Erreur lecture devisSimu:", e);
    }
  }, [isAuthenticated, isAdmin, services, simuPrefilled]);

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAuthenticated && isAdmin,
  });

  const { data: settings } = useQuery<ApplicationSettings>({
    queryKey: ["/api/admin/settings"],
    enabled: isAuthenticated && isAdmin,
  });

  // Pré-sélectionner le dernier client créé quand le dialog s'ouvre
  useEffect(() => {
    if (createQuoteDialog && users.length > 0 && !newQuoteClientId) {
      const clients = users.filter(u => u.role?.includes("client"));
      if (clients.length > 0) {
        // Users are sorted by createdAt DESC, so most recent is at index 0
        setNewQuoteClientId(clients[0].id);
      }
    }
  }, [createQuoteDialog, users]);

  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const initialStatus = searchParams.get("status") || "all";
  
  // États pour la recherche et les filtres
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get("status")) {
      setStatusFilter(params.get("status")!);
    }
  }, [searchString]);

  // Fonction pour obtenir le nom complet du client
  const getClientName = (clientId: string | null | undefined) => {
    if (!clientId) return "Client inconnu";
    const client = users.find(u => u.id === clientId);
    if (!client) return `Client-${clientId.slice(0, 8)}`;
    return `${client.firstName || ""} ${client.lastName || ""}`.trim() || client.email || "Client inconnu";
  };

  // Fonction pour obtenir le nom du service
  const getServiceName = (serviceId: string | null | undefined) => {
    if (!serviceId) return "Service inconnu";
    const service = services.find(s => s.id === serviceId);
    return service?.name || `Service-${serviceId.slice(0, 8)}`;
  };

  // Filtrage des devis
  const filteredQuotes = quotes.filter(quote => {
    const clientName = getClientName(quote.clientId).toLowerCase();
    const serviceName = getServiceName(quote.serviceId).toLowerCase();
    const productDetails = (quote.productDetails ?? "").toLowerCase();
    const searchLower = searchTerm.toLowerCase();
    
    const matchesSearch = 
      clientName.includes(searchLower) ||
      serviceName.includes(searchLower) ||
      quote.id.toLowerCase().includes(searchLower) ||
      productDetails.includes(searchLower);
    
    const matchesStatus = statusFilter === "all" || quote.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const [deleteQuoteDialog, setDeleteQuoteDialog] = useState<Quote | null>(null);

  const deleteQuoteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/quotes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quotes"] });
      toast({
        title: "Succès",
        description: "Devis supprimé définitivement et notification envoyée.",
      });
      setDeleteQuoteDialog(null);
    },
    onError: (error: any) => {
      toast({
        title: "Erreur",
        description: error.message || "Échec de la suppression du devis.",
        variant: "destructive",
      });
    },
  });

  const handleDeleteQuote = (quote: Quote) => {
    setDeleteQuoteDialog(quote);
  };

  const handleDownloadPDF = async (quote: Quote) => {
    try {
      const response = await fetch(`/api/quotes/${quote.id}/pdf`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) throw new Error("Erreur lors de la récupération des données");
      const data = await response.json();
      
      const { generateQuotePDF } = await import("@/lib/pdf-generator");
      const doc = await generateQuotePDF(data.quote, data.client, data.service, data.items, data.settings);
      if (doc) {
        doc.save(`Devis_${quote.reference || quote.id.slice(0, 8)}.pdf`);
      }
    } catch (error) {
      console.error("PDF Download Error:", error);
      toast({ 
        title: "Erreur", 
        description: "Échec de la génération du PDF", 
        variant: "destructive" 
      });
    }
  };

  const handlePreviewPDF = async (quote: Quote) => {
    try {
      const response = await fetch(`/api/quotes/${quote.id}/pdf`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) throw new Error("Erreur lors de la récupération des données");
      const data = await response.json();
      
      const { generateQuotePDF } = await import("@/lib/pdf-generator");
      const doc = await generateQuotePDF(data.quote, data.client, data.service, data.items, data.settings, true);
      if (doc) {
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    } catch (error) {
      console.error("PDF Preview Error:", error);
      toast({ 
        title: "Erreur", 
        description: "Échec de la prévisualisation du PDF", 
        variant: "destructive" 
      });
    }
  };

  const handleDownloadLabels = async (quote: Quote) => {
    setSelectedQuoteForLabels(quote);
    setLabelsPreviewOpen(true);
  };

  const handleConfirmDownloadLabels = async () => {
    if (!selectedQuoteForLabels) return;
    
    try {
      await generateLabelsPDF(selectedQuoteForLabels, 'quote');
      toast({
        title: "✅ Étiquettes téléchargées !",
        description: "Les étiquettes avec QR codes ont été générées et téléchargées avec succès.",
        duration: 5000,
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Échec de la génération des étiquettes",
        variant: "destructive",
      });
    }
  };

  const updateQuoteMutation = useMutation({
    mutationFn: async (data: { id: string; quoteAmount?: string; notes?: string; status?: string }) => {
      return apiRequest("PATCH", `/api/admin/quotes/${data.id}`, data);
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: "Devis mis à jour avec succès",
      });
      setSelectedQuote(null);
      setQuoteAmount("");
      setNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quotes"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message || "Échec de la mise à jour du devis",
        variant: "destructive",
      });
    },
  });

  const [sendingEmailQuoteId, setSendingEmailQuoteId] = useState<string | null>(null);

  const sendQuoteEmailMutation = useMutation({
    mutationFn: async ({ quoteId, emailParams }: { quoteId: string; emailParams: EmailParams }) => {
      setSendingEmailQuoteId(quoteId);
      return apiRequest("POST", `/api/admin/quotes/${quoteId}/send-email`, {
        customRecipient: emailParams.recipient,
        customSubject: emailParams.subject,
        customMessage: emailParams.message,
        additionalRecipients: emailParams.additionalRecipients,
        sendCopy: emailParams.sendCopy,
      });
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: "Email envoyé avec succès",
      });
      setSendingEmailQuoteId(null);
      setEmailDialogQuote(null);
      setEmailDialogClient(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message || "Échec de l'envoi de l'email",
        variant: "destructive",
      });
      setSendingEmailQuoteId(null);
    },
  });

  const handleViewOnline = async (quoteId: string) => {
    try {
      const res = await apiRequest("POST", `/api/quotes/${quoteId}/view-link`);
      const data = await res.json();
      window.open(data.viewUrl, '_blank');
    } catch (error: any) {
      toast({ title: "Erreur", description: "Impossible de générer le lien", variant: "destructive" });
    }
  };

  const handleOpenEmailDialog = (quote: Quote) => {
    const client = users.find(u => u.id === quote.clientId);
    setEmailDialogQuote(quote);
    setEmailDialogClient(client || null);
  };

  const handleSendQuoteEmail = (emailParams: EmailParams) => {
    if (emailDialogQuote) {
      sendQuoteEmailMutation.mutate({ quoteId: emailDialogQuote.id, emailParams });
    }
  };

  const getDefaultEmailMessage = (quote: Quote, client: User | null) => {
    const clientName = client ? `${client.firstName || ""} ${client.lastName || ""}`.trim() || client.email : "Client";
    const quoteNumber = quote.reference || `DEV-${new Date(quote.createdAt || Date.now()).getMonth() + 1}-00001`;
    const amount = quote.quoteAmount ? parseFloat(quote.quoteAmount).toLocaleString("fr-FR", { style: "currency", currency: "EUR" }) : "0,00 €";
    
    return `Bonjour ${clientName},

Veuillez trouver ci-joint votre devis N°${quoteNumber} d'un montant de ${amount}.

Une fois le devis validé, merci de nous recontacter pour fixer votre rendez-vous.

Cordialement,
L'équipe MyJantes`;
  };

  const handleSaveQuote = () => {
    if (!selectedQuote) return;
    
    updateQuoteMutation.mutate({
      id: selectedQuote.id,
      quoteAmount,
      notes,
      status: "approved",
    });
  };

  const handleRejectQuote = (quoteId: string) => {
    updateQuoteMutation.mutate({
      id: quoteId,
      status: "rejected",
    });
  };

  const createInvoiceMutation = useMutation({
    mutationFn: async (data: { quoteId: string; clientId: string; amount: string; dueDate: string; notes?: string; mediaFiles?: Array<{key: string; type: string; name: string}> }) => {
      const invoiceNumber = `INV-${Date.now()}`;
      return apiRequest("POST", "/api/admin/invoices", {
        quoteId: data.quoteId,
        clientId: data.clientId,
        invoiceNumber,
        amount: parseFloat(data.amount),
        dueDate: data.dueDate,
        notes: data.notes,
        mediaFiles: data.mediaFiles,
      });
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: "Facture créée avec succès",
      });
      setInvoiceDialog(null);
      setInvoiceDueDate("");
      setInvoiceNotes("");
      setInvoiceMediaFiles([]);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invoices"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message || "Échec de la création de la facture",
        variant: "destructive",
      });
    },
  });

  const createReservationMutation = useMutation({
    mutationFn: async (data: { 
      quoteId: string; 
      clientId: string; 
      serviceId: string; 
      scheduledDate: string; 
      estimatedEndDate?: string;
      assignedEmployeeId?: string;
      notes?: string;
    }) => {
      return apiRequest("POST", "/api/admin/reservations", {
        quoteId: data.quoteId,
        clientId: data.clientId,
        serviceId: data.serviceId,
        scheduledDate: data.scheduledDate,
        estimatedEndDate: data.estimatedEndDate,
        assignedEmployeeId: data.assignedEmployeeId || null,
        status: "confirmed",
        notes: data.notes,
      });
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: "Réservation créée avec succès",
      });
      setReservationDialog(null);
      setReservationStartDate("");
      setReservationStartTime("09:00");
      setReservationEndDate("");
      setReservationEndTime("17:00");
      setReservationAssignedEmployee("");
      setReservationNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reservations"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message || "Échec de la création de la réservation",
        variant: "destructive",
      });
    },
  });

  const [userSearchTerm, setUserSearchTerm] = useState("");

  const filteredUsers = users.filter(u => 
    u.role?.includes("client") && (
      (u.firstName || "").toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      (u.lastName || "").toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      (u.companyName || "").toLowerCase().includes(userSearchTerm.toLowerCase())
    )
  );

  const handleCreateInvoice = () => {
    if (!invoiceDialog || !invoiceDueDate) return;
    
    createInvoiceMutation.mutate({
      quoteId: invoiceDialog.id,
      clientId: invoiceDialog.clientId,
      amount: invoiceDialog.quoteAmount || "0",
      dueDate: invoiceDueDate,
      notes: invoiceNotes,
      mediaFiles: invoiceMediaFiles,
    });
  };

  const handleCreateReservation = () => {
    if (!reservationDialog || !reservationStartDate) return;
    
    // Combine date and time for start
    const startDateTime = `${reservationStartDate}T${reservationStartTime}:00`;
    
    // Combine date and time for end (use start date if end date not specified)
    const endDate = reservationEndDate || reservationStartDate;
    const endDateTime = `${endDate}T${reservationEndTime}:00`;
    
    createReservationMutation.mutate({
      quoteId: reservationDialog.id,
      clientId: reservationDialog.clientId,
      serviceId: reservationDialog.serviceId,
      scheduledDate: startDateTime,
      estimatedEndDate: endDateTime,
      assignedEmployeeId: reservationAssignedEmployee || undefined,
      notes: reservationNotes,
    });
  };

  const createNewQuoteMutation = useMutation({
    mutationFn: async (data: { 
      clientId: string; 
      serviceId: string; 
      requestDetails?: any; 
      mediaFiles?: Array<{key: string; type: string; name: string}>;
      wheelCount?: number;
      wheelPositions?: string[];
      diameter?: string;
      priceExcludingTax?: string;
      taxRate?: string;
      taxAmount?: string;
      productDetails?: string;
      quoteAmount?: string;
      services?: Array<{
        serviceId: string;
        serviceName: string;
        quantity: number;
        unitPrice: number;
      }>;
      vehicleRegistration?: string | null;
      vehicleMake?: string | null;
      vehicleModel?: string | null;
      vehicleVin?: string | null;
      vehicleFuelType?: string | null;
      vehicleFiscalPower?: string | null;
      vehicleFirstRegDate?: string | null;
      vehicleColor?: string | null;
    }) => {
      return apiRequest("POST", "/api/admin/quotes", data);
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: "Devis créé avec succès",
      });
      setCreateQuoteDialog(false);
      setNewQuoteClientId("");
      setSelectedClientName("");
      setSelectedServiceId("");
      setSelectedServices([]);
      setNewQuoteDetails("");
      setNewQuoteWheelCount("4");
      setNewQuoteWheelPositions([]);
      setNewQuoteDiameter("");
      setNewQuoteTaxRate("20");
      setNewQuoteProductDetails("");
      setQuoteMediaFiles([]);
      setNewQuoteVehicle({
        vehicleRegistration: "",
        vehicleMake: "",
        vehicleModel: "",
        vehicleVin: "",
        vehicleFuelType: "",
        vehicleFiscalPower: "",
        vehicleFirstRegDate: "",
        vehicleColor: "",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quotes"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message || "Échec de la création du devis",
        variant: "destructive",
      });
    },
  });

  const handleClientCreated = async (clientId: string, clientName: string) => {
    await queryClient.refetchQueries({ queryKey: ["/api/admin/users"] });
    setNewQuoteClientId(clientId);
    setSelectedClientName(clientName);
    toast({
      title: "Client sélectionné",
      description: `${clientName} a été créé et sélectionné pour ce devis.`,
    });
  };

  const addServiceToQuote = () => {
    if (!selectedServiceId) return;
    
    const service = services.find(s => s.id === selectedServiceId);
    if (!service) return;
    
    setSelectedServices([...selectedServices, {
      serviceId: service.id,
      serviceName: service.name,
      quantity: "1",
      unitPrice: service.basePrice || "0",
    }]);
    setSelectedServiceId("");
  };

  const removeServiceFromQuote = (index: number) => {
    setSelectedServices(selectedServices.filter((_, i) => i !== index));
  };

  const updateServiceQuantity = (index: number, quantity: string) => {
    const updated = [...selectedServices];
    updated[index].quantity = quantity;
    setSelectedServices(updated);
  };

  const updateServicePrice = (index: number, price: string) => {
    const updated = [...selectedServices];
    updated[index].unitPrice = price;
    setSelectedServices(updated);
  };

  const calculateTotalHT = () => {
    return selectedServices.reduce((total, service) => {
      const qty = parseFloat(service.quantity || "0");
      const price = parseFloat(service.unitPrice || "0");
      return total + (qty * price);
    }, 0);
  };

  const calculateTaxAmount = () => {
    const totalHT = calculateTotalHT();
    const taxRate = parseFloat(newQuoteTaxRate || "0");
    return (totalHT * taxRate) / 100;
  };

  const calculateTotalTTC = () => {
    return calculateTotalHT() + calculateTaxAmount();
  };

  const handleCreateNewQuote = async () => {
    if (!newQuoteClientId) {
      toast({
        title: "Erreur",
        description: "Veuillez sélectionner un client",
        variant: "destructive",
      });
      return;
    }
    
    if (selectedServices.length === 0) {
      toast({
        title: "Erreur",
        description: "Veuillez ajouter au moins un service",
        variant: "destructive",
      });
      return;
    }
    
    const imageCount = quoteMediaFiles.filter(f => f.type.startsWith('image/')).length;
    if (imageCount < 1) {
      toast({
        title: "Erreur",
        description: `Au moins 1 image est requise (${imageCount}/1)`,
        variant: "destructive",
      });
      return;
    }
    
    if (newQuoteWheelPositions.length !== parseInt(newQuoteWheelCount)) {
      toast({
        title: "Erreur",
        description: `Veuillez sélectionner exactement ${newQuoteWheelCount} position(s) de roue`,
        variant: "destructive",
      });
      return;
    }
    
    const totalHT = calculateTotalHT();
    const taxAmount = calculateTaxAmount();
    const totalAmount = calculateTotalTTC();
    
    const mainServiceId = selectedServices[0].serviceId;
    
    createNewQuoteMutation.mutate({
      clientId: newQuoteClientId,
      serviceId: mainServiceId,
      requestDetails: newQuoteDetails ? { notes: newQuoteDetails } : undefined,
      mediaFiles: quoteMediaFiles,
      wheelCount: parseInt(newQuoteWheelCount),
      wheelPositions: newQuoteWheelPositions,
      diameter: newQuoteDiameter,
      priceExcludingTax: totalHT.toFixed(2),
      taxRate: newQuoteTaxRate,
      taxAmount: taxAmount.toFixed(2),
      productDetails: newQuoteProductDetails,
      quoteAmount: totalAmount.toFixed(2),
      vehicleRegistration: newQuoteVehicle.vehicleRegistration || null,
      vehicleMake: newQuoteVehicle.vehicleMake || null,
      vehicleModel: newQuoteVehicle.vehicleModel || null,
      vehicleVin: newQuoteVehicle.vehicleVin || null,
      vehicleFuelType: newQuoteVehicle.vehicleFuelType || null,
      vehicleFiscalPower: newQuoteVehicle.vehicleFiscalPower || null,
      vehicleFirstRegDate: newQuoteVehicle.vehicleFirstRegDate || null,
      vehicleColor: newQuoteVehicle.vehicleColor || null,
      services: selectedServices.map(s => ({
        serviceId: s.serviceId,
        serviceName: s.serviceName,
        quantity: parseFloat(s.quantity),
        unitPrice: parseFloat(s.unitPrice),
      })),
    });
  };

  if (isLoading || !isAdmin) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold" data-testid="text-admin-quotes-title">Gestion des Devis</h1>
        <Button onClick={() => setCreateQuoteDialog(true)} data-testid="button-create-quote" className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          Créer un devis
        </Button>
      </div>

      {/* Barre de recherche et filtres */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Tous les Devis</CardTitle>
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => {
                const params = new URLSearchParams();
                if (statusFilter !== "all") params.set("status", statusFilter);
                window.open(`/api/admin/export/quotes?${params.toString()}`, '_blank');
              }}
              data-testid="button-export-quotes-csv"
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
                placeholder="Rechercher par client, service, produits..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search-quotes"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48" data-testid="select-status-filter">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="approved">Approuvés</SelectItem>
                <SelectItem value="accepted">Acceptés</SelectItem>
                <SelectItem value="rejected">Refusés</SelectItem>
                <SelectItem value="completed">Terminés</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {quotesLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : filteredQuotes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>{quotes.length === 0 ? "Aucun devis pour le moment" : "Aucun devis ne correspond à votre recherche"}</p>
            </div>
          ) : (
            <>
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Référence</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Montant</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Suivi</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredQuotes.map((quote) => (
                      <TableRow key={quote.id} className="hover-elevate group" data-testid={`admin-quote-item-${quote.id}`}>
                        <TableCell>
                          <p className="font-semibold">{quote.reference || `Devis #${quote.id.slice(0, 8)}`}</p>
                          {quote.createdAt && (
                            <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(quote.createdAt), { addSuffix: true, locale: fr })}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <p>{getClientName(quote.clientId)}</p>
                          <p className="text-xs text-muted-foreground">{getServiceName(quote.serviceId)}</p>
                        </TableCell>
                        <TableCell>
                          {quote.quoteAmount && (
                            <>
                              <p className="font-mono font-bold">{quote.quoteAmount} €</p>
                              {quote.priceExcludingTax && (
                                <p className="text-xs text-muted-foreground">{parseFloat(quote.priceExcludingTax).toFixed(2)} € HT</p>
                              )}
                            </>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={quote.status as any} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${quote.emailSentAt ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`} data-testid={`tracking-sent-${quote.id}`}>
                                  {quote.emailSentAt ? <Send className="h-3 w-3" /> : <MailX className="h-3 w-3" />}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {quote.emailSentAt
                                  ? `Envoyé le ${new Date(quote.emailSentAt).toLocaleDateString("fr-FR")} à ${new Date(quote.emailSentAt).toLocaleTimeString("fr-FR")}`
                                  : "Non envoyé"}
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${quote.viewedAt ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'bg-muted text-muted-foreground'}`} data-testid={`tracking-viewed-${quote.id}`}>
                                  {quote.viewedAt ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {quote.viewedAt
                                  ? `Consulté le ${new Date(quote.viewedAt).toLocaleDateString("fr-FR")} à ${new Date(quote.viewedAt).toLocaleTimeString("fr-FR")}`
                                  : "Non consulté"}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {quote.status === "pending" && (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title="Approuver"
                                  onClick={() => {
                                    setSelectedQuote(quote);
                                    setQuoteAmount(quote.quoteAmount || "");
                                    setNotes(quote.notes || "");
                                  }}
                                  data-testid={`button-respond-${quote.id}`}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title="Refuser"
                                  onClick={() => handleRejectQuote(quote.id)}
                                  data-testid={`button-reject-${quote.id}`}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Éditer"
                              onClick={() => setLocation(`/admin/quotes/${quote.id}/edit`)}
                              data-testid={`button-edit-quote-${quote.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Consulter en ligne"
                              onClick={() => handleViewOnline(quote.id)}
                              data-testid={`button-view-online-quote-${quote.id}`}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            {isSuperAdmin && (
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Voir PDF"
                                onClick={() => handlePreviewPDF(quote)}
                                data-testid={`button-preview-quote-pdf-${quote.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Télécharger PDF"
                              onClick={() => handleDownloadPDF(quote)}
                              data-testid={`button-download-pdf-${quote.id}`}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Envoyer par email"
                              onClick={() => handleOpenEmailDialog(quote)}
                              disabled={sendingEmailQuoteId === quote.id}
                              data-testid={`button-send-email-${quote.id}`}
                            >
                              {sendingEmailQuoteId === quote.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Mail className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Étiquettes"
                              onClick={() => handleDownloadLabels(quote)}
                              disabled={quote.status === 'pending'}
                              className={quote.status === 'pending' ? "opacity-50 cursor-not-allowed" : ""}
                              data-testid={`button-download-labels-${quote.id}`}
                            >
                              <Tags className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Supprimer définitivement"
                              onClick={() => handleDeleteQuote(quote)}
                              disabled={deleteQuoteMutation.isPending}
                              data-testid={`button-delete-quote-${quote.id}`}
                              className="text-destructive"
                            >
                              <CircleX className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Créer facture"
                              onClick={() => {
                                setInvoiceDialog(quote);
                                setInvoiceDueDate(addDays(new Date(), 30).toISOString().split('T')[0]);
                                setInvoiceNotes("");
                              }}
                              data-testid={`button-create-invoice-${quote.id}`}
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Créer réservation"
                              onClick={() => {
                                setReservationDialog(quote);
                                const defaultDate = addDays(new Date(), 7).toISOString().split('T')[0];
                                setReservationStartDate(defaultDate);
                                setReservationStartTime("09:00");
                                setReservationEndDate(defaultDate);
                                setReservationEndTime("17:00");
                                setReservationAssignedEmployee("");
                                setReservationNotes("");
                              }}
                              data-testid={`button-create-reservation-${quote.id}`}
                            >
                              <Calendar className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="lg:hidden space-y-3">
                {filteredQuotes.map((quote) => (
                  <div key={quote.id} className="p-4 border border-border rounded-md hover-elevate" data-testid={`admin-quote-item-mobile-${quote.id}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                      <p className="font-semibold">{quote.reference || `Devis #${quote.id.slice(0, 8)}`}</p>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={quote.status as any} />
                        {quote.quoteAmount && (
                          <span className="font-mono font-bold">{quote.quoteAmount} €</span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{getClientName(quote.clientId)}</p>
                    <p className="text-xs text-muted-foreground">{getServiceName(quote.serviceId)}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${quote.emailSentAt ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`} data-testid={`tracking-sent-mobile-${quote.id}`}>
                            {quote.emailSentAt ? <Send className="h-3 w-3" /> : <MailX className="h-3 w-3" />}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {quote.emailSentAt
                            ? `Envoyé le ${new Date(quote.emailSentAt).toLocaleDateString("fr-FR")} à ${new Date(quote.emailSentAt).toLocaleTimeString("fr-FR")}`
                            : "Non envoyé"}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${quote.viewedAt ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'bg-muted text-muted-foreground'}`} data-testid={`tracking-viewed-mobile-${quote.id}`}>
                            {quote.viewedAt ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {quote.viewedAt
                            ? `Consulté le ${new Date(quote.viewedAt).toLocaleDateString("fr-FR")} à ${new Date(quote.viewedAt).toLocaleTimeString("fr-FR")}`
                            : "Non consulté"}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    {quote.createdAt && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {formatDistanceToNow(new Date(quote.createdAt), { addSuffix: true, locale: fr })}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border flex-wrap">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Éditer"
                          onClick={() => setLocation(`/admin/quotes/${quote.id}/edit`)}
                          data-testid={`button-edit-quote-${quote.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      {quote.status === "pending" && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Répondre"
                            onClick={() => {
                              setSelectedQuote(quote);
                              setQuoteAmount(quote.quoteAmount || "");
                              setNotes(quote.notes || "");
                            }}
                            data-testid={`button-respond-${quote.id}`}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Refuser"
                            onClick={() => handleRejectQuote(quote.id)}
                            data-testid={`button-reject-${quote.id}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Consulter en ligne"
                        onClick={() => handleViewOnline(quote.id)}
                        data-testid={`button-view-online-quote-${quote.id}`}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      {isSuperAdmin && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Voir PDF"
                          onClick={() => handlePreviewPDF(quote)}
                          data-testid={`button-preview-quote-pdf-${quote.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Télécharger PDF"
                        onClick={() => handleDownloadPDF(quote)}
                        data-testid={`button-download-pdf-${quote.id}`}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Envoyer par email"
                        onClick={() => handleOpenEmailDialog(quote)}
                        disabled={sendingEmailQuoteId === quote.id}
                        data-testid={`button-send-email-${quote.id}`}
                      >
                        {sendingEmailQuoteId === quote.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Mail className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Étiquettes"
                        onClick={() => handleDownloadLabels(quote)}
                        disabled={quote.status === 'pending'}
                        className={quote.status === 'pending' ? "opacity-50 cursor-not-allowed" : ""}
                        data-testid={`button-download-labels-${quote.id}`}
                      >
                        <Tags className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Créer facture"
                        onClick={() => {
                          setInvoiceDialog(quote);
                          setInvoiceDueDate(addDays(new Date(), 30).toISOString().split('T')[0]);
                          setInvoiceNotes("");
                        }}
                        data-testid={`button-create-invoice-${quote.id}`}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Créer réservation"
                        onClick={() => {
                          setReservationDialog(quote);
                          const defaultDate = addDays(new Date(), 7).toISOString().split('T')[0];
                          setReservationStartDate(defaultDate);
                          setReservationStartTime("09:00");
                          setReservationEndDate(defaultDate);
                          setReservationEndTime("17:00");
                          setReservationAssignedEmployee("");
                          setReservationNotes("");
                        }}
                        data-testid={`button-create-reservation-${quote.id}`}
                      >
                        <Calendar className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Supprimer"
                        className="text-destructive"
                        onClick={() => {
                          if (confirm("Voulez-vous vraiment supprimer ce devis ?")) {
                            apiRequest("DELETE", `/api/admin/quotes/${quote.id}`)
                              .then(() => {
                                toast({ title: "Devis supprimé" });
                                queryClient.invalidateQueries({ queryKey: ["/api/admin/quotes"] });
                              });
                          }
                        }}
                        data-testid={`button-delete-quote-${quote.id}`}
                      >
                        <CircleX className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedQuote} onOpenChange={(open) => !open && (setSelectedQuote(null), setAiSmartSuggestion(null))}>
        <DialogContent className="max-w-md px-4 pb-6">
          <DialogHeader>
            <DialogTitle className="text-xl">Répondre à la Demande de Devis</DialogTitle>
            <DialogDescription>
              Définissez le montant du devis et ajoutez des notes supplémentaires.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* AI Smart Quote suggestion */}
            <div className="flex items-center justify-between gap-2 p-3 rounded-md bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-2 text-sm">
                <Brain className="h-4 w-4 text-primary shrink-0" />
                <span className="text-muted-foreground">Estimation IA basée sur la demande</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10"
                disabled={aiSmartLoading}
                onClick={async () => {
                  if (!selectedQuote) return;
                  setAiSmartLoading(true);
                  setAiSmartSuggestion(null);
                  try {
                    const description = [selectedQuote.productDetails, selectedQuote.notes, (selectedQuote as any).clientMessage].filter(Boolean).join(" | ") || "Réparation / personnalisation de jantes";
                    const res = await apiRequest("POST", "/api/admin/ai/smart-quote", { description });
                    const data = await res.json();
                    setAiSmartSuggestion(data);
                    if (data.estimatedPrice > 0) setQuoteAmount(String(data.estimatedPrice));
                    if (data.productDetails && !notes) setNotes(data.productDetails);
                  } catch {
                    toast({ title: "Erreur IA", description: "Impossible de générer l'estimation.", variant: "destructive" });
                  } finally {
                    setAiSmartLoading(false);
                  }
                }}
                data-testid="button-ai-smart-quote"
              >
                {aiSmartLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {aiSmartLoading ? "Analyse..." : "Suggérer"}
              </Button>
            </div>

            {aiSmartSuggestion && (
              <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-sm space-y-1">
                <p className="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> Suggestion IA appliquée
                </p>
                {aiSmartSuggestion.serviceName && <p className="text-muted-foreground">Service : <span className="font-medium text-foreground">{aiSmartSuggestion.serviceName}</span></p>}
                {aiSmartSuggestion.notes && <p className="text-muted-foreground text-xs italic">{aiSmartSuggestion.notes}</p>}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quote-amount" className="text-sm font-semibold">Montant du Devis (€)</Label>
                <Input
                  id="quote-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={quoteAmount}
                  onChange={(e) => setQuoteAmount(e.target.value)}
                  className="w-full"
                  data-testid="input-quote-amount"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quote-notes" className="text-sm font-semibold">Notes</Label>
              <Textarea
                id="quote-notes"
                placeholder="Ajouter des détails supplémentaires..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[100px] w-full"
                data-testid="textarea-quote-notes"
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => { setSelectedQuote(null); setAiSmartSuggestion(null); }}
              className="w-full sm:w-auto order-2 sm:order-1"
              data-testid="button-cancel-quote"
            >
              Annuler
            </Button>
            <Button
              onClick={handleSaveQuote}
              disabled={updateQuoteMutation.isPending || !quoteAmount || parseFloat(quoteAmount) <= 0}
              className="w-full sm:w-auto order-1 sm:order-2"
              data-testid="button-save-quote"
            >
              {updateQuoteMutation.isPending ? "Enregistrement..." : "Enregistrer & Approuver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!invoiceDialog} onOpenChange={(open) => !open && setInvoiceDialog(null)}>
        <DialogContent className="max-w-2xl px-4 pb-6">
          <DialogHeader>
            <DialogTitle className="text-xl">Créer une Facture</DialogTitle>
            <DialogDescription>
              Créez une facture basée sur le devis {invoiceDialog?.reference || ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {invoiceDialog && (() => {
              const client = users.find(u => u.id === invoiceDialog.clientId);
              const service = services?.find((s: any) => s.id === invoiceDialog.serviceId);
              return (
                <div className="p-3 bg-muted rounded-md space-y-2 text-sm">
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4">
                    <span className="text-muted-foreground">Client :</span>
                    <span className="font-medium break-all" data-testid="text-invoice-client-name">
                      {client ? `${client.firstName || ""} ${client.lastName || ""}`.trim() || client.email : "—"}
                    </span>
                  </div>
                  {client?.companyName && (
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4">
                      <span className="text-muted-foreground">Société :</span>
                      <span className="font-medium break-all">{client.companyName}</span>
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4">
                    <span className="text-muted-foreground">Réf. Devis :</span>
                    <span className="font-medium">{invoiceDialog.reference || invoiceDialog.id.slice(0, 8).toUpperCase()}</span>
                  </div>
                  {service && (
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4">
                      <span className="text-muted-foreground">Service :</span>
                      <span className="font-medium">{(service as any).name}</span>
                    </div>
                  )}
                  {invoiceDialog.productDetails && (
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4">
                      <span className="text-muted-foreground">Détails :</span>
                      <span className="font-medium sm:truncate sm:max-w-[300px] break-words">{invoiceDialog.productDetails}</span>
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="space-y-2">
              <Label htmlFor="invoice-amount" className="text-sm font-semibold">Montant TTC (€)</Label>
              <Input
                id="invoice-amount"
                type="number"
                step="0.01"
                value={invoiceDialog?.quoteAmount || ""}
                disabled
                className="w-full bg-muted/50"
                data-testid="input-invoice-amount"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-due-date" className="text-sm font-semibold">Date d'Échéance</Label>
              <Input
                id="invoice-due-date"
                type="date"
                value={invoiceDueDate}
                onChange={(e) => setInvoiceDueDate(e.target.value)}
                className="w-full"
                data-testid="input-invoice-due-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-notes" className="text-sm font-semibold">Notes</Label>
              <Textarea
                id="invoice-notes"
                placeholder="Notes supplémentaires..."
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
                className="min-h-[80px] w-full"
                data-testid="textarea-invoice-notes"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Images et Vidéos (optionnel)</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Ajoutez des photos ou vidéos si nécessaire.
              </p>
              <div className="w-full overflow-hidden">
                <ObjectUploader
                  onUploadComplete={(files) => setInvoiceMediaFiles(files)}
                  accept={{
                    'image/*': ['.jpg', '.jpeg', '.png', '.webp'],
                    'video/*': ['.mp4', '.webm', '.mov']
                  }}
                  data-testid="uploader-invoice-media"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setInvoiceDialog(null);
                setInvoiceMediaFiles([]);
              }}
              className="w-full sm:w-auto order-2 sm:order-1"
              data-testid="button-cancel-invoice"
            >
              Annuler
            </Button>
            <Button
              onClick={handleCreateInvoice}
              disabled={createInvoiceMutation.isPending || !invoiceDueDate}
              className="w-full sm:w-auto order-1 sm:order-2"
              data-testid="button-save-invoice"
            >
              {createInvoiceMutation.isPending ? "Création..." : "Créer Facture"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reservationDialog} onOpenChange={(open) => !open && setReservationDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">Créer une Réservation</DialogTitle>
            <DialogDescription>
              Planifiez une réservation pour ce devis.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reservation-start-date" className="text-sm font-semibold">Date de début *</Label>
                <Input
                  id="reservation-start-date"
                  type="date"
                  value={reservationStartDate}
                  onChange={(e) => {
                    const newStartDate = e.target.value;
                    setReservationStartDate(newStartDate);
                    // Update end date if empty or before new start date
                    if (!reservationEndDate || reservationEndDate < newStartDate) {
                      setReservationEndDate(newStartDate);
                    }
                  }}
                  className="w-full"
                  data-testid="input-reservation-start-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reservation-start-time" className="text-sm font-semibold">Heure de début</Label>
                <Input
                  id="reservation-start-time"
                  type="time"
                  value={reservationStartTime}
                  onChange={(e) => setReservationStartTime(e.target.value)}
                  className="w-full"
                  data-testid="input-reservation-start-time"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reservation-end-date" className="text-sm font-semibold">Date de fin</Label>
                <Input
                  id="reservation-end-date"
                  type="date"
                  value={reservationEndDate}
                  onChange={(e) => setReservationEndDate(e.target.value)}
                  min={reservationStartDate}
                  className="w-full"
                  data-testid="input-reservation-end-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reservation-end-time" className="text-sm font-semibold">Heure de fin</Label>
                <Input
                  id="reservation-end-time"
                  type="time"
                  value={reservationEndTime}
                  onChange={(e) => setReservationEndTime(e.target.value)}
                  className="w-full"
                  data-testid="input-reservation-end-time"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reservation-employee" className="text-sm font-semibold">Employé assigné</Label>
              <Select value={reservationAssignedEmployee} onValueChange={(val) => setReservationAssignedEmployee(val === "none" ? "" : val)}>
                <SelectTrigger id="reservation-employee" className="w-full" data-testid="select-reservation-employee">
                  <SelectValue placeholder="Sélectionner un employé (optionnel)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun</SelectItem>
                  {users.filter(u => u.role === "employe" || u.role === "admin").map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.firstName} {employee.lastName} ({employee.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reservation-notes" className="text-sm font-semibold">Notes</Label>
              <Textarea
                id="reservation-notes"
                placeholder="Détails de la réservation..."
                value={reservationNotes}
                onChange={(e) => setReservationNotes(e.target.value)}
                className="min-h-[80px] w-full"
                data-testid="textarea-reservation-notes"
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setReservationDialog(null)}
              className="w-full sm:w-auto order-2 sm:order-1"
              data-testid="button-cancel-reservation"
            >
              Annuler
            </Button>
            <Button
              onClick={handleCreateReservation}
              disabled={createReservationMutation.isPending || !reservationStartDate}
              className="w-full sm:w-auto order-1 sm:order-2"
              data-testid="button-save-reservation"
            >
              {createReservationMutation.isPending ? "Création..." : "Créer Réservation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createQuoteDialog} onOpenChange={setCreateQuoteDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl">Créer un Nouveau Devis</DialogTitle>
            <DialogDescription>
              Remplissez les informations pour créer un nouveau devis.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-2">
            <div className="space-y-4 pr-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="new-quote-client" className="text-sm font-semibold">Client *</Label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-auto px-1 text-primary" 
                  onClick={() => setCreateClientDialog(true)}
                >
                  + Nouveau client
                </Button>
              </div>
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher un client..."
                    value={userSearchTerm}
                    onChange={(e) => setUserSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Select value={newQuoteClientId} onValueChange={(id) => {
                  setNewQuoteClientId(id);
                  const client = users.find(u => u.id === id);
                  if (client) {
                    setSelectedClientName(`${client.firstName} ${client.lastName}`);
                  }
                }}>
                  <SelectTrigger id="new-quote-client" className="w-full" data-testid="select-new-quote-client">
                    <SelectValue placeholder="Sélectionner un client" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredUsers.length > 0 ? (
                      filteredUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.firstName} {user.lastName} ({user.email}) {user.companyName ? `- ${user.companyName}` : ""}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-2 text-sm text-center text-muted-foreground">Aucun client trouvé</div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3 pr-1">
              <Label className="text-sm font-semibold">Services</Label>
              <div className="flex gap-2">
                <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                  <SelectTrigger className="flex-1" data-testid="select-service-to-add">
                    <SelectValue placeholder="Sélectionner un service" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((service) => (
                      <SelectItem key={service.id} value={service.id}>
                        {service.name} - {parseFloat(service.basePrice || "0").toFixed(2)} €
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  onClick={addServiceToQuote}
                  disabled={!selectedServiceId}
                  data-testid="button-add-service"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {selectedServices.length > 0 && (
                <div className="border rounded-md p-3 space-y-3 bg-muted/30">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Services ajoutés :</p>
                  {selectedServices.map((service, index) => (
                    <div key={index} className="flex flex-col gap-3 p-3 bg-card border rounded-md shadow-sm">
                      <div className="flex-1 min-w-0">
                          <Select
                            value={service.serviceId}
                            onValueChange={(value) => {
                              const s = services.find((serv: any) => serv.id === value);
                              if (s) {
                                const updated = [...selectedServices];
                                updated[index].serviceId = s.id;
                                updated[index].serviceName = s.name;
                                updated[index].unitPrice = s.basePrice || "0";
                                setSelectedServices(updated);
                              }
                            }}
                          >
                            <SelectTrigger className="w-full justify-start text-left font-medium">
                              <SelectValue>{service.serviceName}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {services.map((s: any) => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground">Qté</span>
                            <Input
                              type="number"
                              step="1"
                              min="1"
                              value={service.quantity}
                              onChange={(e) => updateServiceQuantity(index, e.target.value)}
                              className="w-16 h-9"
                              data-testid={`input-service-quantity-${index}`}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground">Prix (€)</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={service.unitPrice}
                              onChange={(e) => updateServicePrice(index, e.target.value)}
                              className="w-24 h-9"
                              data-testid={`input-service-price-${index}`}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold whitespace-nowrap">
                            {((parseFloat(service.quantity) || 0) * (parseFloat(service.unitPrice) || 0)).toFixed(2)} €
                          </span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => removeServiceFromQuote(index)}
                            className="h-9 w-9 text-destructive hover:bg-destructive/10"
                            data-testid={`button-remove-service-${index}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pr-1">
              <div className="space-y-2">
                <Label htmlFor="new-quote-wheel-count" className="text-sm font-semibold">Nombre de jantes</Label>
                <Select value={newQuoteWheelCount} onValueChange={(val) => {
                  setNewQuoteWheelCount(val);
                  const count = parseInt(val);
                  if (newQuoteWheelPositions.length > count) {
                    setNewQuoteWheelPositions(newQuoteWheelPositions.slice(0, count));
                  }
                }}>
                  <SelectTrigger className="w-full" data-testid="select-new-quote-wheel-count">
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
              <div className="space-y-2">
                <Label htmlFor="new-quote-diameter" className="text-sm font-semibold">Diamètre</Label>
                <Input
                  id="new-quote-diameter"
                  type="text"
                  placeholder="Ex: 17 pouces"
                  value={newQuoteDiameter}
                  onChange={(e) => setNewQuoteDiameter(e.target.value)}
                  className="w-full"
                  data-testid="input-new-quote-diameter"
                />
              </div>
            </div>
            
            <div className="space-y-3 pr-1">
              <Label className="text-sm font-semibold">Positions des roues</Label>
              <p className="text-xs text-muted-foreground">
                Sélectionnez {newQuoteWheelCount} position(s) ({newQuoteWheelPositions.length}/{newQuoteWheelCount})
              </p>
              <div className="grid grid-cols-2 gap-4 bg-muted/20 p-3 rounded-md">
                {[
                  { id: "FL", label: "Avant Gauche" },
                  { id: "FR", label: "Avant Droite" },
                  { id: "RL", label: "Arrière Gauche" },
                  { id: "RR", label: "Arrière Droite" },
                ].map((pos) => {
                  const isChecked = newQuoteWheelPositions.includes(pos.id);
                  const maxReached = newQuoteWheelPositions.length >= parseInt(newQuoteWheelCount);
                  return (
                    <div key={pos.id} className="flex items-center gap-3">
                      <Checkbox
                        id={`wheel-pos-${pos.id}`}
                        checked={isChecked}
                        disabled={!isChecked && maxReached}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setNewQuoteWheelPositions([...newQuoteWheelPositions, pos.id]);
                          } else {
                            setNewQuoteWheelPositions(newQuoteWheelPositions.filter(p => p !== pos.id));
                          }
                        }}
                        data-testid={`checkbox-wheel-pos-${pos.id}`}
                      />
                      <Label htmlFor={`wheel-pos-${pos.id}`} className="text-sm cursor-pointer font-medium">
                        {pos.label}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 pr-1">
              <Label htmlFor="new-quote-tax-rate" className="text-sm font-semibold">TVA (%)</Label>
              <Input
                id="new-quote-tax-rate"
                type="number"
                step="0.01"
                placeholder="20"
                value={newQuoteTaxRate}
                onChange={(e) => setNewQuoteTaxRate(e.target.value)}
                className="w-full"
                data-testid="input-new-quote-tax-rate"
              />
            </div>

            {selectedServices.length > 0 && (
              <div className="p-4 bg-primary/5 border border-primary/10 rounded-md space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Total HT :</span>
                  <span className="font-mono font-medium">{calculateTotalHT().toFixed(2)} €</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">TVA ({newQuoteTaxRate}%) :</span>
                  <span className="font-mono font-medium">{calculateTaxAmount().toFixed(2)} €</span>
                </div>
                <div className="flex justify-between items-center font-bold text-lg pt-2 border-t border-primary/20">
                  <span className="text-primary">Total TTC :</span>
                  <span className="font-mono text-primary">{calculateTotalTTC().toFixed(2)} €</span>
                </div>
              </div>
            )}

            <div className="pr-1">
              <VehicleFields value={newQuoteVehicle} onChange={setNewQuoteVehicle} />
            </div>

            <div className="space-y-2 pr-1">
              <Label htmlFor="new-quote-product-details" className="text-sm font-semibold">Détails du produit</Label>
              <Textarea
                id="new-quote-product-details"
                placeholder="Description du produit..."
                value={newQuoteProductDetails}
                onChange={(e) => setNewQuoteProductDetails(e.target.value)}
                className="min-h-[80px]"
                data-testid="textarea-new-quote-product-details"
              />
            </div>

            <div className="space-y-2 pr-1">
              <Label htmlFor="new-quote-details" className="text-sm font-semibold">Notes additionnelles</Label>
              <Textarea
                id="new-quote-details"
                placeholder="Notes complémentaires..."
                value={newQuoteDetails}
                onChange={(e) => setNewQuoteDetails(e.target.value)}
                className="min-h-[80px]"
                data-testid="textarea-new-quote-details"
              />
            </div>

            <div className="border-2 border-dashed border-primary/30 rounded-lg p-4 space-y-3 bg-primary/5">
              <Label className="text-sm font-bold text-primary flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Photos Avant (requis)
              </Label>
              <div className="w-full overflow-hidden">
                <ObjectUploader
                  onUploadComplete={(files) => setQuoteMediaFiles(files)}
                  maxFiles={maxPhotos}
                  accept={{
                    'image/*': ['.jpg', '.jpeg', '.png', '.webp']
                  }}
                  label="Photos Avant"
                  data-testid="uploader-quote-media"
                  initialFiles={quoteMediaFiles.length > 0 ? quoteMediaFiles : undefined}
                />
              </div>
              {quoteMediaFiles.length > 0 && quoteMediaFiles.filter(f => f.type.startsWith('image/')).length < 1 && (
                <p className="text-xs text-destructive font-medium">
                  Au moins 1 image est requise.
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 pt-6 border-t mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setCreateQuoteDialog(false);
                setQuoteMediaFiles([]);
              }}
              className="w-full sm:w-auto order-2 sm:order-1"
              data-testid="button-cancel-new-quote"
            >
              Annuler
            </Button>
            <Button
              onClick={handleCreateNewQuote}
              disabled={
                createNewQuoteMutation.isPending || 
                !newQuoteClientId ||
                selectedServices.length === 0 ||
                newQuoteWheelPositions.length !== parseInt(newQuoteWheelCount)
              }
              className="w-full sm:w-auto order-1 sm:order-2"
              data-testid="button-save-new-quote"
            >
              {createNewQuoteMutation.isPending ? "Création..." : "Créer Devis"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LabelsPreview
        open={labelsPreviewOpen}
        onOpenChange={setLabelsPreviewOpen}
        documentNumber={selectedQuoteForLabels?.reference || selectedQuoteForLabels?.id || ""}
        onDownload={handleConfirmDownloadLabels}
        type="quote"
        wheelPositions={(selectedQuoteForLabels?.wheelPositions as string[]) || undefined}
      />

      <CreateClientDialog
        open={createClientDialog}
        onOpenChange={setCreateClientDialog}
        onClientCreated={handleClientCreated}
      />

      <SendEmailDialog
        open={!!emailDialogQuote}
        onOpenChange={(open) => {
          if (!open) {
            setEmailDialogQuote(null);
            setEmailDialogClient(null);
          }
        }}
        onSend={handleSendQuoteEmail}
        isPending={sendQuoteEmailMutation.isPending}
        defaultRecipient={emailDialogClient?.email || ""}
        defaultSubject={emailDialogQuote ? `Devis N°${emailDialogQuote.reference || emailDialogQuote.id.slice(0, 8).toUpperCase()} - MY JANTES - ${emailDialogQuote.quoteAmount ? parseFloat(emailDialogQuote.quoteAmount).toLocaleString("fr-FR", { style: "currency", currency: "EUR" }) : "0,00 €"}` : ""}
        defaultMessage={emailDialogQuote ? getDefaultEmailMessage(emailDialogQuote, emailDialogClient) : ""}
        type="quote"
        documentNumber={emailDialogQuote?.reference || emailDialogQuote?.id.slice(0, 8).toUpperCase() || ""}
        amount={emailDialogQuote?.quoteAmount ? parseFloat(emailDialogQuote.quoteAmount).toLocaleString("fr-FR", { style: "currency", currency: "EUR" }) : "0,00 €"}
      />


    </div>
  );
}
