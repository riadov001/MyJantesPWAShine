import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ThemeToggle } from "@/components/theme-toggle";
import logoMyJantes from "@assets/cropped-Logo-2-1-768x543_(3)_1767977972324.png";

const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
  rememberMe: z.boolean().default(false),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showRegister, setShowRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: localStorage.getItem("rememberedEmail") || "",
      password: "",
      rememberMe: !!localStorage.getItem("rememberedEmail"),
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email, password: data.password }),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Échec de la connexion");
      }

      if (data.rememberMe) {
        localStorage.setItem("rememberedEmail", data.email);
      } else {
        localStorage.removeItem("rememberedEmail");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Connexion réussie",
        description: "Bienvenue sur MyJantes",
      });
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur de connexion",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerForm = useForm({
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
      role: "client",
      companyName: "",
      siret: "",
      tvaNumber: "",
      companyAddress: "",
    },
  });

  const selectedRole = registerForm.watch("role");

  const registerMutation = useMutation({
    mutationFn: async (data: any) => {
      if (data.password !== data.confirmPassword) {
        throw new Error("Les mots de passe ne correspondent pas");
      }

      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          firstName: data.firstName,
          lastName: data.lastName,
          role: data.role,
          companyName: data.companyName || undefined,
          siret: data.siret || undefined,
          tvaNumber: data.tvaNumber || undefined,
          companyAddress: data.companyAddress || undefined,
        }),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Échec de l'inscription");
      }

      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Compte créé",
        description: "Vous pouvez maintenant vous connecter",
      });
      setShowRegister(false);
      registerForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur d'inscription",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLogin = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  const handleRegister = (data: any) => {
    registerMutation.mutate(data);
  };

  if (showRegister) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 relative">
        <div className="absolute top-4 right-4 z-20">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm flex flex-col items-center">
          <img
            src={logoMyJantes}
            alt="MyJantes Logo"
            className="h-16 w-auto mb-8"
            data-testid="img-register-logo"
          />

          <Card className="w-full">
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold text-center mb-6" data-testid="text-register-title">Créer un compte</h2>

              <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="reg-email" className="text-sm font-medium">Email</label>
                  <Input
                    id="reg-email"
                    type="email"
                    {...registerForm.register("email")}
                    data-testid="input-register-email"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label htmlFor="reg-firstName" className="text-sm font-medium">Prénom</label>
                    <Input
                      id="reg-firstName"
                      {...registerForm.register("firstName")}
                      data-testid="input-register-firstname"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="reg-lastName" className="text-sm font-medium">Nom</label>
                    <Input
                      id="reg-lastName"
                      {...registerForm.register("lastName")}
                      data-testid="input-register-lastname"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="reg-role" className="text-sm font-medium">Type de compte</label>
                  <select
                    id="reg-role"
                    {...registerForm.register("role")}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid="select-register-role"
                  >
                    <option value="client">Client Particulier</option>
                    <option value="client_professionnel">Client Professionnel</option>
                  </select>
                </div>
                {selectedRole === "client_professionnel" && (
                  <>
                    <div className="space-y-2">
                      <label htmlFor="reg-companyName" className="text-sm font-medium">Nom de l'entreprise *</label>
                      <Input
                        id="reg-companyName"
                        {...registerForm.register("companyName")}
                        data-testid="input-register-company"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label htmlFor="reg-siret" className="text-sm font-medium">SIRET</label>
                        <Input
                          id="reg-siret"
                          {...registerForm.register("siret")}
                          data-testid="input-register-siret"
                          maxLength={14}
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="reg-tva" className="text-sm font-medium">N° TVA</label>
                        <Input
                          id="reg-tva"
                          {...registerForm.register("tvaNumber")}
                          data-testid="input-register-tva"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="reg-address" className="text-sm font-medium">Adresse</label>
                      <Input
                        id="reg-address"
                        {...registerForm.register("companyAddress")}
                        data-testid="input-register-address"
                      />
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <label htmlFor="reg-password" className="text-sm font-medium">Mot de passe</label>
                  <div className="relative">
                    <Input
                      id="reg-password"
                      type={showRegPassword ? "text" : "password"}
                      {...registerForm.register("password")}
                      data-testid="input-register-password"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 py-2"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      data-testid="button-toggle-reg-password"
                    >
                      {showRegPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="reg-confirm" className="text-sm font-medium">Confirmer le mot de passe</label>
                  <Input
                    id="reg-confirm"
                    type="password"
                    {...registerForm.register("confirmPassword")}
                    data-testid="input-register-confirm"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={registerMutation.isPending}
                  data-testid="button-register-submit"
                >
                  {registerMutation.isPending ? "Création..." : "Créer mon compte"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setShowRegister(false)}
                  data-testid="button-show-login"
                >
                  Déjà un compte ? Se connecter
                </Button>
              </form>
            </CardContent>
          </Card>

          <Link href="/" className="mt-6 text-sm text-muted-foreground flex items-center gap-1" data-testid="link-back-home">
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour à l'accueil
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 relative">
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm flex flex-col items-center">
        <img
          src={logoMyJantes}
          alt="MyJantes Logo"
          className="h-16 w-auto mb-8"
          data-testid="img-login-logo"
        />

        <Card className="w-full">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold text-center mb-6" data-testid="text-login-title">Espace client</h2>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleLogin)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="votre@email.com"
                          {...field}
                          data-testid="input-email"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mot de passe</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••"
                            {...field}
                            data-testid="input-password"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 py-2"
                            onClick={() => setShowPassword(!showPassword)}
                            data-testid="button-toggle-password"
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <FormField
                    control={form.control}
                    name="rememberMe"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-remember-me"
                          />
                        </FormControl>
                        <FormLabel className="text-sm font-normal cursor-pointer">
                          Se souvenir
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                  <Link href="/forgot-password" className="text-sm text-muted-foreground" data-testid="link-forgot-password">
                    Mot de passe oublié ?
                  </Link>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loginMutation.isPending}
                  data-testid="button-login"
                >
                  {loginMutation.isPending ? "Connexion..." : "Se connecter"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowRegister(true)}
                  data-testid="button-show-register"
                >
                  Créer un compte
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Link href="/" className="mt-6 text-sm text-muted-foreground flex items-center gap-1" data-testid="link-back-home">
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}
