import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CircleX, ArrowLeft, RefreshCcw } from "lucide-react";

export default function PaymentCancel() {
  const [, setLocation] = useLocation();

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full mx-4">
        <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="h-20 w-20 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
            <CircleX className="h-10 w-10 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold text-center" data-testid="text-payment-cancelled">
            Paiement annulé
          </h1>
          <p className="text-muted-foreground text-center">
            Le paiement a été annulé. Vous pouvez réessayer à tout moment depuis vos factures.
          </p>
          <div className="flex gap-3 mt-4 flex-wrap justify-center">
            <Button
              variant="outline"
              onClick={() => setLocation("/invoices")}
              data-testid="button-retry-payment"
            >
              <RefreshCcw className="h-4 w-4 mr-2" />
              Réessayer
            </Button>
            <Button
              onClick={() => setLocation("/")}
              data-testid="button-back-home"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
