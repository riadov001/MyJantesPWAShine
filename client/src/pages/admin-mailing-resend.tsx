import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Inbox, Paperclip, ChevronLeft, ChevronRight, Search, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface ResendEmail {
  id: string;
  from: string;
  to: string;
  subject: string;
  status: string;
  attachmentsCount: number;
  sentAt: string;
}

interface ResendResponse {
  emails: ResendEmail[];
  total: number;
  page: number;
  limit: number;
}

const STATUS_COLORS: Record<string, string> = {
  delivered: "bg-green-100 text-green-800",
  sent: "bg-blue-100 text-blue-800",
  opened: "bg-purple-100 text-purple-800",
  clicked: "bg-indigo-100 text-indigo-800",
  bounced: "bg-red-100 text-red-800",
  complained: "bg-orange-100 text-orange-800",
  unsubscribed: "bg-yellow-100 text-yellow-800",
  delivery_delayed: "bg-amber-100 text-amber-800",
};

function statusLabel(s: string): string {
  const labels: Record<string, string> = {
    delivered: "Livré",
    sent: "Envoyé",
    opened: "Ouvert",
    clicked: "Cliqué",
    bounced: "Rejeté",
    complained: "Spam",
    unsubscribed: "Désabonné",
    delivery_delayed: "Retardé",
  };
  return labels[s] ?? s;
}

export default function AdminMailingResend() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const limit = 50;

  const { data, isLoading, refetch } = useQuery<ResendResponse>({
    queryKey: ["mailing-resend", page],
    queryFn: async () => {
      const res = await fetch(`/api/admin/mailing/resend?page=${page}&limit=${limit}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erreur chargement emails Resend");
      return res.json();
    },
    staleTime: 60_000,
  });

  const emails = data?.emails ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const filtered = search.trim()
    ? emails.filter(
        (e) =>
          e.to.toLowerCase().includes(search.toLowerCase()) ||
          e.subject.toLowerCase().includes(search.toLowerCase()) ||
          e.from.toLowerCase().includes(search.toLowerCase())
      )
    : emails;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Inbox className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Resend Mail</h1>
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
              {isLoading ? "Chargement…" : `${total.toLocaleString("fr-FR")} email${total > 1 ? "s" : ""} envoyé${total > 1 ? "s" : ""} au total`}
            </CardTitle>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher destinataire, sujet…"
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
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Statut</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">PJ</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-muted-foreground">
                      Chargement…
                    </td>
                  </tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-muted-foreground">
                      Aucun email trouvé
                    </td>
                  </tr>
                )}
                {filtered.map((email, idx) => (
                  <tr
                    key={email.id}
                    className={`border-b transition-colors hover:bg-muted/30 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                  >
                    <td className="px-4 py-3 max-w-[200px] truncate font-mono text-xs">
                      {email.to}
                    </td>
                    <td className="px-4 py-3 max-w-[280px]">
                      <span className="line-clamp-1">{email.subject}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_COLORS[email.status] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {statusLabel(email.status)}
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
                Page {page} / {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Précédent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
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
