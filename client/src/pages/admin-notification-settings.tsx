import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bell,
  Plus,
  Trash2,
  Mail,
  MessageSquare,
  Smartphone,
  Clock,
  CalendarCheck,
  Receipt,
  FileText,
  Star,
  CreditCard,
  AlertTriangle,
  Loader2,
  Pencil,
  BellRing,
  Settings,
} from "lucide-react";
import type { NotificationRule } from "@shared/schema";

const EVENT_TYPES = [
  { value: "reservation_reminder", label: "Rappel de réservation", icon: CalendarCheck, description: "Envoyer un rappel avant une réservation planifiée" },
  { value: "invoice_overdue", label: "Facture en retard", icon: Receipt, description: "Alerter quand une facture dépasse la date d'échéance" },
  { value: "quote_expiry", label: "Expiration de devis", icon: FileText, description: "Rappeler avant l'expiration d'un devis" },
  { value: "review_request", label: "Demande d'avis", icon: Star, description: "Demander un avis après une prestation" },
  { value: "payment_confirmed", label: "Paiement confirmé", icon: CreditCard, description: "Notifier quand un paiement est reçu" },
  { value: "reservation_created", label: "Nouvelle réservation", icon: CalendarCheck, description: "Notifier quand une réservation est créée" },
  { value: "invoice_created", label: "Nouvelle facture", icon: Receipt, description: "Notifier quand une facture est créée" },
  { value: "quote_sent", label: "Devis envoyé", icon: FileText, description: "Notifier quand un devis est envoyé" },
  { value: "custom", label: "Personnalisé", icon: Bell, description: "Règle de notification personnalisée" },
];

const CHANNEL_OPTIONS = [
  { value: "email", label: "Email", icon: Mail },
  { value: "app", label: "Notification in-app", icon: BellRing },
  { value: "sms", label: "SMS", icon: Smartphone },
];

function getEventLabel(eventType: string) {
  return EVENT_TYPES.find(e => e.value === eventType)?.label || eventType;
}

function getEventIcon(eventType: string) {
  const found = EVENT_TYPES.find(e => e.value === eventType);
  return found ? found.icon : Bell;
}

function getDelayLabel(delay: number, unit: string, direction: string) {
  if (delay === 0) return "Immédiat";
  const unitLabels: Record<string, string> = { minutes: "min", hours: "h", days: "j" };
  return `${delay}${unitLabels[unit] || unit} ${direction === "before" ? "avant" : "après"}`;
}

