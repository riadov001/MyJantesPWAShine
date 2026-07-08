import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2, FileText, ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSessionId(params.get("session_id"));
    setInvoiceId(params.get("invoice_id"));
  }, []);

  const { data: verification, isLoading } = useQuery({
    queryKey: ["/api/payment/verify", sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      const res = await fetch(`/api/payment/verify/${sessionId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Erreur de vérification");
      return res.json();
    },
    enabled: !!sessionId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-lg font-medium">Vérification du paiement...</p>
            <p className="text-sm text-muted-foreground">Veuillez patienter quelques instants</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full mx-4">
        <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-center" data-testid="text-payment-success">
            Paiement réussi
          </h1>
          <p className="text-muted-foreground text-center">
            Votre paiement a été traité avec succès. Merci !
          </p>
          {verification?.invoiceId && (
            <p className="text-sm text-muted-foreground">
              Facture ID: {verification.invoiceId.slice(0, 8).toUpperCase()}
            </p>
          )}
          <div className="flex gap-3 mt-4 flex-wrap justify-center">
            <Button
              variant="outline"
              onClick={() => setLocation("/invoices")}
              data-testid="button-back-invoices"
            >
              <FileText className="h-4 w-4 mr-2" />
              Mes factures
            </Button>
            <Button
              onClick={() => setLocation("/")}
              data-testid="button-back-dashboard"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Tableau de bord
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
