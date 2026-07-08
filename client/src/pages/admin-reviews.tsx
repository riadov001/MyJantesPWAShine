import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Star, Trash2, Loader2, CheckCircle, ExternalLink, Share2 } from "lucide-react";

const GOOGLE_REVIEW_LINK = "https://share.google/O0VCgqh0z1Ab4qUF9";

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${
            star <= rating
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}

export default function AdminReviews() {
  const { toast } = useToast();

  const { data: reviews, isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/reviews"],
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/admin/reviews/${id}/approve`);
    },
    onSuccess: () => {
      toast({ title: "Avis approuvé" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reviews"] });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/reviews/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Avis supprimé" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reviews"] });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const validReviews = (reviews || []).filter((r: any) => r.rating > 0);
  const pendingReviews = (reviews || []).filter((r: any) => r.rating === 0);

  const avgRating = validReviews.length > 0
    ? (validReviews.reduce((sum: number, r: any) => sum + r.rating, 0) / validReviews.length).toFixed(1)
    : "-";

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Avis Clients</h1>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" asChild>
            <a href={GOOGLE_REVIEW_LINK} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Voir sur Google
            </a>
          </Button>
        </div>
      </div>

      <Card className="p-4 border-2 border-blue-100 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex gap-0.5">
              <span className="text-2xl font-bold text-[#4285F4]">G</span>
              <span className="text-2xl font-bold text-[#EA4335]">o</span>
              <span className="text-2xl font-bold text-[#FBBC05]">o</span>
              <span className="text-2xl font-bold text-[#4285F4]">g</span>
              <span className="text-2xl font-bold text-[#34A853]">l</span>
              <span className="text-2xl font-bold text-[#EA4335]">e</span>
            </div>
            <div>
              <p className="font-semibold text-sm">Partagez votre lien Google</p>
              <p className="text-xs text-muted-foreground">Permettez à vos clients de laisser un avis directement sur Google</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button asChild size="sm">
              <a href={GOOGLE_REVIEW_LINK} target="_blank" rel="noopener noreferrer">
                <Share2 className="h-4 w-4 mr-2" />
                Laisser un avis Google
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(GOOGLE_REVIEW_LINK);
              }}
              data-testid="button-copy-google-link"
            >
              Copier le lien
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total avis</p>
          <p className="text-2xl font-bold" data-testid="text-total-reviews">{validReviews.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Note moyenne</p>
          <div className="flex items-center gap-2">
            <p className="text-2xl font-bold" data-testid="text-avg-rating">{avgRating}</p>
            {validReviews.length > 0 && <Star className="h-5 w-5 fill-amber-400 text-amber-400" />}
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Approuvés</p>
          <p className="text-2xl font-bold" data-testid="text-approved-reviews">
            {validReviews.filter(r => r.isApproved).length}
          </p>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : validReviews.length === 0 ? (
        <Card className="p-8 text-center">
          <Star className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">Aucun avis pour le moment.</p>
          <p className="text-sm text-muted-foreground mt-1">Les avis apparaîtront ici lorsque vos clients les soumettront après le paiement de leurs factures.</p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>Commentaire</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {validReviews.map((review: any) => (
                <TableRow key={review.id} data-testid={`row-review-${review.id}`}>
                  <TableCell className="font-medium" data-testid={`text-client-${review.id}`}>
                    {review.clientName || "Client"}
                  </TableCell>
                  <TableCell data-testid={`rating-${review.id}`}>
                    <StarRating rating={review.rating} />
                  </TableCell>
                  <TableCell className="max-w-xs truncate" data-testid={`text-comment-${review.id}`}>
                    {review.comment || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell>
                    {review.isApproved ? (
                      <div className="flex flex-col gap-1">
                        <span className="flex items-center text-emerald-600 text-sm font-medium">
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Approuvé
                        </span>
                        {review.rating >= 4 && (
                          <span className="text-[10px] text-muted-foreground italic">Email Google envoyé</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">En attente</span>
                    )}
                  </TableCell>
                  <TableCell data-testid={`text-date-${review.id}`}>
                    {formatDate(review.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {!review.isApproved && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-emerald-600"
                          onClick={() => approveMutation.mutate(review.id)}
                          disabled={approveMutation.isPending}
                          data-testid={`button-approve-${review.id}`}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Supprimer cet avis ?")) {
                            deleteMutation.mutate(review.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-${review.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
