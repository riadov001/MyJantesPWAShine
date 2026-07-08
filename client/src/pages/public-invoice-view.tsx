import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Phone,
  Mail,
  MapPin,
  Loader2,
  CheckCircle,
  Clock,
  AlertCircle,
  CreditCard,
  Lock,
  ShieldCheck,
} from "lucide-react";

function formatPrice(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "0,00 \u20AC";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0,00 \u20AC";
  return num.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("fr-FR");
}

const statusLabels: Record<string, { label: string; className: string; icon: any }> = {
  pending: { label: "En attente", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", icon: Clock },
  paid: { label: "Pay\u00E9e", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", icon: CheckCircle },
  overdue: { label: "En retard", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", icon: AlertCircle },
  cancelled: { label: "Annul\u00E9e", className: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300", icon: AlertCircle },
};

export default function PublicInvoiceView() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [isPayLoading, setIsPayLoading] = useState(false);

  const { data, isLoading, error } = useQuery<{
    invoice: any;
    client: { name: string } | null;
    items: any[];
    garage: any;
  }>({
    queryKey: ["/api/public/invoices", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/invoices/${token}`);
      if (!res.ok) throw new Error("Facture introuvable");
      return res.json();
    },
    enabled: !!token,
  });

  const handlePayOnline = async () => {
    if (!token) return;
    setIsPayLoading(true);
    try {
      const res = await fetch(`/api/public/invoices/${token}/create-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethods: ["card", "klarna"] }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Erreur de paiement");
      }
      const { url } = await res.json();
      if (url) {
        window.location.href = url;
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
      setIsPayLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">Chargement de la facture...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="p-8 max-w-md text-center">
          <h2 className="text-xl font-semibold mb-2">Facture introuvable</h2>
          <p className="text-muted-foreground">Ce lien n'est plus valide ou la facture n'existe pas.</p>
        </Card>
      </div>
    );
  }

  const { invoice, client, items, garage } = data;
  const status = statusLabels[invoice.status] || statusLabels.pending;
  const StatusIcon = status.icon;
  const garageName = garage?.name || "MY JANTES";
  const primaryColor = garage?.primaryColor || "#dc2626";

  const totalHT = items.reduce((sum: number, item: any) => {
    const val = parseFloat(item.totalExcludingTax || "0");
    return sum + (isNaN(val) ? 0 : val);
  }, 0);
  const totalTTC = parseFloat(invoice.amount || "0");
  const tva = totalTTC - totalHT;

  const canPay = invoice.status !== "paid" && invoice.status !== "cancelled" && totalTTC > 0;

  return (
    <div className="min-h-screen bg-muted/30">
      <div
        className="py-6 px-4 text-center text-white"
        style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}cc 100%)` }}
      >
        <h1 className="text-2xl font-bold" data-testid="text-garage-name">{garageName}</h1>
        <p className="text-white/80 text-lg mt-1">{formatPrice(invoice.amount)}</p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <h2 className="text-xl font-bold" data-testid="text-invoice-title">FACTURE</h2>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${status.className}`} data-testid="text-invoice-status">
              <StatusIcon className="h-4 w-4" />
              {status.label}
            </span>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">N\u00B0 de facture :</span>
              <span className="font-medium" data-testid="text-invoice-number">{invoice.invoiceNumber || "-"}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Date :</span>
              <span>{formatDate(invoice.createdAt)}</span>
            </div>
            {invoice.dueDate && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">\u00C9ch\u00E9ance :</span>
                <span>{formatDate(invoice.dueDate)}</span>
              </div>
            )}
            {client && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Client :</span>
                <span data-testid="text-client-name">{client.name}</span>
              </div>
            )}
            {invoice.paymentMethod && invoice.status === "paid" && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Mode de paiement :</span>
                <span>
                  {invoice.paymentMethod === "card" || invoice.paymentMethod === "stripe"
                    ? "Carte bancaire"
                    : invoice.paymentMethod === "cash"
                    ? "Esp\u00E8ces"
                    : invoice.paymentMethod === "wire_transfer"
                    ? "Virement"
                    : invoice.paymentMethod}
                </span>
              </div>
            )}
          </div>
        </Card>

        {items.length > 0 && (
          <Card className="p-6">
            <h3 className="font-semibold mb-3">D\u00E9tail des prestations</h3>
            <div className="space-y-3">
              {items.map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between items-start gap-2 text-sm py-2 border-b last:border-0">
                  <div className="flex-1">
                    <p className="font-medium">{item.description}</p>
                    <p className="text-muted-foreground text-xs">
                      Qt\u00E9 : {item.quantity || "1"} {item.unitPriceExcludingTax ? `\u00D7 ${formatPrice(item.unitPriceExcludingTax)}` : ""}
                    </p>
                  </div>
                  <span className="font-medium whitespace-nowrap">{formatPrice(item.totalIncludingTax)}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Total HT</span>
                <span>{formatPrice(totalHT)}</span>
              </div>
              {tva > 0 && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Montant TVA</span>
                  <span>{formatPrice(tva)}</span>
                </div>
              )}
              <div className="flex justify-between gap-2 text-base font-bold pt-1">
                <span>Total d\u00FB</span>
                <span style={{ color: primaryColor }} data-testid="text-total-amount">{formatPrice(totalTTC)}</span>
              </div>
            </div>
          </Card>
        )}

        {invoice.status === "paid" && (
          <Card className="p-6 text-center space-y-2">
            <div className="flex items-center justify-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span className="font-semibold">Facture pay\u00E9e</span>
            </div>
            {invoice.paidAt && (
              <p className="text-sm text-muted-foreground">
                Pay\u00E9e le {formatDate(invoice.paidAt)}
              </p>
            )}
          </Card>
        )}

        {canPay && (
          <Card className="p-6 space-y-4">
            <div className="text-center space-y-2">
              <h3 className="font-semibold text-lg">Payer en ligne</h3>
              <p className="text-sm text-muted-foreground">
                R\u00E9glez votre facture en toute s\u00E9curit\u00E9 par carte bancaire
              </p>
            </div>

            <Button
              className="w-full text-white"
              style={{ backgroundColor: primaryColor }}
              onClick={handlePayOnline}
              disabled={isPayLoading}
              data-testid="button-pay-online"
            >
              {isPayLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CreditCard className="h-4 w-4 mr-2" />
              )}
              Payer {formatPrice(totalTTC)}
            </Button>

            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Paiement s\u00E9curis\u00E9
              </span>
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" />
                SSL
              </span>
            </div>

            {invoice.status === "overdue" && (
              <Badge variant="outline" className="w-full justify-center text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                <AlertCircle className="h-3 w-3 mr-1" />
                Facture en retard de paiement
              </Badge>
            )}
          </Card>
        )}

        {invoice.notes && (
          <Card className="p-6">
            <h3 className="font-semibold mb-2">Notes</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.notes}</p>
          </Card>
        )}

        {garage && (
          <div className="text-center text-xs text-muted-foreground space-y-1 pt-4 pb-8">
            <p className="font-medium">{garageName}</p>
            {garage.address && (
              <p className="flex items-center justify-center gap-1 flex-wrap">
                <MapPin className="h-3 w-3" />
                {garage.address}{garage.postalCode ? `, ${garage.postalCode}` : ""}{garage.city ? ` ${garage.city}` : ""}
              </p>
            )}
            {garage.phone && (
              <p className="flex items-center justify-center gap-1">
                <Phone className="h-3 w-3" />
                <a href={`tel:${garage.phone}`}>{garage.phone}</a>
              </p>
            )}
            {garage.email && (
              <p className="flex items-center justify-center gap-1">
                <Mail className="h-3 w-3" />
                <a href={`mailto:${garage.email}`}>{garage.email}</a>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