export default function AdminNotificationSettings() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<NotificationRule | null>(null);

  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formEventType, setFormEventType] = useState("reservation_reminder");
  const [formChannels, setFormChannels] = useState<string[]>(["app"]);
  const [formDelay, setFormDelay] = useState(24);
  const [formUnit, setFormUnit] = useState("hours");
  const [formDirection, setFormDirection] = useState("before");
  const [formRecipient, setFormRecipient] = useState("client");
  const [formEmailSubject, setFormEmailSubject] = useState("");
  const [formEmailBody, setFormEmailBody] = useState("");
  const [formPopupTitle, setFormPopupTitle] = useState("");
  const [formPopupMessage, setFormPopupMessage] = useState("");
  const [formSmsMessage, setFormSmsMessage] = useState("");

  const rulesQuery = useQuery<NotificationRule[]>({
    queryKey: ["/api/admin/notification-rules"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/notification-rules", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notification-rules"] });
      toast({ title: "Règle créée avec succès" });
      closeDialog();
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/notification-rules/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notification-rules"] });
      toast({ title: "Règle mise à jour" });
      closeDialog();
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/notification-rules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notification-rules"] });
      toast({ title: "Règle supprimée" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/notification-rules/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notification-rules"] });
    },
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingRule(null);
    resetForm();
  }

  function resetForm() {
    setFormName("");
    setFormDescription("");
    setFormEventType("reservation_reminder");
    setFormChannels(["app"]);
    setFormDelay(24);
    setFormUnit("hours");
    setFormDirection("before");
    setFormRecipient("client");
    setFormEmailSubject("");
    setFormEmailBody("");
    setFormPopupTitle("");
    setFormPopupMessage("");
    setFormSmsMessage("");
  }

  function openCreate() {
    resetForm();
    setEditingRule(null);
    setDialogOpen(true);
  }

  function openEdit(rule: NotificationRule) {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormDescription(rule.description || "");
    setFormEventType(rule.eventType);
    setFormChannels(Array.isArray(rule.channels) ? rule.channels as string[] : ["app"]);
    setFormDelay(rule.triggerDelay);
    setFormUnit(rule.triggerUnit);
    setFormDirection(rule.triggerDirection);
    setFormRecipient(rule.recipientType);
    setFormEmailSubject(rule.emailSubject || "");
    setFormEmailBody(rule.emailBody || "");
    setFormPopupTitle(rule.popupTitle || "");
    setFormPopupMessage(rule.popupMessage || "");
    setFormSmsMessage(rule.smsMessage || "");
    setDialogOpen(true);
  }

  function toggleChannel(ch: string) {
    setFormChannels(prev =>
      prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]
    );
  }

  function handleSubmit() {
    if (!formName.trim()) {
      toast({ title: "Le nom est requis", variant: "destructive" });
      return;
    }
    if (formChannels.length === 0) {
      toast({ title: "Sélectionnez au moins un canal", variant: "destructive" });
      return;
    }

    const data = {
      name: formName,
      description: formDescription || null,
      eventType: formEventType,
      channels: formChannels,
      triggerDelay: formDelay,
      triggerUnit: formUnit,
      triggerDirection: formDirection,
      recipientType: formRecipient,
      emailSubject: formChannels.includes("email") ? formEmailSubject || null : null,
      emailBody: formChannels.includes("email") ? formEmailBody || null : null,
      popupTitle: formChannels.includes("app") ? formPopupTitle || null : null,
      popupMessage: formChannels.includes("app") ? formPopupMessage || null : null,
      smsMessage: formChannels.includes("sms") ? formSmsMessage || null : null,
    };

    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, data });
    } else {
      createMutation.mutate(data);
    }
  }

  const rules = rulesQuery.data || [];
  const isPending = createMutation.isPending || updateMutation.isPending;

  const needsTiming = ["reservation_reminder", "invoice_overdue", "quote_expiry", "review_request"].includes(formEventType);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Settings className="h-6 w-6" />
            Rappels & Notifications
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configurez les rappels automatiques par email, SMS et notifications dans l'application.
          </p>
        </div>
        <Button onClick={openCreate} data-testid="button-add-rule">
          <Plus className="h-4 w-4 mr-2" />
          Nouvelle règle
        </Button>
      </div>

      {rulesQuery.isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : rules.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center space-y-4">
          <Bell className="h-12 w-12 text-muted-foreground/50" />
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Aucune règle configurée</h3>
            <p className="text-muted-foreground max-w-sm mx-auto">
              Créez votre première règle de notification pour envoyer des rappels automatiques à vos clients ou à votre équipe.
            </p>
          </div>
          <Button onClick={openCreate} data-testid="button-add-rule-empty">
            <Plus className="h-4 w-4 mr-2" />
            Créer une règle
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => {
            const EventIcon = getEventIcon(rule.eventType);
            const channels = Array.isArray(rule.channels) ? rule.channels as string[] : [];
            return (
              <Card key={rule.id} data-testid={`card-rule-${rule.id}`}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="p-2 bg-muted rounded-md shrink-0 mt-0.5">
                        <EventIcon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm" data-testid={`text-rule-name-${rule.id}`}>{rule.name}</h3>
                          <Badge variant={rule.isActive ? "default" : "secondary"} className="text-xs">
                            {rule.isActive ? "Actif" : "Inactif"}
                          </Badge>
                        </div>
                        {rule.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {getEventLabel(rule.eventType)}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            <Clock className="h-3 w-3 mr-1" />
                            {getDelayLabel(rule.triggerDelay, rule.triggerUnit, rule.triggerDirection)}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {rule.recipientType === "client" ? "Client" : rule.recipientType === "admin" ? "Admin" : "Les deux"}
                          </Badge>
                          <div className="flex items-center gap-1">
                            {channels.includes("email") && <Mail className="h-3.5 w-3.5 text-muted-foreground" />}
                            {channels.includes("app") && <BellRing className="h-3.5 w-3.5 text-muted-foreground" />}
                            {channels.includes("sms") && <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={rule.isActive}
                        onCheckedChange={(checked) => toggleMutation.mutate({ id: rule.id, isActive: checked })}
                        data-testid={`switch-rule-${rule.id}`}
                      />
                      <Button size="icon" variant="ghost" onClick={() => openEdit(rule)} data-testid={`button-edit-rule-${rule.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Supprimer cette règle ?")) {
                            deleteMutation.mutate(rule.id);
                          }
                        }}
                        data-testid={`button-delete-rule-${rule.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Modèles suggérés
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Cliquez sur un modèle pour pré-remplir le formulaire de création.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              {
                name: "Rappel réservation 24h",
                eventType: "reservation_reminder",
                delay: 24, unit: "hours", direction: "before",
                channels: ["email", "app"],
                recipient: "client",
                emailSubject: "Rappel : votre rendez-vous demain",
                emailBody: "Bonjour, nous vous rappelons votre rendez-vous prévu demain. Merci de confirmer votre venue.",
                popupTitle: "Rappel de réservation",
                popupMessage: "Vous avez un rendez-vous prévu demain.",
              },
              {
                name: "Facture en retard (5 jours)",
                eventType: "invoice_overdue",
                delay: 5, unit: "days", direction: "after",
                channels: ["email", "app"],
                recipient: "client",
                emailSubject: "Rappel de paiement",
                emailBody: "Bonjour, votre facture est en attente de paiement depuis 5 jours. Merci de régulariser votre situation.",
                popupTitle: "Facture en retard",
                popupMessage: "Une facture est en retard de paiement.",
              },
              {
                name: "Demande d'avis après prestation",
                eventType: "review_request",
                delay: 2, unit: "days", direction: "after",
                channels: ["email"],
                recipient: "client",
                emailSubject: "Votre avis compte !",
                emailBody: "Bonjour, nous espérons que vous êtes satisfait de nos services. Donnez-nous votre avis !",
                popupTitle: "Donner votre avis",
                popupMessage: "Comment s'est passée votre dernière visite ?",
              },
              {
                name: "Expiration devis (3 jours avant)",
                eventType: "quote_expiry",
                delay: 3, unit: "days", direction: "before",
                channels: ["email", "app"],
                recipient: "client",
                emailSubject: "Votre devis expire bientôt",
                emailBody: "Bonjour {clientName}, votre devis {quoteReference} expire dans 3 jours. N'hésitez pas à nous contacter pour le valider.",
                popupTitle: "Devis bientôt expiré",
                popupMessage: "Votre devis {quoteReference} expire dans 3 jours.",
              },
              {
                name: "Notification admin nouvelle réservation",
                eventType: "reservation_created",
                delay: 0, unit: "minutes", direction: "after",
                channels: ["app", "email"],
                recipient: "admin",
                emailSubject: "Nouvelle réservation reçue",
                emailBody: "Une nouvelle réservation a été créée. Connectez-vous pour la consulter.",
                popupTitle: "Nouvelle réservation",
                popupMessage: "Une nouvelle réservation vient d'être créée.",
              },
            ].map((template, i) => (
              <Button
                key={i}
                variant="outline"
                className="justify-start h-auto py-3 px-4"
                onClick={() => {
                  setEditingRule(null);
                  setFormName(template.name);
                  setFormEventType(template.eventType);
                  setFormDelay(template.delay);
                  setFormUnit(template.unit);
                  setFormDirection(template.direction);
                  setFormChannels(template.channels);
                  setFormRecipient(template.recipient);
                  setFormEmailSubject(template.emailSubject);
                  setFormEmailBody(template.emailBody);
                  setFormPopupTitle(template.popupTitle);
                  setFormPopupMessage(template.popupMessage);
                  setFormSmsMessage("");
                  setFormDescription("");
                  setDialogOpen(true);
                }}
                data-testid={`button-template-${i}`}
              >
                <div className="text-left">
                  <p className="font-medium text-sm">{template.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {getDelayLabel(template.delay, template.unit, template.direction)} - {template.channels.join(", ")}
                  </p>
                </div>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Modifier la règle" : "Nouvelle règle de notification"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Nom de la règle *</Label>
                <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Rappel réservation 24h" data-testid="input-rule-name" />
              </div>
              <div>
                <Label>Type d'événement</Label>
                <Select value={formEventType} onValueChange={setFormEventType}>
                  <SelectTrigger data-testid="select-event-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map(et => (
                      <SelectItem key={et.value} value={et.value}>{et.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Description (optionnelle)</Label>
              <Input value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Description de cette règle..." data-testid="input-rule-description" />
            </div>

            <Separator />

            <div>
              <Label className="mb-2 block">Canaux de notification</Label>
              <div className="flex gap-3 flex-wrap">
                {CHANNEL_OPTIONS.map(ch => {
                  const Icon = ch.icon;
                  const selected = formChannels.includes(ch.value);
                  return (
                    <Button
                      key={ch.value}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      onClick={() => toggleChannel(ch.value)}
                      data-testid={`button-channel-${ch.value}`}
                    >
                      <Icon className="h-4 w-4 mr-2" />
                      {ch.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label>Destinataire</Label>
              <Select value={formRecipient} onValueChange={setFormRecipient}>
                <SelectTrigger data-testid="select-recipient">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="admin">Administrateur</SelectItem>
                  <SelectItem value="both">Les deux</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div>
              <Label className="mb-2 block">Délai de déclenchement</Label>
              <div className="flex items-center gap-3 flex-wrap">
                <Input
                  type="number"
                  min={0}
                  value={formDelay}
                  onChange={e => setFormDelay(parseInt(e.target.value) || 0)}
                  className="w-24"
                  data-testid="input-delay"
                />
                <Select value={formUnit} onValueChange={setFormUnit}>
                  <SelectTrigger className="w-32" data-testid="select-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">Minutes</SelectItem>
                    <SelectItem value="hours">Heures</SelectItem>
                    <SelectItem value="days">Jours</SelectItem>
                  </SelectContent>
                </Select>
                {needsTiming && (
                  <Select value={formDirection} onValueChange={setFormDirection}>
                    <SelectTrigger className="w-28" data-testid="select-direction">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="before">Avant</SelectItem>
                      <SelectItem value="after">Après</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {!needsTiming && (
                  <p className="text-xs text-muted-foreground">après l'événement</p>
                )}
              </div>
              {formDelay === 0 && (
                <p className="text-xs text-muted-foreground mt-1">Déclenchement immédiat</p>
              )}
            </div>

            <Separator />

            {formChannels.includes("email") && (
              <div className="space-y-3 p-4 border border-border rounded-md">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  <Label className="font-semibold">Configuration Email</Label>
                </div>
                <div>
                  <Label>Objet de l'email</Label>
                  <Input value={formEmailSubject} onChange={e => setFormEmailSubject(e.target.value)} placeholder="Sujet du mail..." data-testid="input-email-subject" />
                </div>
                <div>
                  <Label>Corps de l'email</Label>
                  <Textarea value={formEmailBody} onChange={e => setFormEmailBody(e.target.value)} placeholder="Contenu du mail..." rows={4} data-testid="input-email-body" />
                  <p className="text-xs text-muted-foreground mt-1">
                    Variables disponibles : {"{clientName}"}, {"{invoiceNumber}"}, {"{reservationDate}"}, {"{reservationTime}"}, {"{amount}"}, {"{dueDate}"}, {"{quoteReference}"}, {"{expiryDate}"}
                  </p>
                </div>
              </div>
            )}

            {formChannels.includes("app") && (
              <div className="space-y-3 p-4 border border-border rounded-md">
                <div className="flex items-center gap-2">
                  <BellRing className="h-4 w-4" />
                  <Label className="font-semibold">Notification in-app (popup)</Label>
                </div>
                <div>
                  <Label>Titre de la notification</Label>
                  <Input value={formPopupTitle} onChange={e => setFormPopupTitle(e.target.value)} placeholder="Titre..." data-testid="input-popup-title" />
                </div>
                <div>
                  <Label>Message</Label>
                  <Textarea value={formPopupMessage} onChange={e => setFormPopupMessage(e.target.value)} placeholder="Message de la notification..." rows={3} data-testid="input-popup-message" />
                </div>
              </div>
            )}

            {formChannels.includes("sms") && (
              <div className="space-y-3 p-4 border border-border rounded-md">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  <Label className="font-semibold">Configuration SMS</Label>
                </div>
                <div>
                  <Label>Message SMS</Label>
                  <Textarea value={formSmsMessage} onChange={e => setFormSmsMessage(e.target.value)} placeholder="Message SMS (160 caractères max recommandé)..." rows={3} data-testid="input-sms-message" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {formSmsMessage.length}/160 caractères
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={closeDialog} data-testid="button-cancel-rule">
                Annuler
              </Button>
              <Button onClick={handleSubmit} disabled={isPending} data-testid="button-save-rule">
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enregistrement...
                  </>
                ) : editingRule ? "Mettre à jour" : "Créer la règle"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
