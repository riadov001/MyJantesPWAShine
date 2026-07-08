import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  CreditCard,
  Landmark,
  CheckCircle,
  Clock,
  AlertCircle,
  Link2,
  Copy,
  ExternalLink,
  Loader2,
  Banknote,
  TrendingUp,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Invoice } from "@shared/schema";

interface PaymentRecord {
  invoiceId: string;
  invoiceNumber: string;
  amount: string;
  status: string;
  paymentMethod: string;
  stripePaymentIntentId: string | null;
  paidAt: string | null;
  clientName: string;
  clientEmail: string;
  createdAt: string;
}

export default function AdminPayments() {
  const { toast } = useToast();
  const [generateLinkDialog, setGenerateLinkDialog] = useState<string | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [klarnaByInvoice, setKlarnaByInvoice] = useState<Record<string, boolean>>({});

  const { data: paymentConfig } = useQuery<{ stripeConfigured: boolean; publishableKey: string | null }>({
    queryKey: ["/api/payment/config"],
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery<PaymentRecord[]>({
    queryKey: ["/api/admin/payments"],
  });

  const { data: pendingInvoices = [], isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/admin/invoices"],
    select: (data: any[]) => data.filter((inv: any) => inv.status === "pending" || inv.status === "overdue"),
  });

  const generateLinkMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const withKlarna = klarnaByInvoice[invoiceId] ?? false;
      const methods = withKlarna ? ["card", "klarna"] : ["card"];
      return await apiRequest("POST", "/api/admin/payment/generate-link", {
        invoiceId,
        paymentMethods: methods,
      });
    },
    onSuccess: (data: any) => {
      setGeneratedLink(data.paymentLink);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invoices"] });
      toast({
        title: "Lien généré",
        description: `Lien de paiement créé pour la facture ${data.invoiceNumber}`,
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error.message || "Impossible de générer le lien de paiement",
      });
    },
  });

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link).then(() => {
      toast({
        title: "Copié",
        description: "Lien de paiement copié dans le presse-papier",
      });
    });
  };

  const totalPaid = payments
    .filter(p => p.status === "paid")
    .reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);

  const totalPending = pendingInvoices
    .reduce((sum, inv) => sum + parseFloat(inv.amount || "0"), 0);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2" data-testid="text-payments-title">
          <CreditCard className="h-7 w-7" />
          Paiements en ligne
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gérez les paiements Stripe et SEPA de vos clients
        </p>
      </div>

      {!paymentConfig?.stripeConfigured && (
        <Card className="border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/20">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-orange-800 dark:text-orange-200">Stripe non configuré</p>
                <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                  Ajoutez les clés STRIPE_SECRET_KEY et STRIPE_PUBLISHABLE_KEY dans les secrets pour activer les paiements en ligne.
                  Vous pouvez aussi ajouter STRIPE_WEBHOOK_SECRET pour les notifications automatiques.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">Total encaissé (Stripe)</p>
                <p className="text-2xl font-bold font-mono" data-testid="text-total-paid">{totalPaid.toFixed(2)} €</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">En attente de paiement</p>
                <p className="text-2xl font-bold font-mono" data-testid="text-total-pending">{totalPending.toFixed(2)} €</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <Clock className="h-5 w-5 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">Paiements reçus</p>
                <p className="text-2xl font-bold" data-testid="text-payment-count">{payments.filter(p => p.status === "paid").length}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Banknote className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {paymentConfig?.stripeConfigured && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Factures en attente - Générer un lien de paiement
            </CardTitle>
          </CardHeader>
          <CardContent>
            {invoicesLoading ? (
              <Skeleton className="h-32" />
            ) : pendingInvoices.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">Aucune facture en attente de paiement</p>
            ) : (
              <div className="space-y-2">
                {pendingInvoices.map((invoice: any) => (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between gap-4 p-3 rounded-md border border-border flex-wrap"
                    data-testid={`pending-invoice-${invoice.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge variant="secondary" className="shrink-0">{invoice.invoiceNumber}</Badge>
                      <span className="text-sm truncate">
                        {invoice.clientName || "Client"}
                      </span>
                      <span className="font-mono text-sm font-medium">
                        {parseFloat(invoice.amount).toFixed(2)} €
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      {/* Toggle Klarna */}
                      <div className="flex items-center gap-1.5">
                        <Switch
                          id={`klarna-${invoice.id}`}
                          checked={klarnaByInvoice[invoice.id] ?? false}
                          onCheckedChange={(v) =>
                            setKlarnaByInvoice(prev => ({ ...prev, [invoice.id]: v }))
                          }
                        />
                        <label htmlFor={`klarna-${invoice.id}`} className="text-xs text-muted-foreground cursor-pointer select-none">
                          Klarna (3x)
                        </label>
                      </div>
                      {invoice.paymentLink ? (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copyLink(invoice.paymentLink)}
                            data-testid={`button-copy-link-${invoice.id}`}
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            Copier
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(invoice.paymentLink, "_blank")}
                            data-testid={`button-open-link-${invoice.id}`}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Ouvrir
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setGenerateLinkDialog(invoice.id);
                              generateLinkMutation.mutate(invoice.id);
                            }}
                            disabled={generateLinkMutation.isPending}
                          >
                            <Link2 className="h-3 w-3 mr-1" />
                            Regénérer
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => {
                            setGenerateLinkDialog(invoice.id);
                            generateLinkMutation.mutate(invoice.id);
                          }}
                          disabled={generateLinkMutation.isPending}
                          data-testid={`button-generate-link-${invoice.id}`}
                        >
                          {generateLinkMutation.isPending && generateLinkDialog === invoice.id ? (
                            <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Génération...</>
                          ) : (
                            <><Link2 className="h-3 w-3 mr-1" />Générer lien</>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Historique des paiements en ligne
          </CardTitle>
        </CardHeader>
        <CardContent>
          {paymentsLoading ? (
            <Skeleton className="h-32" />
          ) : payments.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">Aucun paiement en ligne enregistré</p>
          ) : (
            <div className="space-y-2">
              {payments.map((payment) => (
                <div
                  key={payment.invoiceId}
                  className="flex items-center justify-between gap-4 p-3 rounded-md border border-border flex-wrap"
                  data-testid={`payment-record-${payment.invoiceId}`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-wrap">
                    <Badge variant="secondary" className="shrink-0">{payment.invoiceNumber}</Badge>
                    <span className="text-sm">{payment.clientName}</span>
                    <span className="text-xs text-muted-foreground">{payment.clientEmail}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-sm font-medium">
                      {parseFloat(payment.amount).toFixed(2)} €
                    </span>
                    <Badge
                      variant={payment.status === "paid" ? "default" : "secondary"}
                      className={payment.status === "paid" ? "bg-green-600 gap-1" : "gap-1"}
                    >
                      {payment.status === "paid" ? (
                        <><CheckCircle className="h-3 w-3" /> Payé</>
                      ) : (
                        <><Clock className="h-3 w-3" /> {payment.status}</>
                      )}
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      {payment.paymentMethod === "stripe" ? (
                        <><CreditCard className="h-3 w-3" /> Carte</>
                      ) : payment.paymentMethod === "sepa" ? (
                        <><Landmark className="h-3 w-3" /> SEPA</>
                      ) : payment.paymentMethod === "klarna" ? (
                        <><Banknote className="h-3 w-3" /> Klarna</>
                      ) : payment.paymentMethod === "alma" ? (
                        <><Banknote className="h-3 w-3" /> Alma</>
                      ) : (
                        payment.paymentMethod
                      )}
                    </Badge>
                    {payment.paidAt && (
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(payment.paidAt), "d MMM yyyy HH:mm", { locale: fr })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!generatedLink} onOpenChange={() => setGeneratedLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lien de paiement généré</DialogTitle>
            <DialogDescription>
              Partagez ce lien avec votre client pour qu'il puisse payer en ligne.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Lien de paiement</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={generatedLink || ""}
                  readOnly
                  className="font-mono text-xs"
                  data-testid="input-payment-link"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generatedLink && copyLink(generatedLink)}
                  data-testid="button-copy-generated-link"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setGeneratedLink(null)}
              >
                Fermer
              </Button>
              <Button
                onClick={() => generatedLink && window.open(generatedLink, "_blank")}
                data-testid="button-test-payment-link"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Tester le lien
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
