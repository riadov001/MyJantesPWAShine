import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2, ArrowLeft, FileText } from "lucide-react";

export default function PublicPaymentSuccess() {
  const { token } = useParams<{ token: string }>();
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSessionId(params.get("session_id"));
  }, []);

  const { data: verification, isLoading } = useQuery({
    queryKey: ["/api/public/invoices", token, "payment-status", sessionId],
    queryFn: async () => {
      if (!token) return null;
      const url = sessionId
        ? `/api/public/invoices/${token}/payment-status?session_id=${sessionId}`
        : `/api/public/invoices/${token}/payment-status`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Erreur de v\u00E9rification");
      return res.json();
    },
    enabled: !!token,
    refetchInterval: (query) => {
      if (query.state.data?.invoiceStatus === "paid") return false;
      return 3000;
    },
  });

  const { data: invoiceData } = useQuery<{ invoice: any; garage: any }>({
    queryKey: ["/api/public/invoices", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/invoices/${token}`);
      if (!res.ok) throw new Error("Erreur");
      return res.json();
    },
    enabled: !!token,
  });

  const garageName = invoiceData?.garage?.name || "MY JANTES";
  const primaryColor = invoiceData?.garage?.primaryColor || "#dc2626";
  const isPaid = verification?.invoiceStatus === "paid";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/30">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-12 w-12 animate-spin" style={{ color: primaryColor }} />
            <p className="text-lg font-medium">V\u00E9rification du paiement...</p>
            <p className="text-sm text-muted-foreground">Veuillez patienter quelques instants</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted/30">
      <Card className="max-w-md w-full mx-4">
        <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
          {isPaid ? (
            <>
              <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-10 w-10 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold text-center" data-testid="text-payment-confirmed">
                Paiement r\u00E9ussi
              </h1>
              <p className="text-muted-foreground text-center">
                Votre paiement a \u00E9t\u00E9 trait\u00E9 avec succ\u00E8s. Merci pour votre confiance !
              </p>
              <p className="text-sm text-muted-foreground text-center">
                Un email de confirmation vous sera envoy\u00E9.
              </p>
            </>
          ) : (
            <>
              <Loader2 className="h-12 w-12 animate-spin" style={{ color: primaryColor }} />
              <h1 className="text-xl font-bold text-center">
                Traitement en cours...
              </h1>
              <p className="text-muted-foreground text-center text-sm">
                Votre paiement est en cours de traitement. Cette page se mettra \u00E0 jour automatiquement.
              </p>
            </>
          )}

          <div className="flex gap-3 mt-4 flex-wrap justify-center">
            <Button
              variant="outline"
              onClick={() => window.location.href = `/facture/${token}`}
              data-testid="button-back-invoice"
            >
              <FileText className="h-4 w-4 mr-2" />
              Voir la facture
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mt-4">{garageName}</p>
        </CardContent>
      </Card>
    </div>
  );
}
