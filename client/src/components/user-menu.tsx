import { useState } from "react";
import { LogOut, Key, User as UserIcon, Smartphone, AlertTriangle, Trash2, Scale, FileText, Box, Home, Receipt, FileBarChart } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation, Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";

function isFrenchMobile(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s.\-()]/g, '');
  if (/^(?:\+33|0033)[67]\d{8}$/.test(cleaned)) return true;
  if (/^0[67]\d{8}$/.test(cleaned)) return true;
  return false;
}

export function UserMenu() {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [changePasswordDialog, setChangePasswordDialog] = useState(false);
  const [profileDialog, setProfileDialog] = useState(false);
  const [deleteAccountDialog, setDeleteAccountDialog] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileSmsConsent, setProfileSmsConsent] = useState(false);

  const isClient = !isAdmin && !isSuperAdmin;

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      return apiRequest("PATCH", "/api/user/password", data);
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: "Votre mot de passe a été modifié avec succès",
      });
      setChangePasswordDialog(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message || "Échec de la modification du mot de passe",
        variant: "destructive",
      });
    },
  });

  const profileMutation = useMutation({
    mutationFn: async (data: { phone?: string | null; smsConsent?: boolean }) => {
      return apiRequest("PATCH", "/api/user/profile", data);
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: "Votre profil a été mis à jour",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setProfileDialog(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message || "Échec de la mise à jour",
        variant: "destructive",
      });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (data: { reason: string }) => {
      return apiRequest("POST", "/api/user/delete-request", data);
    },
    onSuccess: () => {
      toast({
        title: "Demande envoyée",
        description: "Votre demande de suppression a été transmise. Vous serez contacté dans les 72h.",
      });
      setDeleteAccountDialog(false);
      setDeleteReason("");
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message || "Impossible d'envoyer la demande",
        variant: "destructive",
      });
    },
  });

  const handleChangePassword = () => {
    if (!currentPassword) {
      toast({ title: "Erreur", description: "Le mot de passe actuel est requis", variant: "destructive" });
      return;
    }
    if (!newPassword) {
      toast({ title: "Erreur", description: "Le nouveau mot de passe est requis", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Erreur", description: "Le nouveau mot de passe doit contenir au moins 6 caracteres", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Erreur", description: "Les mots de passe ne correspondent pas", variant: "destructive" });
      return;
    }
    changePasswordMutation.mutate({ currentPassword: currentPassword.trim(), newPassword: newPassword.trim() });
  };

  const handleOpenProfile = () => {
    setProfilePhone(user?.phone || "");
    setProfileSmsConsent(user?.smsConsent || false);
    setProfileDialog(true);
  };

  const handleSaveProfile = () => {
    if (profileSmsConsent && !isFrenchMobile(profilePhone)) {
      toast({
        title: "Numéro mobile requis",
        description: "Pour recevoir les notifications SMS, veuillez renseigner un numéro de mobile valide (06 ou 07).",
        variant: "destructive",
      });
      return;
    }
    profileMutation.mutate({
      phone: profilePhone || null,
      smsConsent: profileSmsConsent,
    });
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/logout", { method: "POST", credentials: "include" });
      queryClient.clear();
      setLocation("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case "root": return "Administrateur Root";
      case "superadmin": return "Super Administrateur";
      case "admin": return "Administrateur";
      case "employe": return "Employé";
      case "client_professionnel": return "Client Professionnel";
      case "client": return "Client";
      default: return "Utilisateur";
    }
  };

  if (!user) return null;

  const initials = [user.firstName, user.lastName]
    .filter(Boolean)
    .map((n) => n![0])
    .join("")
    .toUpperCase() || user.email?.[0]?.toUpperCase() || "?";

  const phoneIsMobile = isFrenchMobile(profilePhone);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="relative h-9 w-9 rounded-full hover-elevate active-elevate-2"
            data-testid="button-user-menu"
          >
            <Avatar className="h-9 w-9">
              <AvatarImage src={user.profileImageUrl || undefined} alt={user.email || "User"} className="object-cover" />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">
                {user.firstName && user.lastName
                  ? `${user.firstName} ${user.lastName}`
                  : user.email}
              </p>
              {user.email && (
                <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
              )}
              <Badge variant="outline" className="w-fit mt-2">
                {getRoleLabel(user.role)}
              </Badge>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {isClient && (
            <>
              <DropdownMenuItem asChild className="cursor-pointer" data-testid="nav-client-home">
                <Link href="/">
                  <Home className="mr-2 h-4 w-4" />
                  <span>Tableau de bord</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer" data-testid="nav-client-quotes">
                <Link href="/quotes">
                  <FileText className="mr-2 h-4 w-4" />
                  <span>Mes devis</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer" data-testid="nav-client-invoices">
                <Link href="/invoices">
                  <Receipt className="mr-2 h-4 w-4" />
                  <span>Mes factures</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer" data-testid="nav-client-configurateur">
                <Link href="/configurateur">
                  <Box className="mr-2 h-4 w-4" />
                  <span>Simulateur 3D</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          <DropdownMenuItem
            onClick={handleOpenProfile}
            className="cursor-pointer"
            data-testid="button-open-profile"
          >
            <UserIcon className="mr-2 h-4 w-4" />
            <span>Mon profil</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setChangePasswordDialog(true);
              setCurrentPassword("");
              setNewPassword("");
              setConfirmPassword("");
            }}
            className="cursor-pointer"
            data-testid="button-change-password"
          >
            <Key className="mr-2 h-4 w-4" />
            <span>Changer le mot de passe</span>
          </DropdownMenuItem>

          {isClient && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="cursor-pointer text-muted-foreground text-xs" data-testid="nav-privacy">
                <Link href="/privacy">
                  <Scale className="mr-2 h-3.5 w-3.5" />
                  <span>Politique de confidentialité</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer text-muted-foreground text-xs" data-testid="nav-access-policy">
                <Link href="/access-policy">
                  <FileBarChart className="mr-2 h-3.5 w-3.5" />
                  <span>Mentions légales</span>
                </Link>
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleLogout}
            className="cursor-pointer"
            data-testid="button-logout"
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Déconnexion</span>
          </DropdownMenuItem>

          {isClient && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDeleteAccountDialog(true)}
                className="cursor-pointer text-destructive focus:text-destructive"
                data-testid="button-delete-account"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                <span>Supprimer mon compte</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={profileDialog} onOpenChange={setProfileDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mon profil</DialogTitle>
            <DialogDescription>
              Gérez votre numéro de téléphone et vos préférences de notifications.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="profile-phone">Numéro de téléphone</Label>
              <Input
                id="profile-phone"
                type="tel"
                placeholder="06 12 34 56 78"
                value={profilePhone}
                onChange={(e) => setProfilePhone(e.target.value)}
                className="mt-2"
                data-testid="input-profile-phone"
              />
              {profilePhone && !phoneIsMobile && (
                <div className="flex items-center gap-2 mt-2 text-sm text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Ce numero n'est pas un mobile (06/07). Les SMS ne seront pas envoyes.</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 p-3 rounded-md border">
              <div className="space-y-0.5">
                <Label htmlFor="sms-consent" className="text-sm font-medium flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  Notifications SMS
                </Label>
                <p className="text-xs text-muted-foreground">
                  Recevoir un SMS lors de l'envoi d'un devis, d'une facture ou d'une confirmation de paiement.
                </p>
              </div>
              <Switch
                id="sms-consent"
                checked={profileSmsConsent}
                onCheckedChange={setProfileSmsConsent}
                data-testid="switch-sms-consent"
              />
            </div>

            {profileSmsConsent && !phoneIsMobile && (
              <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  Pour recevoir les notifications SMS, veuillez renseigner un numero de mobile valide commencant par 06 ou 07.
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              En activant les notifications SMS, vous consentez a recevoir des messages relatifs a vos devis, factures et paiements. Vous pouvez desactiver cette option a tout moment. Consultez notre <a href="/privacy" className="underline">politique de confidentialite</a> pour plus d'informations.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileDialog(false)} data-testid="button-cancel-profile">
              Annuler
            </Button>
            <Button onClick={handleSaveProfile} disabled={profileMutation.isPending} data-testid="button-save-profile">
              {profileMutation.isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={changePasswordDialog} onOpenChange={setChangePasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Changer le mot de passe</DialogTitle>
            <DialogDescription>
              Entrez votre mot de passe actuel et choisissez un nouveau mot de passe.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="current-password">Mot de passe actuel *</Label>
              <Input
                id="current-password"
                type="password"
                placeholder="Votre mot de passe actuel"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-2"
                data-testid="input-current-password"
              />
            </div>
            <div>
              <Label htmlFor="new-password">Nouveau mot de passe *</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Minimum 6 caracteres"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-2"
                data-testid="input-new-password"
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirmer le nouveau mot de passe *</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Repetez le nouveau mot de passe"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-2"
                data-testid="input-confirm-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePasswordDialog(false)} data-testid="button-cancel-change-password">
              Annuler
            </Button>
            <Button onClick={handleChangePassword} disabled={changePasswordMutation.isPending} data-testid="button-save-change-password">
              {changePasswordMutation.isPending ? "Modification..." : "Modifier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteAccountDialog} onOpenChange={setDeleteAccountDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Supprimer mon compte
            </DialogTitle>
            <DialogDescription>
              Conformément au RGPD, vous pouvez demander la suppression de votre compte et de toutes vos données personnelles. Cette demande sera traitée dans un délai de 72 heures.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive font-medium">Cette action est irréversible.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Toutes vos données (devis, factures, historique) seront définitivement supprimées après traitement de votre demande.
              </p>
            </div>
            <div>
              <Label htmlFor="delete-reason">Motif de suppression (optionnel)</Label>
              <Input
                id="delete-reason"
                placeholder="Ex : Je ne souhaite plus utiliser ce service..."
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="mt-2"
                data-testid="input-delete-reason"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteAccountDialog(false)} data-testid="button-cancel-delete">
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteAccountMutation.mutate({ reason: deleteReason })}
              disabled={deleteAccountMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteAccountMutation.isPending ? "Envoi..." : "Confirmer la demande"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
