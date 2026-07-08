import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Star, Phone, Mail, MapPin, Loader2, CheckCircle } from "lucide-react";

export default function PublicReview() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<{
    reviewToken: string;
    hasReview: boolean;
    rating: number | null;
    invoiceNumber: string | null;
    clientName: string | null;
    garage: any;
  }>({
    queryKey: ["/api/public/reviews", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/reviews/${token}`);
      if (!res.ok) throw new Error("Lien invalide");
      return res.json();
    },
    enabled: !!token,
  });

  const reviewMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/public/reviews/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Merci !", description: "Votre avis a été enregistré." });
      setReviewSubmitted(true);
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
          <p className="mt-4 text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="p-8 max-w-md text-center">
          <h2 className="text-xl font-semibold mb-2">Lien invalide</h2>
          <p className="text-muted-foreground">Ce lien d'avis n'est plus valide ou n'existe pas.</p>
        </Card>
      </div>
    );
  }

  const { garage, hasReview, invoiceNumber, clientName } = data;
  const garageName = garage?.name || "MY JANTES";
  const primaryColor = garage?.primaryColor || "#dc2626";
  const alreadyReviewed = hasReview || reviewSubmitted;

  return (
    <div className="min-h-screen bg-muted/30">
      <div
        className="py-8 px-4 text-center text-white"
        style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}cc 100%)` }}
      >
        <h1 className="text-2xl font-bold" data-testid="text-garage-name">{garageName}</h1>
        <p className="text-white/80 text-sm mt-1">L'EXPERT DE LA JANTE ALU</p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {alreadyReviewed ? (
          <Card className="p-8 text-center">
            <CheckCircle className="h-12 w-12 mx-auto mb-4" style={{ color: primaryColor }} />
            <h2 className="text-xl font-semibold mb-2">Merci pour votre avis !</h2>
            <p className="text-muted-foreground mb-6">Votre retour nous est précieux et nous aide à améliorer nos services.</p>
            
            {(data.rating && data.rating >= 4) && (
              <div className="pt-4 border-t border-border">
                <p className="text-sm font-medium mb-3">Souhaitez-vous également nous soutenir sur Google ?</p>
                <Button asChild className="w-full sm:w-auto">
                  <a href="https://share.google/O0VCgqh0z1Ab4qUF9" target="_blank" rel="noopener noreferrer">
                    Partager sur Google
                  </a>
                </Button>
              </div>
            )}
          </Card>
        ) : (
          <Card className="p-6">
            <div className="text-center mb-6">
              <h2 className="text-xl font-semibold mb-2">Donnez-nous votre avis</h2>
              {clientName && (
                <p className="text-muted-foreground text-sm">Bonjour {clientName},</p>
              )}
              <p className="text-muted-foreground text-sm">
                {invoiceNumber
                  ? `Comment s'est passée votre expérience pour la facture ${invoiceNumber} ?`
                  : "Votre retour nous aide à améliorer nos services."}
              </p>
            </div>

            <div className="flex gap-1 mb-6 justify-center" data-testid="rating-stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 transition-colors"
                  data-testid={`button-star-${star}`}
                >
                  <Star
                    className={`h-10 w-10 transition-colors ${
                      star <= (hoverRating || rating)
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground/30"
                    }`}
                  />
                </button>
              ))}
            </div>

            {rating > 0 && (
              <p className="text-center text-sm text-muted-foreground mb-4">
                {rating === 1 && "Très insatisfait"}
                {rating === 2 && "Insatisfait"}
                {rating === 3 && "Correct"}
                {rating === 4 && "Satisfait"}
                {rating === 5 && "Très satisfait"}
              </p>
            )}

            <Textarea
              placeholder="Partagez votre expérience (optionnel)..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="mb-4 resize-none"
              rows={4}
              data-testid="input-review-comment"
            />

            <Button
              className="w-full text-white"
              style={{ backgroundColor: primaryColor }}
              onClick={() => reviewMutation.mutate()}
              disabled={rating === 0 || reviewMutation.isPending}
              data-testid="button-submit-review"
            >
              {reviewMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Envoyer mon avis
            </Button>
          </Card>
        )}

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
