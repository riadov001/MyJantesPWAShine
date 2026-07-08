import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FileText, Download, Clock, CheckCircle, XCircle, AlertCircle, CreditCard, Loader2, Landmark, SplitSquareHorizontal, FileCode, ExternalLink } from "lucide-react";
import type { Invoice } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { generateInvoicePDF } from "@/lib/pdf-generator";
import { apiRequest } from "@/lib/queryClient";

export default function ClientInvoices() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading } = useAuth();
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Non autorisé",
        description: "Vous devez être connecté pour accéder à cette page.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
    enabled: isAuthenticated,
  });

  // Track views when invoices are loaded - mark each as viewed by client
  useEffect(() => {
    if (invoices.length > 0) {
      invoices.forEach(invoice => {
        fetch(`/api/invoices/${invoice.id}/track-view`, { method: "POST", credentials: "include" }).catch(() => {});
      });
    }
  }, [invoices]);

  const { data: paymentConfig } = useQuery<{ stripeConfigured: boolean; publishableKey: string | null }>({
    queryKey: ["/api/payment/config"],
    enabled: isAuthenticated,
  });

  const downloadPDFMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      return await apiRequest("GET", `/api/invoices/${invoiceId}/pdf`, undefined);
    },
    onSuccess: async (data: any) => {
      try {
        await generateInvoicePDF(data.invoice, data.client, data.quote, data.service, data.items, data.settings);
        toast({
          title: "Succès",
          description: "La facture a été téléchargée",
        });
      } catch (error) {
        toast({
          title: "Erreur",
          description: "Erreur lors de la génération du PDF",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message || "Échec du téléchargement de la facture",
        variant: "destructive",
      });
    },
  });

  const downloadFacturX = async (invoiceId: string, invoiceNumber: string) => {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/facturx`, { credentials: "include" });
      if (!res.ok) throw new Error("Erreur de téléchargement");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `facturx-${invoiceNumber}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Succès", description: "Facture électronique téléchargée (Factur-X XML)" });
    } catch {
      toast({ title: "Erreur", description: "Impossible de télécharger la facture électronique", variant: "destructive" });
    }
  };

  const payMutation = useMutation({
    mutationFn: async ({ invoiceId, paymentMethods }: { invoiceId: string; paymentMethods: string[] }) => {
      setPayingInvoiceId(invoiceId);
      const res = await apiRequest("POST", "/api/payment/create-checkout", {
        invoiceId,
        paymentMethods,
      });
      return res;
    },
    onSuccess: (data: any) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      setPayingInvoiceId(null);
      toast({
        variant: "destructive",
        title: "Erreur de paiement",
        description: error.message || "Impossible d'initier le paiement",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> En attente</Badge>;
      case "paid":
        return <Badge variant="default" className="gap-1 bg-green-600"><CheckCircle className="h-3 w-3" /> Payée</Badge>;
      case "overdue":
        return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> En retard</Badge>;
      case "cancelled":
        return <Badge variant="outline" className="gap-1"><XCircle className="h-3 w-3" /> Annulée</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case "cash": return "Espèces";
      case "wire_transfer": return "Virement";
      case "card": return "Carte";
      case "stripe": return "Stripe";
      case "sepa": return "SEPA";
      case "klarna": return "Klarna";
      case "alma": return "Alma";
      default: return method;
    }
  };

  const handleViewOnline = async (invoiceId: string) => {
    try {
      const res = await apiRequest("POST", `/api/invoices/${invoiceId}/view-link`);
      const data = await res.json();
      window.open(data.viewUrl, '_blank');
    } catch (error: any) {
      toast({ title: "Erreur", description: "Impossible de générer le lien", variant: "destructive" });
    }
  };

  const canPay = (invoice: Invoice) => {
    return paymentConfig?.stripeConfigured && (invoice.status === "pending" || invoice.status === "overdue");
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold" data-testid="text-client-invoices-title">Mes Factures</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">Consultez, téléchargez et payez vos factures</p>
      </div>

      {invoicesLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-lg font-medium mb-2">Aucune facture</p>
            <p className="text-muted-foreground">Vous n'avez pas encore de facture.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {invoices.map((invoice) => (
            <Card key={invoice.id} className="hover-elevate" data-testid={`invoice-card-${invoice.id}`}>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-lg">Facture #{invoice.invoiceNumber || invoice.id.slice(0, 8).toUpperCase()}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Créée le {format(new Date(invoice.createdAt!), "d MMMM yyyy", { locale: fr })}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(invoice.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  {invoice.amount && (
                    <div>
                      <p className="text-muted-foreground">Montant TTC</p>
                      <p className="font-medium font-mono">{parseFloat(invoice.amount).toFixed(2)} €</p>
                    </div>
                  )}
                  {invoice.paymentMethod && (
                    <div>
                      <p className="text-muted-foreground">Mode de paiement</p>
                      <p className="font-medium">{getPaymentMethodLabel(invoice.paymentMethod)}</p>
                    </div>
                  )}
                  {invoice.dueDate && (
                    <div>
                      <p className="text-muted-foreground">Échéance</p>
                      <p className="font-medium">
                        {format(new Date(invoice.dueDate), "d MMM yyyy", { locale: fr })}
                      </p>
                    </div>
                  )}
                  {invoice.paidAt && (
                    <div>
                      <p className="text-muted-foreground">Payée le</p>
                      <p className="font-medium">
                        {format(new Date(invoice.paidAt), "d MMM yyyy", { locale: fr })}
                      </p>
                    </div>
                  )}
                </div>

                {invoice.notes && (
                  <div className="p-3 bg-muted rounded-md">
                    <p className="text-sm">{invoice.notes}</p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2">
                  {canPay(invoice) && (
                    <>
                      <Button
                        onClick={() => payMutation.mutate({ invoiceId: invoice.id, paymentMethods: ["card", "sepa"] })}
                        disabled={payMutation.isPending && payingInvoiceId === invoice.id}
                        data-testid={`button-pay-invoice-${invoice.id}`}
                      >
                        {payMutation.isPending && payingInvoiceId === invoice.id ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Redirection...</>
                        ) : (
                          <><CreditCard className="h-4 w-4 mr-2" />Payer par carte</>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => payMutation.mutate({ invoiceId: invoice.id, paymentMethods: ["sepa"] })}
                        disabled={payMutation.isPending && payingInvoiceId === invoice.id}
                        data-testid={`button-pay-sepa-${invoice.id}`}
                      >
                        <Landmark className="h-4 w-4 mr-2" />
                        Payer par virement SEPA
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setLocation(`/payment/checkout?invoice_id=${invoice.id}`)}
                        data-testid={`button-pay-installment-${invoice.id}`}
                      >
                        <SplitSquareHorizontal className="h-4 w-4 mr-2" />
                        Payer en plusieurs fois
                      </Button>
                    </>
                  )}
                  <Button
                    variant="outline"
                    className="flex-1 sm:flex-initial"
                    onClick={() => handleViewOnline(invoice.id)}
                    data-testid={`button-view-online-invoice-${invoice.id}`}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Consulter en ligne
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 sm:flex-initial"
                    onClick={() => downloadPDFMutation.mutate(invoice.id)}
                    disabled={downloadPDFMutation.isPending}
                    data-testid={`button-download-invoice-${invoice.id}`}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {downloadPDFMutation.isPending ? "Téléchargement..." : "Télécharger PDF"}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 sm:flex-initial"
                    onClick={() => downloadFacturX(invoice.id, invoice.invoiceNumber)}
                    data-testid={`button-download-facturx-${invoice.id}`}
                  >
                    <FileCode className="h-4 w-4 mr-2" />
                    Facture Électronique
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
