import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Paperclip, ChevronLeft, ChevronRight, Search, RefreshCw } from "lucide-react";
import { format, differenceInHours } from "date-fns";
import { fr } from "date-fns/locale";

interface SentEmail {
  id: string;
  resendId: string | null;
  from: string;
  to: string;
  subject: string;
  status: string;
  source: string | null;
  attachmentsCount: number;
  sentAt: string;
}

interface AppSentResponse {
  emails: SentEmail[];
  total: number;
  limit: number;
  offset: number;
}

const SOURCE_COLORS: Record<string, string> = {
  rapport: "bg-blue-100 text-blue-800",
  backup: "bg-violet-100 text-violet-800",
  devis: "bg-amber-100 text-amber-800",
  facture: "bg-green-100 text-green-800",
  photos: "bg-pink-100 text-pink-800",
  comptabilite: "bg-indigo-100 text-indigo-800",
  test: "bg-gray-100 text-gray-700",
};

const SOURCE_LABELS: Record<string, string> = {
  rapport: "Rapport",
  backup: "Sauvegarde",
  devis: "Devis",
  facture: "Facture",
  photos: "Photos",
  comptabilite: "Comptabilité",
  test: "Test",
};

export default function AdminMailingAppSent() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const limit = 50;

  const { data, isLoading, refetch } = useQuery<AppSentResponse>({
    queryKey: ["mailing-app-sent", page],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/mailing/app-sent?limit=${limit}&offset=${page * limit}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Erreur chargement emails envoyés");
      return res.json();
    },
    staleTime: 30_000,
  });

  const emails = data?.emails ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const filtered = search.trim()
    ? emails.filter(
        (e) =>
          e.to.toLowerCase().includes(search.toLowerCase()) ||
          e.subject.toLowerCase().includes(search.toLowerCase()) ||
          (e.source ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : emails;

  const isNew = (sentAt: string) =>
    differenceInHours(new Date(), new Date(sentAt)) < 24;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Send className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">App Mail Sent</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Actualiser
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base font-semibold">
              {isLoading
                ? "Chargement…"
                : `${total.toLocaleString("fr-FR")} email${total > 1 ? "s" : ""} enregistré${total > 1 ? "s" : ""}`}
            </CardTitle>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher destinataire, sujet, source…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">À</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sujet</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Source</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Statut</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">PJ</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-muted-foreground">
                      Chargement…
                    </td>
                  </tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-muted-foreground">
                      Aucun email enregistré pour le moment
                    </td>
                  </tr>
                )}
                {filtered.map((email, idx) => (
                  <tr
                    key={email.id}
                    className={`border-b transition-colors hover:bg-muted/30 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                  >
                    <td className="px-4 py-3 max-w-[200px]">
                      <div className="flex items-center gap-2">
                        {isNew(email.sentAt) && (
                          <span className="inline-block w-2 h-2 rounded-full bg-red-500 shrink-0" title="Moins de 24h" />
                        )}
                        <span className="font-mono text-xs truncate">{email.to}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[260px]">
                      <span className="line-clamp-1">{email.subject}</span>
                    </td>
                    <td className="px-4 py-3">
                      {email.source ? (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            SOURCE_COLORS[email.source] ?? "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {SOURCE_LABELS[email.source] ?? email.source}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          email.status === "sent"
                            ? "bg-blue-100 text-blue-800"
                            : email.status === "failed"
                            ? "bg-red-100 text-red-800"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {email.status === "sent"
                          ? "Envoyé"
                          : email.status === "failed"
                          ? "Échoué"
                          : email.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {email.attachmentsCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Paperclip className="h-3.5 w-3.5" />
                          <span>{email.attachmentsCount}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                      {email.sentAt
                        ? format(new Date(email.sentAt), "dd MMM yyyy HH:mm", { locale: fr })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!isLoading && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-sm text-muted-foreground">
                Page {page + 1} / {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Précédent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Suivant
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
