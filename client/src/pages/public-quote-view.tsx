import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Download, Phone, Mail, MapPin, Loader2, CalendarCheck, Clock, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function formatPrice(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "0,00 \u20ac";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0,00 \u20ac";
  return num.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("fr-FR");
}

const statusLabels: Record<string, { label: string; className: string }> = {
  pending: { label: "En attente", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  approved: { label: "Approuvé", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  accepted: { label: "Accepté", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  rejected: { label: "Refusé", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  completed: { label: "Terminé", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
};

export default function PublicQuoteView() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();

  const { data, isLoading, error, refetch } = useQuery<{
    quote: any;
    client: { name: string; email: string } | null;
    items: any[];
    garage: any;
  }>({
    queryKey: ["/api/public/quotes", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/quotes/${token}`);
      if (!res.ok) throw new Error("Devis introuvable");
      return res.json();
    },
    enabled: !!token,
  });

  const { data: reservationData } = useQuery<{ reservation: any }>({
    queryKey: ["/api/public/quotes", token, "reservation"],
    queryFn: async () => {
      const res = await fetch(`/api/public/quotes/${token}/reservation`);
      if (!res.ok) return { reservation: null };
      return res.json();
    },
    enabled: !!token && data?.quote?.status === "accepted",
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/public/quotes/${token}/accept`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Devis accepté !", description: "Merci pour votre confiance." });
      refetch();
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/public/quotes/${token}/reject`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Devis refusé", description: "Le devis a été refusé." });
      refetch();
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">Chargement du devis...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="p-8 max-w-md text-center">
          <h2 className="text-xl font-semibold mb-2">Devis introuvable</h2>
          <p className="text-muted-foreground">Ce lien n'est plus valide ou le devis n'existe pas.</p>
        </Card>
      </div>
    );
  }

  const { quote, client, items, garage } = data;
  const status = statusLabels[quote.status] || statusLabels.pending;
  const garageName = garage?.name || "MY JANTES";
  const primaryColor = garage?.primaryColor || "#dc2626";

  const totalHT = items.reduce((sum: number, item: any) => {
    const val = parseFloat(item.totalExcludingTax || "0");
    return sum + (isNaN(val) ? 0 : val);
  }, 0);
  const totalTTC = parseFloat(quote.quoteAmount || "0");
  const tva = totalTTC - totalHT;

  return (
    <div className="min-h-screen bg-muted/30">
      <div
        className="py-6 px-4 text-center text-white"
        style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}cc 100%)` }}
      >
        <h1 className="text-2xl font-bold" data-testid="text-garage-name">{garageName}</h1>
        <p className="text-white/80 text-lg mt-1">{formatPrice(quote.quoteAmount)}</p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <h2 className="text-xl font-bold" data-testid="text-quote-title">DEVIS</h2>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${status.className}`} data-testid="text-quote-status">
              {quote.status === "accepted" && <Check className="h-4 w-4" />}
              {status.label}
            </span>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">N° de devis :</span>
              <span className="font-medium" data-testid="text-quote-reference">{quote.reference || "-"}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Date :</span>
              <span>{formatDate(quote.createdAt)}</span>
            </div>
            {quote.validUntil && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Valide jusqu'au :</span>
                <span>{formatDate(quote.validUntil)}</span>
              </div>
            )}
            {client && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Destinataire :</span>
                <span data-testid="text-client-name">{client.name}</span>
              </div>
            )}
          </div>
        </Card>

        {(quote.vehicleRegistration || quote.vehicleMake || quote.vehicleModel || quote.vehicleVin ||
          quote.vehicleFuelType || quote.vehicleFiscalPower || quote.vehicleFirstRegDate || quote.vehicleColor) && (
          <Card className="p-6">
            <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide" style={{ color: primaryColor }}>
              Véhicule
            </h3>
            <p className="font-semibold text-sm" data-testid="text-vehicle-primary">
              {[quote.vehicleRegistration, [quote.vehicleMake, quote.vehicleModel].filter(Boolean).join(" "), quote.vehicleVin]
                .filter(Boolean)
                .join(" – ")
                .toUpperCase()}
            </p>
            <p className="text-xs text-muted-foreground mt-1" data-testid="text-vehicle-secondary">
              {[
                quote.vehicleVin ? `VIN: ${quote.vehicleVin}` : null,
                quote.vehicleFuelType ? `Carburant: ${quote.vehicleFuelType}` : null,
                quote.vehicleFiscalPower ? `${quote.vehicleFiscalPower} CV` : null,
                quote.vehicleColor ? `Couleur: ${quote.vehicleColor}` : null,
                quote.vehicleFirstRegDate ? `1ère MEC: ${quote.vehicleFirstRegDate}` : null,
              ]
                .filter(Boolean)
                .join(" • ")}
            </p>
          </Card>
        )}

        {items.length > 0 && (
          <Card className="p-6">
            <h3 className="font-semibold mb-3">Détail des prestations</h3>
            <div className="space-y-3">
              {items.map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between items-start gap-2 text-sm py-2 border-b last:border-0">
                  <div className="flex-1">
                    <p className="font-medium">{item.description}</p>
                    <p className="text-muted-foreground text-xs">
                      Qté : {item.quantity || "1"} {item.unitPriceExcludingTax ? `× ${formatPrice(item.unitPriceExcludingTax)}` : ""}
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
                <span>Total dû</span>
                <span style={{ color: primaryColor }} data-testid="text-total-amount">{formatPrice(totalTTC)}</span>
              </div>
            </div>
          </Card>
        )}

        {quote.status === "approved" && (
          <Card className="p-6 space-y-3">
            <Button
              className="w-full text-white"
              style={{ backgroundColor: primaryColor }}
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isPending}
              data-testid="button-accept-quote"
            >
              {acceptMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Accepter le devis
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => rejectMutation.mutate()}
              disabled={rejectMutation.isPending}
              data-testid="button-reject-quote"
            >
              {rejectMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <X className="h-4 w-4 mr-2" />
              )}
              Refuser
            </Button>
          </Card>
        )}

        {quote.status === "accepted" && (
          <Card className="p-6 space-y-3">
            <div className="flex items-center justify-center gap-2 text-green-600">
              <Check className="h-5 w-5" />
              <span className="font-semibold">Devis accept{'é'}</span>
            </div>

            {reservationData?.reservation ? (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{reservationData.reservation.reference}</span>
                  <Badge className={
                    reservationData.reservation.status === "confirmed"
                      ? "bg-green-100 text-green-800"
                      : reservationData.reservation.status === "pending"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-blue-100 text-blue-800"
                  } data-testid="badge-res-status">
                    {reservationData.reservation.status === "confirmed" ? "Confirmé" : reservationData.reservation.status === "pending" ? "En attente" : reservationData.reservation.status}
                  </Badge>
                </div>
                <div className="text-sm space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span data-testid="text-res-service">{reservationData.reservation.service}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span data-testid="text-res-date">{new Date(reservationData.reservation.scheduledDate).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span data-testid="text-res-time">
                      {new Date(reservationData.reservation.scheduledDate).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      {reservationData.reservation.estimatedEndDate ? ` - ${new Date(reservationData.reservation.estimatedEndDate).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 pt-2">
                <p className="text-sm text-center text-muted-foreground">
                  Réservez votre créneau pour fixer votre rendez-vous.
                </p>
                <a href={`/reservation/${token}`} className="block">
                  <Button
                    className="w-full text-white"
                    style={{ backgroundColor: primaryColor }}
                    data-testid="button-book-slot"
                  >
                    <CalendarCheck className="h-4 w-4 mr-2" />
                    Réserver votre créneau
                  </Button>
                </a>
                {garage?.phone && (
                  <p className="text-xs text-center text-muted-foreground">
                    ou appelez-nous au <a href={`tel:${garage.phone}`} className="font-medium underline" style={{ color: primaryColor }}>{garage.phone}</a>
                  </p>
                )}
              </div>
            )}
          </Card>
        )}

        <a
          href={`/api/public/quotes/${token}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 text-sm font-medium py-2 hover:underline"
          style={{ color: primaryColor }}
          data-testid="link-download-pdf"
        >
          <Download className="h-4 w-4" />
          Télécharger le PDF
        </a>

        {garage && (
          <div className="text-center text-xs text-muted-foreground space-y-1 pt-4 pb-8">
            <p className="font-medium">{garageName}</p>
            {garage.address && (
              <p className="flex items-center justify-center gap-1">
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
