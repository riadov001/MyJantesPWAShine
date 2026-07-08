import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LifeBuoy, Send, Mail, Phone, Clock, CheckCircle, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function SupportPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "",
    email: user?.email || "",
    category: "",
    subject: "",
    message: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.category || !formData.subject || !formData.message) {
      toast({ title: "Champs requis", description: "Veuillez remplir tous les champs obligatoires.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/support/contact", formData);
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
        toast({ title: "Message envoyé", description: "Votre demande a bien été transmise. Nous reviendrons vers vous rapidement." });
      } else {
        toast({ title: "Erreur", description: data.message || "Une erreur est survenue.", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message || "Impossible d'envoyer le message.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="container max-w-2xl mx-auto p-4 sm:p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-4">
              <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-xl font-semibold text-foreground" data-testid="text-support-success">Message envoyé</h2>
            <p className="text-muted-foreground text-center max-w-md">
              Votre demande de support a bien été envoyée. Notre équipe vous répondra dans les plus brefs délais à l'adresse <strong>{formData.email}</strong>.
            </p>
            <Button onClick={() => { setSubmitted(false); setFormData(prev => ({ ...prev, category: "", subject: "", message: "" })); }} data-testid="button-new-request">
              Nouvelle demande
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <LifeBuoy className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-support-title">Support</h1>
          <p className="text-muted-foreground text-sm">Besoin d'aide ? Contactez notre équipe</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-primary/10 p-2 shrink-0">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Email</p>
              <p className="text-xs text-muted-foreground truncate" data-testid="text-support-email">contact@myjantes.com</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-primary/10 p-2 shrink-0">
              <Phone className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Téléphone</p>
              <p className="text-xs text-muted-foreground" data-testid="text-support-phone">+33 6 XX XX XX XX</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-primary/10 p-2 shrink-0">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Horaires</p>
              <p className="text-xs text-muted-foreground" data-testid="text-support-hours">Lun-Ven : 9h - 18h</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Formulaire de contact
          </CardTitle>
          <CardDescription>Décrivez votre problème ou votre question, nous vous répondrons rapidement.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nom complet</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Votre nom"
                  data-testid="input-support-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Adresse email *</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="votre@email.com"
                  data-testid="input-support-email"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Catégorie *</Label>
                <Select value={formData.category} onValueChange={(val) => setFormData(prev => ({ ...prev, category: val }))}>
                  <SelectTrigger data-testid="select-support-category">
                    <SelectValue placeholder="Choisir une catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="question">Question générale</SelectItem>
                    <SelectItem value="devis">Devis / Facturation</SelectItem>
                    <SelectItem value="reservation">Réservation</SelectItem>
                    <SelectItem value="technique">Problème technique</SelectItem>
                    <SelectItem value="reclamation">Réclamation</SelectItem>
                    <SelectItem value="autre">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject">Sujet *</Label>
                <Input
                  id="subject"
                  required
                  value={formData.subject}
                  onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder="Résumez votre demande"
                  data-testid="input-support-subject"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Message *</Label>
              <Textarea
                id="message"
                required
                rows={6}
                value={formData.message}
                onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
                placeholder="Décrivez votre demande en détail..."
                className="resize-none"
                data-testid="input-support-message"
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting} data-testid="button-submit-support">
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Envoi en cours...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Envoyer le message
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
