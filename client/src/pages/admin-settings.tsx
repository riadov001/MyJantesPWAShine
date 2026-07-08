import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Settings, Building2, X, Upload, Plus, Trash2, HardDrive, CloudUpload, Loader2, Mail, Send, Scale, Landmark, FileText } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ApplicationSettings } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertApplicationSettingsSchema } from "@shared/schema";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";

const formSchema = insertApplicationSettingsSchema.extend({
  defaultWheelCount: z.coerce.number().min(1).max(4),
  defaultTaxRate: z.string().refine((val) => !isNaN(parseFloat(val)), {
    message: "Le taux de TVA doit être un nombre",
  }),
  customFields: z.array(z.object({
    id: z.string(),
    label: z.string(),
    type: z.enum(["text", "number", "date"]),
    target: z.enum(["quote", "invoice", "both"]),
  })).optional(),
});

function MigrationSection() {
  const { toast } = useToast();
  const [migrationResult, setMigrationResult] = useState<any>(null);

  const gdriveStatusQuery = useQuery<{ configured: boolean }>({
    queryKey: ["/api/admin/gdrive/status"],
  });

  const migrationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/migrate-media-to-cloud");
      return res.json();
    },
    onSuccess: (data) => {
      setMigrationResult(data);
      toast({
        title: "Migration terminée",
        description: `${data.total} fichier(s) migré(s) vers ${data.destination}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erreur de migration",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const gdriveConfigured = gdriveStatusQuery.data?.configured;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <HardDrive className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">
            Google Drive : {gdriveStatusQuery.isLoading ? "..." : gdriveConfigured ? "Connecté" : "Non configuré"}
          </p>
          <p className="text-xs text-muted-foreground">
            {gdriveConfigured 
              ? "Les photos seront migrées vers Google Drive" 
              : "Les photos seront migrées vers Object Storage (fallback)"}
          </p>
        </div>
      </div>

      <Button
        data-testid="button-migrate-photos"
        onClick={() => migrationMutation.mutate()}
        disabled={migrationMutation.isPending}
      >
        {migrationMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Migration en cours...
          </>
        ) : (
          <>
            <CloudUpload className="h-4 w-4 mr-2" />
            Lancer la migration
          </>
        )}
      </Button>

      {migrationResult && (
        <div className="rounded-md border p-4 space-y-1 text-sm">
          <p className="font-medium">Résultat : {migrationResult.destination}</p>
          <p>Devis migrés : {migrationResult.migratedQuotes}</p>
          <p>Factures migrées : {migrationResult.migratedInvoices}</p>
          <p>Ignorés (fichier absent) : {(migrationResult.skippedQuotes || 0) + (migrationResult.skippedInvoices || 0)}</p>
          <p>Erreurs : {migrationResult.errors}</p>
          {migrationResult.errorDetails?.length > 0 && (
            <div className="mt-2 text-xs text-destructive">
              {migrationResult.errorDetails.map((e: string, i: number) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DailyReportTestButton() {
  const { toast } = useToast();
  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/daily-report/test");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rapport envoyé", description: "Le rapport test a été envoyé aux destinataires configurés" });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible d'envoyer le rapport test", variant: "destructive" });
    },
  });

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => testMutation.mutate()}
      disabled={testMutation.isPending}
      className="gap-2"
      data-testid="button-test-daily-report"
    >
      {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      Envoyer un rapport test maintenant
    </Button>
  );
}

interface GarageLegalInfo {
  id: string;
  name: string;
  address: string;
  city: string;
  postalCode: string;
  phone: string;
  email: string;
  website: string;
  siren: string;
  siret: string;
  tvaNumber: string;
  iban: string;
  swift: string;
  bankName: string;
  legalForm: string;
  capitalSocial: string;
  nafCode: string;
  rcsCity: string;
  country: string;
}

function GarageLegalSection() {
  const { toast } = useToast();
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<Partial<GarageLegalInfo>>({});

  const { data: garageLegal, isLoading } = useQuery<GarageLegalInfo>({
    queryKey: ["/api/admin/garage-legal"],
  });

  useEffect(() => {
    if (garageLegal) {
      setFormData(garageLegal);
    }
  }, [garageLegal]);

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<GarageLegalInfo>) => {
      return apiRequest("PATCH", "/api/admin/garage-legal", data);
    },
    onSuccess: () => {
      toast({ title: "Succès", description: "Informations légales mises à jour" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/garage-legal"] });
      setEditMode(false);
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  const updateField = (field: keyof GarageLegalInfo, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-12" />)}</div>;
  }

  if (!garageLegal) {
    return <p className="text-sm text-muted-foreground">Les paramètres ne sont pas encore configurés.</p>;
  }

  const fields: { key: keyof GarageLegalInfo; label: string; placeholder: string; group: string }[] = [
    { key: "name", label: "Raison sociale", placeholder: "MY JANTES", group: "identity" },
    { key: "legalForm", label: "Forme juridique", placeholder: "SAS, société par actions simplifiée", group: "identity" },
    { key: "capitalSocial", label: "Capital social (EUR)", placeholder: "30000.00", group: "identity" },
    { key: "siren", label: "SIREN", placeholder: "913678199", group: "identity" },
    { key: "siret", label: "SIRET (siège social)", placeholder: "91367819900021", group: "identity" },
    { key: "tvaNumber", label: "N° TVA Intracommunautaire", placeholder: "FR73913678199", group: "identity" },
    { key: "nafCode", label: "Code NAF/APE", placeholder: "45.20A", group: "identity" },
    { key: "rcsCity", label: "RCS (ville)", placeholder: "Béthune", group: "identity" },
    { key: "address", label: "Adresse", placeholder: "46 Rue de la Convention", group: "address" },
    { key: "postalCode", label: "Code postal", placeholder: "62800", group: "address" },
    { key: "city", label: "Ville", placeholder: "Liévin", group: "address" },
    { key: "country", label: "Pays (code ISO)", placeholder: "FR", group: "address" },
    { key: "phone", label: "Téléphone", placeholder: "03 21 40 80 53", group: "contact" },
    { key: "email", label: "Email", placeholder: "contact@myjantes.com", group: "contact" },
    { key: "website", label: "Site web", placeholder: "https://myjantes.com", group: "contact" },
    { key: "iban", label: "IBAN", placeholder: "FR76...", group: "bank" },
    { key: "swift", label: "BIC/SWIFT", placeholder: "BNPAFRPP", group: "bank" },
    { key: "bankName", label: "Nom de la banque", placeholder: "BNP Paribas", group: "bank" },
  ];

  const groups = [
    { id: "identity", label: "Identité juridique", icon: Scale },
    { id: "address", label: "Adresse du siège", icon: Building2 },
    { id: "contact", label: "Coordonnées", icon: Mail },
    { id: "bank", label: "Coordonnées bancaires", icon: Landmark },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Ces informations apparaissent sur vos factures et documents Factur-X.
        </p>
        {!editMode ? (
          <Button variant="outline" size="sm" onClick={() => setEditMode(true)} data-testid="button-edit-legal">
            Modifier
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { setEditMode(false); setFormData(garageLegal); }} data-testid="button-cancel-legal">
              Annuler
            </Button>
            <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save-legal">
              {updateMutation.isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        )}
      </div>
      {groups.map(group => (
        <div key={group.id} className="space-y-3">
          <div className="flex items-center gap-2">
            <group.icon className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold">{group.label}</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {fields.filter(f => f.group === group.id).map(field => (
              <div key={field.key} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{field.label}</Label>
                {editMode ? (
                  <Input
                    value={formData[field.key] || ""}
                    placeholder={field.placeholder}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    data-testid={`input-legal-${field.key}`}
                  />
                ) : (
                  <p className="text-sm font-medium min-h-[36px] flex items-center" data-testid={`text-legal-${field.key}`}>
                    {formData[field.key] || <span className="text-muted-foreground/50 italic">Non renseigné</span>}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminSettings() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, isAdmin } = useAuth();
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !isAdmin)) {
      toast({
        title: "Non autorisé",
        description: "Vous n'avez pas la permission d'accéder à cette page.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 500);
    }
  }, [isAuthenticated, isLoading, isAdmin, toast]);

  const { data: settings, isLoading: settingsLoading } = useQuery<ApplicationSettings>({
    queryKey: ["/api/admin/settings"],
    enabled: isAuthenticated && isAdmin,
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      defaultWheelCount: 4,
      defaultDiameter: "17",
      defaultTaxRate: "20.00",
      wheelCountOptions: "1,2,3,4",
      diameterOptions: "14,15,16,17,18,19,20,21,22",
      companyName: "MyJantes",
      companyTagline: "",
      companyAddress: "",
      companyCity: "",
      companyPhone: "",
      companyEmail: "",
      companyWebsite: "",
      companySiret: "",
      companyTvaNumber: "",
      companyIban: "",
      companySwift: "",
      companyLogo: "",
      dailyRevenueObjective: "0",
      dailyReportEnabled: false,
      dailyReportTime: "21:00",
      dailyReportRecipients: "contact@myjantes.com",
      customFields: [],
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        defaultWheelCount: settings.defaultWheelCount,
        defaultDiameter: settings.defaultDiameter,
        defaultTaxRate: settings.defaultTaxRate,
        wheelCountOptions: settings.wheelCountOptions,
        diameterOptions: settings.diameterOptions,
        companyName: settings.companyName,
        companyTagline: settings.companyTagline || "",
        companyAddress: settings.companyAddress || "",
        companyCity: settings.companyCity || "",
        companyPhone: settings.companyPhone || "",
        companyEmail: settings.companyEmail || "",
        companyWebsite: settings.companyWebsite || "",
        companySiret: settings.companySiret || "",
        companyTvaNumber: settings.companyTvaNumber || "",
        companyIban: settings.companyIban || "",
        companySwift: settings.companySwift || "",
        companyLogo: settings.companyLogo || "",
        dailyRevenueObjective: (settings as any).dailyRevenueObjective || "0",
        dailyReportEnabled: (settings as any).dailyReportEnabled ?? false,
        dailyReportTime: (settings as any).dailyReportTime || "21:00",
        dailyReportRecipients: (settings as any).dailyReportRecipients || "contact@myjantes.com",
        customFields: (settings as any).customFields || [],
      });
      if (settings.companyLogo) {
        setLogoPreview(settings.companyLogo);
      }
    }
  }, [settings, form]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      return apiRequest("PATCH", "/api/admin/settings", data);
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: "Paramètres mis à jour avec succès",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message || "Échec de la mise à jour des paramètres",
        variant: "destructive",
      });
    },
  });

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Erreur",
        description: "Veuillez sélectionner une image",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "Erreur",
        description: "L'image ne doit pas dépasser 2 Mo",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setLogoPreview(base64);
      form.setValue("companyLogo", base64);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    form.setValue("companyLogo", "");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const addCustomField = () => {
    const currentFields = form.getValues("customFields") || [];
    form.setValue("customFields", [
      ...currentFields,
      { id: crypto.randomUUID(), label: "Nouveau champ", type: "text", target: "both" }
    ]);
  };

  const removeCustomField = (id: string) => {
    const currentFields = form.getValues("customFields") || [];
    form.setValue("customFields", currentFields.filter(f => f.id !== id));
  };

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    updateSettingsMutation.mutate(data);
  };

  if (isLoading || !isAdmin) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-full overflow-x-hidden">
      <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-admin-settings-title">Paramètres de l'Application</h1>

      <Card>
        <CardHeader className="p-4 md:p-6">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg md:text-xl">Paramètres Généraux</CardTitle>
          </div>
          <CardDescription>Configurez les paramètres par défaut et les informations de l'entreprise</CardDescription>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          {settingsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Paramètres par défaut</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="defaultWheelCount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre de jantes par défaut</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={4}
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                              data-testid="input-default-wheel-count"
                            />
                          </FormControl>
                          <FormDescription>1 à 4 jantes</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="defaultDiameter"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Diamètre par défaut</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-default-diameter" />
                          </FormControl>
                          <FormDescription>Ex: 17</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="defaultTaxRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Taux de TVA par défaut (%)</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-default-tax-rate" />
                          </FormControl>
                          <FormDescription>Ex: 20.00</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-lg">Informations de l'entreprise</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex flex-col gap-4 p-4 border border-border rounded-lg bg-muted/30">
                      <FormLabel>Logo de l'entreprise</FormLabel>
                      <div className="flex items-center gap-4 flex-wrap">
                        {logoPreview ? (
                          <div className="relative">
                            <img
                              src={logoPreview}
                              alt="Logo de l'entreprise"
                              className="h-20 w-auto max-w-[200px] object-contain border border-border rounded-md bg-white p-2"
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="destructive"
                              className="absolute -top-2 -right-2 h-6 w-6"
                              onClick={handleRemoveLogo}
                              data-testid="button-remove-logo"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <div className="h-20 w-40 border-2 border-dashed border-border rounded-md flex items-center justify-center bg-muted/50">
                            <span className="text-sm text-muted-foreground">Aucun logo</span>
                          </div>
                        )}
                        <div className="flex flex-col gap-2">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleLogoUpload}
                            className="hidden"
                            id="logo-upload"
                            data-testid="input-logo-upload"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            data-testid="button-upload-logo"
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            {logoPreview ? "Changer le logo" : "Télécharger un logo"}
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="companyName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nom de l'entreprise *</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-company-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="companyEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email de contact</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} data-testid="input-company-email" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Objectifs</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="dailyRevenueObjective"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Objectif CA journalier</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="Ex: 500"
                              {...field}
                              value={field.value || ""}
                              data-testid="input-daily-revenue-objective"
                            />
                          </FormControl>
                          <FormDescription>Montant cible par jour (visible sur le tableau de bord)</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Mail className="h-5 w-5 text-primary" />
                    Rapport Quotidien par Email
                  </h3>
                  <p className="text-sm text-muted-foreground">Recevez un résumé quotidien de votre activité par email (CA du jour, objectif mensuel, projection...).</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="dailyReportEnabled"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value as boolean}
                              onChange={field.onChange}
                              className="h-4 w-4 accent-primary cursor-pointer"
                              data-testid="checkbox-daily-report-enabled"
                            />
                          </FormControl>
                          <div>
                            <FormLabel className="cursor-pointer">Activer le rapport quotidien</FormLabel>
                            <FormDescription>Envoi automatique chaque jour</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="dailyReportTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Heure d'envoi</FormLabel>
                          <FormControl>
                            <Input
                              type="time"
                              {...field}
                              value={field.value || "21:00"}
                              data-testid="input-daily-report-time"
                            />
                          </FormControl>
                          <FormDescription>Heure d'envoi (fuseau Europe/Paris)</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="dailyReportRecipients"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Destinataires</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="contact@myjantes.com, autre@email.com"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-daily-report-recipients"
                          />
                        </FormControl>
                        <FormDescription>Adresses email séparées par des virgules</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DailyReportTestButton />
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-lg">Champs personnalisés</h3>
                    <Button type="button" variant="outline" size="sm" onClick={addCustomField}>
                      <Plus className="h-4 w-4 mr-2" />
                      Ajouter un champ
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">Ajoutez des champs personnalisés qui apparaîtront sur vos devis et factures.</p>
                  
                  <div className="space-y-3">
                    {form.watch("customFields")?.map((field, index) => (
                      <div key={field.id} className="flex items-end gap-3 p-3 border rounded-lg bg-muted/10">
                        <div className="flex-1 space-y-2">
                          <Label>Libellé du champ</Label>
                          <Input 
                            value={field.label} 
                            onChange={(e) => {
                              const fields = [...(form.getValues("customFields") || [])];
                              fields[index].label = e.target.value;
                              form.setValue("customFields", fields);
                            }}
                          />
                        </div>
                        <div className="w-32 space-y-2">
                          <Label>Type</Label>
                          <select 
                            className="w-full h-10 px-3 border rounded-md bg-background text-sm"
                            value={field.type}
                            onChange={(e) => {
                              const fields = [...(form.getValues("customFields") || [])];
                              fields[index].type = e.target.value as any;
                              form.setValue("customFields", fields);
                            }}
                          >
                            <option value="text">Texte</option>
                            <option value="number">Nombre</option>
                            <option value="date">Date</option>
                          </select>
                        </div>
                        <div className="w-32 space-y-2">
                          <Label>Cible</Label>
                          <select 
                            className="w-full h-10 px-3 border rounded-md bg-background text-sm"
                            value={field.target}
                            onChange={(e) => {
                              const fields = [...(form.getValues("customFields") || [])];
                              fields[index].target = e.target.value as any;
                              form.setValue("customFields", fields);
                            }}
                          >
                            <option value="quote">Devis</option>
                            <option value="invoice">Facture</option>
                            <option value="both">Les deux</option>
                          </select>
                        </div>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon" 
                          className="text-destructive"
                          onClick={() => removeCustomField(field.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {(!form.watch("customFields") || form.watch("customFields")?.length === 0) && (
                      <p className="text-sm text-center py-4 text-muted-foreground border border-dashed rounded-lg">
                        Aucun champ personnalisé configuré.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={updateSettingsMutation.isPending}>
                    {updateSettingsMutation.isPending ? "Enregistrement..." : "Enregistrer les paramètres"}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <CardTitle>Informations Légales de l'Entreprise</CardTitle>
          </div>
          <CardDescription>
            Données utilisées pour la facturation électronique (Factur-X) et les documents officiels
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GarageLegalSection />
        </CardContent>
      </Card>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CloudUpload className="h-5 w-5" />
            Migration des photos vers Google Drive
          </CardTitle>
          <CardDescription>
            Migrer les photos stockées localement (/uploads/) vers Google Drive
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MigrationSection />
        </CardContent>
      </Card>
    </div>
  );
}