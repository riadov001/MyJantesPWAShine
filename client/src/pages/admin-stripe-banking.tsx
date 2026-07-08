import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { loadStripe } from "@stripe/stripe-js";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Landmark,
  RefreshCw,
  Loader2,
  Wallet,
  AlertCircle,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Building2,
  Trash2,
  ArrowUpRight,
  ArrowDownLeft,
  BarChart3,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";

interface StripeAccount {
  id: string;
  display_name: string;
  institution_name: string;
  last4: string | null;
  category: string;
  subcategory: string | null;
  currency: string;
  balance: {
    current: number | null;
    as_of: string | null;
  };
  status: string;
  permissions: string[];
}

interface StripeTransaction {
  id: string;
  amount: number;
  currency: string;
  description: string;
  status: string;
  transacted_at: string;
  category: "credit" | "debit";
}

function formatCurrency(amount: number | null, currency = "eur"): string {
  if (amount === null) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export default function AdminStripeBanking() {
  const { isAuthenticated, isAdmin, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const { data: statusData } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/stripe-financial/status"],
    enabled: isAuthenticated && isAdmin,
  });

  const { data: configData } = useQuery<{ publishableKey: string | null }>({
    queryKey: ["/api/stripe/config"],
    enabled: isAuthenticated && isAdmin,
  });

  const {
    data: accountsData,
    isLoading: accountsLoading,
    refetch: refetchAccounts,
  } = useQuery<{ accounts: StripeAccount[] }>({
    queryKey: ["/api/stripe-financial/accounts"],
    enabled: isAuthenticated && isAdmin,
  });

  const {
    data: transactionsData,
    isLoading: txLoading,
  } = useQuery<{ transactions: StripeTransaction[] }>({
    queryKey: ["/api/stripe-financial/transactions", selectedAccountId],
    queryFn: async () => {
      const res = await fetch(`/api/stripe-financial/transactions/${selectedAccountId}?limit=200`, {
        credentials: "include",
      });
      return res.json();
    },
    enabled: !!selectedAccountId && isAuthenticated && isAdmin,
  });

  const refreshBalanceMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const res = await apiRequest("POST", `/api/stripe-financial/refresh-balance/${accountId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stripe-financial/accounts"] });
      toast({ title: "Solde actualisé", description: "Le solde a été mis à jour." });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const res = await apiRequest("DELETE", `/api/stripe-financial/accounts/${accountId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stripe-financial/accounts"] });
      if (selectedAccountId && accountsData?.accounts.length === 1) {
        setSelectedAccountId(null);
      }
      toast({ title: "Compte déconnecté", description: "Le compte bancaire a été retiré." });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const handleConnect = useCallback(async () => {
    if (!configData?.publishableKey) {
      toast({
        title: "Clé Stripe manquante",
        description: "STRIPE_PUBLISHABLE_KEY non configuré.",
        variant: "destructive",
      });
      return;
    }
    setIsConnecting(true);
    try {
      const sessionRes = await apiRequest("POST", "/api/stripe-financial/create-session");
      const sessionData = await sessionRes.json();
      if (!sessionData.client_secret) {
        throw new Error(sessionData.message || "Impossible de créer la session");
      }

      const stripe = await loadStripe(configData.publishableKey);
      if (!stripe) throw new Error("Stripe.js non chargé");

      const { financialConnectionsSession, error } = await (stripe as any).collectFinancialConnectionsAccounts({
        clientSecret: sessionData.client_secret,
      });

      if (error) {
        console.error("[StripeBanking] Stripe.js error:", error);
        throw new Error(error.message || "Erreur lors de la collecte des comptes");
      }

      if (!financialConnectionsSession) {
        console.log("[StripeBanking] User closed the modal without connecting");
        return;
      }

      console.log("[StripeBanking] Session complete:", financialConnectionsSession);
      console.log("[StripeBanking] Session complete, retrieving details...");
      const retrieveRes = await apiRequest("POST", "/api/stripe-financial/retrieve-session", {
        session_id: sessionData.id,
      });
      const retrieveData = await retrieveRes.json();
      queryClient.invalidateQueries({ queryKey: ["/api/stripe-financial/accounts"] });
      const count = retrieveData.count || 0;
      
      if (count === 0) {
        toast({
          title: "Aucun compte sélectionné",
          description: "La connexion a réussi mais aucun compte n'a été partagé.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Compte(s) connecté(s)",
          description: `${count} compte(s) bancaire(s) lié(s) avec succès.`,
        });
      }
    } catch (err: any) {
      console.error("[StripeBanking] connect error:", err);
      toast({
        title: "Erreur de connexion",
        description: err.message || "Impossible de connecter le compte",
        variant: "destructive",
      });
    } finally {
      setIsConnecting(false);
    }
  }, [configData?.publishableKey, toast]);

  const accounts = accountsData?.accounts || [];
  const transactions = transactionsData?.transactions || [];

  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  const totalBalance = accounts.reduce((sum, a) => sum + (a.balance.current ?? 0), 0);
  const credits = transactions.filter((t) => t.category === "credit");
  const debits = transactions.filter((t) => t.category === "debit");
  const totalCredits = credits.reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalDebits = debits.reduce((s, t) => s + Math.abs(t.amount), 0);
  const netFlow = totalCredits - totalDebits;

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  if (authLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="p-6">
        <p className="text-destructive" data-testid="text-stripe-banking-unauthorized">
          Accès non autorisé
        </p>
      </div>
    );
  }

  const isConfigured = statusData?.configured ?? false;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold" data-testid="text-stripe-banking-title">
            Banque & Comptabilité
          </h1>
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck className="h-3 w-3" />
            Stripe Financial Connections
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Connectez vos comptes bancaires via Stripe OpenBanking pour centraliser votre comptabilité.
        </p>
      </div>

      {!isConfigured && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-800 dark:text-red-200">Configuration Stripe incomplète</p>
                <div className="text-sm text-red-700 dark:text-red-300 mt-1 space-y-2">
                  <p>L'application ne détecte pas votre clé secrète. Assurez-vous d'avoir ajouté ces deux secrets dans l'onglet <b>Secrets</b> (icône cadenas) :</p>
                  <ul className="list-disc ml-5 space-y-1">
                    <li><code className="bg-red-100 dark:bg-red-900 px-1 rounded">STRIPE_SECRET_KEY_PROD</code> (doit commencer par sk_live_...)</li>
                    <li><code className="bg-red-100 dark:bg-red-900 px-1 rounded">STRIPE_PUBLISHABLE_KEY_PROD</code> (doit commencer par pk_live_...)</li>
                  </ul>
                  <p className="font-semibold">Après avoir ajouté les secrets, vous DEVEZ redémarrer l'application pour qu'ils soient pris en compte.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {accounts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-muted-foreground">Solde total</p>
                  <p className="text-2xl font-bold font-mono mt-1" data-testid="text-total-balance">
                    {formatCurrency(totalBalance)}
                  </p>
                </div>
                <Wallet className="h-8 w-8 text-primary opacity-70" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-muted-foreground">Entrées (période)</p>
                  <p className="text-2xl font-bold font-mono text-green-600 dark:text-green-400 mt-1" data-testid="text-total-credits">
                    +{formatCurrency(totalCredits)}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-500 opacity-70" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-muted-foreground">Sorties (période)</p>
                  <p className="text-2xl font-bold font-mono text-red-600 dark:text-red-400 mt-1" data-testid="text-total-debits">
                    -{formatCurrency(totalDebits)}
                  </p>
                </div>
                <TrendingDown className="h-8 w-8 text-red-500 opacity-70" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
              <CardTitle className="text-base">Comptes liés</CardTitle>
              <Button
                size="sm"
                onClick={handleConnect}
                disabled={isConnecting || !isConfigured}
                data-testid="button-connect-stripe-bank"
                className="gap-2"
              >
                {isConnecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Landmark className="h-3.5 w-3.5" />
                )}
                {isConnecting ? "Connexion..." : "Ajouter"}
              </Button>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {accountsLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : accounts.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <Landmark className="h-10 w-10 text-muted-foreground opacity-30" />
                  <div>
                    <p className="text-sm font-medium">Aucun compte connecté</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Cliquez sur « Ajouter » pour lier votre banque
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {accounts.map((acc) => (
                    <div
                      key={acc.id}
                      className={`p-3 rounded-md border cursor-pointer transition-colors hover-elevate ${
                        selectedAccountId === acc.id
                          ? "border-primary bg-primary/5"
                          : "border-border"
                      }`}
                      onClick={() => setSelectedAccountId(acc.id)}
                      data-testid={`card-stripe-account-${acc.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Building2 className="h-4 w-4 text-primary shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{acc.display_name}</p>
                            {acc.institution_name && (
                              <p className="text-xs text-muted-foreground truncate">
                                {acc.institution_name}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end shrink-0">
                          <p className="text-sm font-mono font-semibold">
                            {formatCurrency(acc.balance.current, acc.currency)}
                          </p>
                          {acc.last4 && (
                            <span className="text-xs text-muted-foreground">•••• {acc.last4}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <Badge variant="secondary" className="text-xs">
                          {acc.subcategory || acc.category}
                        </Badge>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              refreshBalanceMutation.mutate(acc.id);
                            }}
                            disabled={refreshBalanceMutation.isPending}
                            data-testid={`button-refresh-account-${acc.id}`}
                            title="Actualiser le solde"
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("Déconnecter ce compte bancaire ?")) {
                                disconnectMutation.mutate(acc.id);
                              }
                            }}
                            disabled={disconnectMutation.isPending}
                            data-testid={`button-disconnect-account-${acc.id}`}
                            title="Déconnecter ce compte"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Sécurité & Conformité
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">API Stripe</span>
                <Badge
                  variant="outline"
                  className={
                    isConfigured
                      ? "text-green-600 border-green-200 bg-green-50 dark:bg-green-950 dark:text-green-400"
                      : "text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-950 dark:text-amber-400"
                  }
                >
                  {isConfigured ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Connecté
                    </>
                  ) : (
                    "Non configuré"
                  )}
                </Badge>
              </div>
              <Separator />
              <p className="text-xs text-muted-foreground">
                Stripe Financial Connections est certifié PCI DSS Level 1. Vos identifiants bancaires ne transitent jamais par nos serveurs.
              </p>
              <p className="text-xs text-muted-foreground">
                Conforme aux directives PSD2 et RGPD européennes. Données chiffrées de bout en bout.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          {!selectedAccount ? (
            <Card>
              <CardContent className="p-12 flex flex-col items-center gap-4 text-center">
                <BarChart3 className="h-14 w-14 text-muted-foreground opacity-20" />
                <div>
                  <p className="font-semibold text-lg">Sélectionnez un compte</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {accounts.length === 0
                      ? "Commencez par connecter votre compte bancaire."
                      : "Choisissez un compte pour voir ses transactions et analyses."}
                  </p>
                </div>
                {accounts.length === 0 && isConfigured && (
                  <Button onClick={handleConnect} disabled={isConnecting} className="gap-2">
                    {isConnecting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Landmark className="h-4 w-4" />
                    )}
                    Connecter mon compte bancaire
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <Tabs defaultValue="transactions">
              <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                <div>
                  <p className="font-semibold">{selectedAccount.display_name}</p>
                  <p className="text-xs text-muted-foreground">{selectedAccount.institution_name}</p>
                </div>
                <TabsList data-testid="tabs-account">
                  <TabsTrigger value="transactions" data-testid="tab-transactions">
                    Transactions
                  </TabsTrigger>
                  <TabsTrigger value="accounting" data-testid="tab-accounting">
                    Comptabilité
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="transactions">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                    <div>
                      <CardTitle className="text-base">Mouvements</CardTitle>
                      <CardDescription>
                        {transactions.length} transaction(s) — {formatCurrency(selectedAccount.balance.current, selectedAccount.currency)} disponible
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {txLoading ? (
                      <div className="p-4 space-y-3">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Skeleton key={i} className="h-10 w-full" />
                        ))}
                      </div>
                    ) : transactions.length === 0 ? (
                      <div className="p-10 text-center text-muted-foreground text-sm">
                        Aucune transaction disponible pour ce compte.
                      </div>
                    ) : (
                      <div className="overflow-auto max-h-[500px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead>Statut</TableHead>
                              <TableHead className="text-right">Montant</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {transactions.map((tx) => (
                              <TableRow key={tx.id} data-testid={`row-transaction-${tx.id}`}>
                                <TableCell className="text-sm whitespace-nowrap">
                                  {formatDate(tx.transacted_at)}
                                </TableCell>
                                <TableCell className="text-sm max-w-[200px] truncate">
                                  {tx.description || "—"}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className="text-xs capitalize">
                                    {tx.status === "posted" ? "Comptabilisé" : tx.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <span
                                    className={`font-mono font-medium text-sm flex items-center justify-end gap-1 ${
                                      tx.category === "credit"
                                        ? "text-green-600 dark:text-green-400"
                                        : "text-red-600 dark:text-red-400"
                                    }`}
                                    data-testid={`text-tx-amount-${tx.id}`}
                                  >
                                    {tx.category === "credit" ? (
                                      <ArrowUpRight className="h-3 w-3" />
                                    ) : (
                                      <ArrowDownLeft className="h-3 w-3" />
                                    )}
                                    {tx.category === "credit" ? "+" : "-"}
                                    {formatCurrency(Math.abs(tx.amount), tx.currency)}
                                  </span>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="accounting">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="p-5">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Solde actuel</p>
                        <p className="text-xl font-bold font-mono" data-testid="text-account-balance">
                          {formatCurrency(selectedAccount.balance.current, selectedAccount.currency)}
                        </p>
                        {selectedAccount.balance.as_of && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Au {formatDate(selectedAccount.balance.as_of)}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-5">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Encaissements</p>
                        <p className="text-xl font-bold font-mono text-green-600 dark:text-green-400" data-testid="text-account-credits">
                          +{formatCurrency(totalCredits)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{credits.length} opération(s)</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-5">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Décaissements</p>
                        <p className="text-xl font-bold font-mono text-red-600 dark:text-red-400" data-testid="text-account-debits">
                          -{formatCurrency(totalDebits)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{debits.length} opération(s)</p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Résumé comptable</CardTitle>
                      <CardDescription>Analyse des flux financiers du compte sélectionné</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between py-2 border-b">
                        <span className="text-sm">Total encaissements</span>
                        <span className="font-mono font-medium text-green-600 dark:text-green-400">
                          +{formatCurrency(totalCredits)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b">
                        <span className="text-sm">Total décaissements</span>
                        <span className="font-mono font-medium text-red-600 dark:text-red-400">
                          -{formatCurrency(totalDebits)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b">
                        <span className="text-sm font-medium">Flux net</span>
                        <span
                          className={`font-mono font-bold ${
                            netFlow >= 0
                              ? "text-green-600 dark:text-green-400"
                              : "text-red-600 dark:text-red-400"
                          }`}
                          data-testid="text-net-flow"
                        >
                          {netFlow >= 0 ? "+" : ""}{formatCurrency(netFlow)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm font-medium">Solde disponible</span>
                        <span className="font-mono font-bold">
                          {formatCurrency(selectedAccount.balance.current, selectedAccount.currency)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Répartition des opérations</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {transactions.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Aucune transaction disponible.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-muted-foreground">Encaissements</span>
                              <span className="font-medium">{credits.length} opérations</span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2">
                              <div
                                className="bg-green-500 h-2 rounded-full transition-all"
                                style={{
                                  width: `${totalCredits + totalDebits > 0 ? (totalCredits / (totalCredits + totalDebits)) * 100 : 0}%`,
                                }}
                              />
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-muted-foreground">Décaissements</span>
                              <span className="font-medium">{debits.length} opérations</span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2">
                              <div
                                className="bg-red-500 h-2 rounded-full transition-all"
                                style={{
                                  width: `${totalCredits + totalDebits > 0 ? (totalDebits / (totalCredits + totalDebits)) * 100 : 0}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
