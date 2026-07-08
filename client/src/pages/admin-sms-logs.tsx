import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { MessageSquare, Send, CheckCircle, XCircle, Clock, AlertTriangle, SkipForward, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SmsLog } from "@shared/schema";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  sent: { label: "Envoyé", variant: "default", icon: CheckCircle },
  failed: { label: "Échoué", variant: "destructive", icon: XCircle },
  error: { label: "Erreur", variant: "destructive", icon: AlertTriangle },
  pending: { label: "En attente", variant: "secondary", icon: Clock },
  skipped: { label: "Ignoré", variant: "outline", icon: SkipForward },
};

const eventTypeLabels: Record<string, string> = {
  quote_sent: "Devis envoyé",
  quote_approved: "Devis approuvé",
  invoice_sent: "Facture envoyée",
  invoice_paid: "Facture payée",
  reservation_confirmed: "Réservation confirmée",
  reservation_reminder: "Rappel réservation",
  review_request: "Demande d'avis",
  general: "Général",
};

const providerLabels: Record<string, string> = {
  twilio: "Twilio",
  textbelt: "TextBelt",
  gatewayapi: "GatewayAPI",
  relationcity: "RelationCity",
  log: "Simulation",
};

export default function AdminSmsLogs() {
  const { toast } = useToast();
  const [testDialog, setTestDialog] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("");

  const { data: logs = [], isLoading: logsLoading, refetch: refetchLogs } = useQuery<SmsLog[]>({
    queryKey: ["/api/admin/sms/logs"],
  });

  const { data: stats } = useQuery<{ total: number; sent: number; failed: number; skipped: number; provider: string }>({
    queryKey: ["/api/admin/sms/stats"],
  });

  const testMutation = useMutation({
    mutationFn: async (data: { phone: string; message: string }) => {
      const res = await apiRequest("POST", "/api/admin/sms/test", data);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "SMS envoyé", description: `SMS envoyé avec succès (ID: ${data.sid})` });
      } else {
        toast({ title: "Échec", description: data.error || "Le SMS n'a pas pu être envoyé", variant: "destructive" });
      }
      setTestDialog(false);
      setTestPhone("");
      setTestMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sms/logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sms/stats"] });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6" data-testid="admin-sms-logs-page">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Journal SMS</h1>
          <p className="text-sm text-muted-foreground">
            Historique des notifications SMS envoyées
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => refetchLogs()} data-testid="button-refresh-logs">
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualiser
          </Button>
          <Button onClick={() => setTestDialog(true)} data-testid="button-test-sms">
            <Send className="mr-2 h-4 w-4" />
            Envoyer un SMS test
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fournisseur actif</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-provider">
              {providerLabels[stats?.provider || "log"] || stats?.provider}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total">{stats?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Envoyés</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-sent">{stats?.sent || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Échoués</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600" data-testid="text-failed">{stats?.failed || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Historique des SMS
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <p className="text-muted-foreground text-center py-8">Chargement...</p>
          ) : logs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Aucun SMS envoyé pour le moment. Envoyez un devis ou une facture pour tester.
            </p>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => {
                const statusCfg = statusConfig[log.status] || statusConfig.pending;
                const StatusIcon = statusCfg.icon;
                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-3 rounded-md border"
                    data-testid={`sms-log-${log.id}`}
                  >
                    <StatusIcon className={`h-5 w-5 mt-0.5 shrink-0 ${log.status === 'sent' ? 'text-green-500' : log.status === 'failed' || log.status === 'error' ? 'text-red-500' : 'text-muted-foreground'}`} />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{log.recipientPhone}</span>
                        {log.recipientName && (
                          <span className="text-sm text-muted-foreground">({log.recipientName})</span>
                        )}
                        <Badge variant={statusCfg.variant} className="text-xs">
                          {statusCfg.label}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {providerLabels[log.provider] || log.provider}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {eventTypeLabels[log.eventType] || log.eventType}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium">{log.eventTitle}</p>
                      {log.eventDetails && (
                        <p className="text-sm text-muted-foreground">{log.eventDetails}</p>
                      )}
                      {log.errorMessage && (
                        <p className="text-sm text-red-500">{log.errorMessage}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {log.createdAt ? format(new Date(log.createdAt), "dd/MM/yyyy HH:mm:ss", { locale: fr }) : ""}
                        {log.externalId && ` — ID: ${log.externalId}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={testDialog} onOpenChange={setTestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Envoyer un SMS test</DialogTitle>
            <DialogDescription>
              Envoyez un SMS de test pour vérifier que le service fonctionne.
              Fournisseur actif : {providerLabels[stats?.provider || "log"] || stats?.provider}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="test-phone">Numéro de téléphone</Label>
              <Input
                id="test-phone"
                type="tel"
                placeholder="06 12 34 56 78"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                data-testid="input-test-phone"
              />
            </div>
            <div>
              <Label htmlFor="test-message">Message (optionnel)</Label>
              <Input
                id="test-message"
                placeholder="Ceci est un test..."
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                data-testid="input-test-message"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestDialog(false)}>Annuler</Button>
            <Button
              onClick={() => testMutation.mutate({ phone: testPhone, message: testMessage })}
              disabled={!testPhone || testMutation.isPending}
              data-testid="button-send-test"
            >
              {testMutation.isPending ? "Envoi..." : "Envoyer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
