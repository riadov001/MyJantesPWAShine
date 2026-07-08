import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Building2, Plus, Pencil, Trash2, Users, MapPin, Phone, Mail } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Garage, InsertGarage, User } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertGarageSchema } from "@shared/schema";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const formSchema = insertGarageSchema.extend({
  name: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
  slug: z.string().min(2, "Le slug doit contenir au moins 2 caractères").regex(/^[a-z0-9-]+$/, "Le slug ne doit contenir que des lettres minuscules, chiffres et tirets"),
  defaultWheelCount: z.coerce.number().min(1).max(4),
  defaultTaxRate: z.string().refine((val) => !isNaN(parseFloat(val)), {
    message: "Le taux de TVA doit être un nombre",
  }),
});

type FormData = z.infer<typeof formSchema>;

export default function AdminGarages() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, isSuperAdmin } = useAuth();
  const [selectedGarage, setSelectedGarage] = useState<Garage | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [garageToDelete, setGarageToDelete] = useState<Garage | null>(null);
  const [isUsersDialogOpen, setIsUsersDialogOpen] = useState(false);
  const [garageForUsers, setGarageForUsers] = useState<Garage | null>(null);

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !isSuperAdmin)) {
      toast({
        title: "Non autorisé",
        description: "Seul le super administrateur peut accéder à cette page.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 500);
    }
  }, [isAuthenticated, isLoading, isSuperAdmin, toast]);

  const { data: garages, isLoading: garagesLoading } = useQuery<Garage[]>({
    queryKey: ["/api/superadmin/garages"],
    enabled: isAuthenticated && isSuperAdmin,
  });

  const { data: allUsers } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAuthenticated && isSuperAdmin,
  });

  const { data: garageUsers, isLoading: garageUsersLoading } = useQuery<User[]>({
    queryKey: ["/api/superadmin/garages", garageForUsers?.id, "users"],
    enabled: isAuthenticated && isSuperAdmin && !!garageForUsers?.id,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      slug: "",
      tagline: "",
      primaryColor: "#dc2626",
      secondaryColor: "#1f2937",
      address: "",
      city: "",
      postalCode: "",
      phone: "",
      email: "",
      website: "",
      siret: "",
      tvaNumber: "",
      iban: "",
      swift: "",
      bankName: "",
      defaultWheelCount: 4,
      defaultDiameter: "17",
      defaultTaxRate: "20.00",
      wheelCountOptions: "1,2,3,4",
      diameterOptions: "14,15,16,17,18,19,20,21,22",
      isActive: true,
    },
  });

  useEffect(() => {
    if (selectedGarage) {
      form.reset({
        name: selectedGarage.name,
        slug: selectedGarage.slug,
        tagline: selectedGarage.tagline || "",
        primaryColor: selectedGarage.primaryColor || "#dc2626",
        secondaryColor: selectedGarage.secondaryColor || "#1f2937",
        address: selectedGarage.address || "",
        city: selectedGarage.city || "",
        postalCode: selectedGarage.postalCode || "",
        phone: selectedGarage.phone || "",
        email: selectedGarage.email || "",
        website: selectedGarage.website || "",
        siret: selectedGarage.siret || "",
        tvaNumber: selectedGarage.tvaNumber || "",
        iban: selectedGarage.iban || "",
        swift: selectedGarage.swift || "",
        bankName: selectedGarage.bankName || "",
        defaultWheelCount: selectedGarage.defaultWheelCount,
        defaultDiameter: selectedGarage.defaultDiameter,
        defaultTaxRate: selectedGarage.defaultTaxRate,
        wheelCountOptions: selectedGarage.wheelCountOptions,
        diameterOptions: selectedGarage.diameterOptions,
        isActive: selectedGarage.isActive,
      });
    } else {
      form.reset({
        name: "",
        slug: "",
        tagline: "",
        primaryColor: "#dc2626",
        secondaryColor: "#1f2937",
        address: "",
        city: "",
        postalCode: "",
        phone: "",
        email: "",
        website: "",
        siret: "",
        tvaNumber: "",
        iban: "",
        swift: "",
        bankName: "",
        defaultWheelCount: 4,
        defaultDiameter: "17",
        defaultTaxRate: "20.00",
        wheelCountOptions: "1,2,3,4",
        diameterOptions: "14,15,16,17,18,19,20,21,22",
        isActive: true,
      });
    }
  }, [selectedGarage, form]);

  const createGarageMutation = useMutation({
    mutationFn: async (data: FormData) => {
      return apiRequest("POST", "/api/superadmin/garages", data);
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: "Garage créé avec succès",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/garages"] });
      setIsFormOpen(false);
      setSelectedGarage(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message || "Échec de la création du garage",
        variant: "destructive",
      });
    },
  });

  const updateGarageMutation = useMutation({
    mutationFn: async (data: FormData) => {
      return apiRequest("PATCH", `/api/superadmin/garages/${selectedGarage?.id}`, data);
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: "Garage mis à jour avec succès",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/garages"] });
      setIsFormOpen(false);
      setSelectedGarage(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message || "Échec de la mise à jour du garage",
        variant: "destructive",
      });
    },
  });

  const deleteGarageMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/superadmin/garages/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: "Garage supprimé avec succès",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/garages"] });
      setIsDeleteDialogOpen(false);
      setGarageToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message || "Échec de la suppression du garage",
        variant: "destructive",
      });
    },
  });

  const assignUserMutation = useMutation({
    mutationFn: async ({ garageId, userId }: { garageId: string; userId: string }) => {
      return apiRequest("POST", `/api/superadmin/garages/${garageId}/users/${userId}`);
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: "Utilisateur assigné au garage",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/garages", garageForUsers?.id, "users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message || "Échec de l'assignation",
        variant: "destructive",
      });
    },
  });

  const removeUserMutation = useMutation({
    mutationFn: async ({ garageId, userId }: { garageId: string; userId: string }) => {
      return apiRequest("DELETE", `/api/superadmin/garages/${garageId}/users/${userId}`);
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: "Utilisateur retiré du garage",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/garages", garageForUsers?.id, "users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message || "Échec du retrait",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    if (selectedGarage) {
      updateGarageMutation.mutate(data);
    } else {
      createGarageMutation.mutate(data);
    }
  };

  const handleEdit = (garage: Garage) => {
    setSelectedGarage(garage);
    setIsFormOpen(true);
  };

  const handleDelete = (garage: Garage) => {
    setGarageToDelete(garage);
    setIsDeleteDialogOpen(true);
  };

  const handleManageUsers = (garage: Garage) => {
    setGarageForUsers(garage);
    setIsUsersDialogOpen(true);
  };

  const unassignedUsers = allUsers?.filter(u => !u.garageId && u.role !== "superadmin") || [];

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Gestion des Garages</h1>
            <p className="text-muted-foreground">
              Gérez les différents garages et leurs configurations
            </p>
          </div>
        </div>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-garage" onClick={() => setSelectedGarage(null)}>
              <Plus className="h-4 w-4 mr-2" />
              Ajouter un garage
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>
                {selectedGarage ? "Modifier le garage" : "Ajouter un garage"}
              </DialogTitle>
              <DialogDescription>
                {selectedGarage
                  ? "Modifiez les informations du garage"
                  : "Créez un nouveau garage avec ses informations"}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <Tabs defaultValue="general" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="general">Général</TabsTrigger>
                    <TabsTrigger value="contact">Contact</TabsTrigger>
                    <TabsTrigger value="banking">Bancaire</TabsTrigger>
                    <TabsTrigger value="settings">Paramètres</TabsTrigger>
                  </TabsList>

                  <TabsContent value="general" className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nom du garage *</FormLabel>
                            <FormControl>
                              <Input data-testid="input-garage-name" placeholder="Mon Garage" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="slug"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Identifiant URL *</FormLabel>
                            <FormControl>
                              <Input data-testid="input-garage-slug" placeholder="mon-garage" {...field} />
                            </FormControl>
                            <FormDescription>
                              Utilisé dans l'URL (ex: /garage/mon-garage)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="tagline"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Slogan</FormLabel>
                          <FormControl>
                            <Input data-testid="input-garage-tagline" placeholder="Votre expert en jantes" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="primaryColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Couleur principale</FormLabel>
                            <FormControl>
                              <div className="flex gap-2">
                                <Input type="color" data-testid="input-primary-color" {...field} value={field.value || "#dc2626"} className="w-16 h-10 p-1" />
                                <Input placeholder="#dc2626" {...field} value={field.value || ""} className="flex-1" />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="secondaryColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Couleur secondaire</FormLabel>
                            <FormControl>
                              <div className="flex gap-2">
                                <Input type="color" data-testid="input-secondary-color" {...field} value={field.value || "#1f2937"} className="w-16 h-10 p-1" />
                                <Input placeholder="#1f2937" {...field} value={field.value || ""} className="flex-1" />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel>Garage actif</FormLabel>
                            <FormDescription>
                              Désactiver empêchera l'accès au garage
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              data-testid="switch-garage-active"
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </TabsContent>

                  <TabsContent value="contact" className="space-y-4 mt-4">
                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Adresse</FormLabel>
                          <FormControl>
                            <Textarea data-testid="input-garage-address" placeholder="123 Rue de la Jante" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="postalCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Code postal</FormLabel>
                            <FormControl>
                              <Input data-testid="input-garage-postal" placeholder="75001" {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Ville</FormLabel>
                            <FormControl>
                              <Input data-testid="input-garage-city" placeholder="Paris" {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Téléphone</FormLabel>
                            <FormControl>
                              <Input data-testid="input-garage-phone" placeholder="01 23 45 67 89" {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input data-testid="input-garage-email" type="email" placeholder="contact@mongarage.fr" {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="website"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Site web</FormLabel>
                          <FormControl>
                            <Input data-testid="input-garage-website" placeholder="https://www.mongarage.fr" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TabsContent>

                  <TabsContent value="banking" className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="siret"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>SIRET</FormLabel>
                            <FormControl>
                              <Input data-testid="input-garage-siret" placeholder="123 456 789 00012" {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="tvaNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>N° TVA</FormLabel>
                            <FormControl>
                              <Input data-testid="input-garage-tva" placeholder="FR12345678901" {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="bankName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nom de la banque</FormLabel>
                          <FormControl>
                            <Input data-testid="input-garage-bank" placeholder="Banque Exemple" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="iban"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>IBAN</FormLabel>
                            <FormControl>
                              <Input data-testid="input-garage-iban" placeholder="FR76 1234 5678 9012 3456 7890 123" {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="swift"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>BIC/SWIFT</FormLabel>
                            <FormControl>
                              <Input data-testid="input-garage-swift" placeholder="BNPAFRPP" {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="settings" className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="defaultWheelCount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nombre de jantes par défaut</FormLabel>
                            <FormControl>
                              <Input data-testid="input-wheel-count" type="number" min="1" max="4" {...field} />
                            </FormControl>
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
                              <Input data-testid="input-tax-rate" placeholder="20.00" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="defaultDiameter"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Diamètre par défaut</FormLabel>
                          <FormControl>
                            <Input data-testid="input-diameter" placeholder="17" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="wheelCountOptions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Options nombre de jantes</FormLabel>
                          <FormControl>
                            <Input data-testid="input-wheel-options" placeholder="1,2,3,4" {...field} />
                          </FormControl>
                          <FormDescription>
                            Liste séparée par des virgules
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="diameterOptions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Options diamètres</FormLabel>
                          <FormControl>
                            <Input data-testid="input-diameter-options" placeholder="14,15,16,17,18,19,20,21,22" {...field} />
                          </FormControl>
                          <FormDescription>
                            Liste séparée par des virgules
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TabsContent>
                </Tabs>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsFormOpen(false)}
                  >
                    Annuler
                  </Button>
                  <Button
                    type="submit"
                    data-testid="button-submit-garage"
                    disabled={createGarageMutation.isPending || updateGarageMutation.isPending}
                  >
                    {selectedGarage ? "Mettre à jour" : "Créer"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {garagesLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : garages && garages.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {garages.map((garage) => (
            <Card key={garage.id} className="hover-elevate">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-md flex items-center justify-center"
                      style={{ backgroundColor: garage.primaryColor || "#dc2626" }}
                    >
                      <Building2 className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{garage.name}</CardTitle>
                      <CardDescription>/{garage.slug}</CardDescription>
                    </div>
                  </div>
                  <Badge variant={garage.isActive ? "default" : "secondary"}>
                    {garage.isActive ? "Actif" : "Inactif"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {garage.tagline && (
                  <p className="text-sm text-muted-foreground">{garage.tagline}</p>
                )}
                <div className="space-y-2 text-sm">
                  {garage.city && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span>{garage.city}</span>
                    </div>
                  )}
                  {garage.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      <span>{garage.phone}</span>
                    </div>
                  )}
                  {garage.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      <span>{garage.email}</span>
                    </div>
                  )}
                </div>
                <Separator />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`button-users-garage-${garage.id}`}
                    onClick={() => handleManageUsers(garage)}
                  >
                    <Users className="h-4 w-4 mr-1" />
                    Utilisateurs
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`button-edit-garage-${garage.id}`}
                    onClick={() => handleEdit(garage)}
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    Modifier
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    data-testid={`button-delete-garage-${garage.id}`}
                    onClick={() => handleDelete(garage)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Aucun garage</h3>
            <p className="text-muted-foreground text-center mb-4">
              Commencez par créer votre premier garage pour gérer plusieurs établissements.
            </p>
            <Button onClick={() => setIsFormOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Créer un garage
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le garage</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer le garage "{garageToDelete?.name}" ?
              Cette action est irréversible et supprimera toutes les données associées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-delete"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => garageToDelete && deleteGarageMutation.mutate(garageToDelete.id)}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isUsersDialogOpen} onOpenChange={setIsUsersDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Utilisateurs de {garageForUsers?.name}</DialogTitle>
            <DialogDescription>
              Gérez les utilisateurs assignés à ce garage
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Utilisateurs assignés</h4>
              {garageUsersLoading ? (
                <Skeleton className="h-20" />
              ) : garageUsers && garageUsers.length > 0 ? (
                <div className="space-y-2">
                  {garageUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">
                          {user.firstName} {user.lastName}
                        </p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{user.role}</Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid={`button-remove-user-${user.id}`}
                          onClick={() =>
                            garageForUsers &&
                            removeUserMutation.mutate({
                              garageId: garageForUsers.id,
                              userId: user.id,
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Aucun utilisateur assigné à ce garage
                </p>
              )}
            </div>

            <Separator />

            <div>
              <h4 className="font-medium mb-2">Assigner un utilisateur</h4>
              {unassignedUsers.length > 0 ? (
                <div className="space-y-2">
                  {unassignedUsers.slice(0, 5).map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">
                          {user.firstName} {user.lastName}
                        </p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{user.role}</Badge>
                        <Button
                          size="sm"
                          data-testid={`button-assign-user-${user.id}`}
                          onClick={() =>
                            garageForUsers &&
                            assignUserMutation.mutate({
                              garageId: garageForUsers.id,
                              userId: user.id,
                            })
                          }
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Assigner
                        </Button>
                      </div>
                    </div>
                  ))}
                  {unassignedUsers.length > 5 && (
                    <p className="text-sm text-muted-foreground text-center">
                      +{unassignedUsers.length - 5} autres utilisateurs disponibles
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Tous les utilisateurs sont déjà assignés à un garage
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
