import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard,
  Loader2,
  ArrowLeft,
  ShieldCheck,
  Receipt,
  AlertCircle,
} from "lucide-react";

let stripePromise: ReturnType<typeof loadStripe> | null = null;

function getStripePromise(publishableKey: string) {
  if (!stripePromise) {
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
}

interface PaymentFormProps {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
}

function PaymentForm({ invoiceId, invoiceNumber, amount }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);
    setErrorMessage(null);

    const baseUrl = window.location.origin;

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${baseUrl}/payment/success?invoice_id=${invoiceId}`,
      },
    });

    if (error) {
      setErrorMessage(error.message || "Une erreur est survenue lors du paiement.");
      toast({
        variant: "destructive",
        title: "Erreur de paiement",
        description: error.message || "Le paiement a échoué.",
      });
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="p-4 rounded-md border border-border bg-muted/30 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Facture</span>
          </div>
          <Badge variant="secondary" data-testid="badge-invoice-number">{invoiceNumber}</Badge>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">Montant à payer</span>
          <span className="text-xl font-bold font-mono" data-testid="text-payment-amount">
            {amount.toFixed(2)} €
          </span>
        </div>
      </div>

      <PaymentElement
        options={{
          layout: "tabs",
          business: { name: "MyJantes" },
        }}
      />

      {errorMessage && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span data-testid="text-payment-error">{errorMessage}</span>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        <span>Paiement sécurisé par Stripe. Vos données bancaires sont chiffrées.</span>
      </div>

      <Button
        type="submit"
        className="w-full"
        size="lg"
        disabled={!stripe || !elements || isProcessing}
        data-testid="button-confirm-payment"
      >
        {isProcessing ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Traitement en cours...</>
        ) : (
          <><CreditCard className="h-4 w-4 mr-2" />Confirmer le paiement</>
        )}
      </Button>
    </form>
  );
}

export default function PaymentCheckout() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [invoiceId, setInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("invoice_id");
    if (!id) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Aucune facture spécifiée pour le paiement.",
      });
      setLocation("/admin/invoices");
      return;
    }
    setInvoiceId(id);
  }, []);

  const { data: intentData, isLoading, error } = useQuery({
    queryKey: ["/api/payment/create-intent", invoiceId],
    queryFn: async () => {
      if (!invoiceId) return null;
      const res = await fetch("/api/payment/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId,
          paymentMethods: ["card", "klarna", "alma", "apple_pay", "google_pay", "link"],
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Erreur lors de la création du paiement");
      }
      return res.json();
    },
    enabled: !!invoiceId,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });

  if (!invoiceId || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-lg w-full mx-4">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-lg font-medium">Préparation du paiement...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !intentData?.clientSecret || !intentData?.publishableKey) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-lg w-full mx-4">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <p className="text-lg font-medium text-center">Impossible de préparer le paiement</p>
            <p className="text-sm text-muted-foreground text-center" data-testid="text-payment-init-error">
              {(error as Error)?.message || "Stripe n'est pas configuré ou la facture est invalide."}
            </p>
            <Button variant="outline" onClick={() => setLocation("/admin/invoices")} data-testid="button-back-from-error">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour aux factures
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stripePromise = getStripePromise(intentData.publishableKey);

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/admin/invoices")}
              data-testid="button-back-to-invoices"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <CardTitle className="text-xl" data-testid="text-checkout-title">Paiement sécurisé</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Carte, Klarna, Alma, Apple Pay, Google Pay
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret: intentData.clientSecret,
              appearance: {
                theme: "stripe",
                variables: {
                  colorPrimary: "#dc2626",
                  borderRadius: "6px",
                },
              },
              locale: "fr",
            }}
          >
            <PaymentForm
              invoiceId={invoiceId}
              invoiceNumber={intentData.invoiceNumber}
              amount={intentData.amount}
            />
          </Elements>
        </CardContent>
      </Card>
    </div>
  );
}
