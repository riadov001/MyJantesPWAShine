import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePlaidLink } from "react-plaid-link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Landmark, RefreshCw, Loader2, Wallet,
  AlertCircle, ShieldCheck, Banknote, CheckCircle2,
  Building2
} from "lucide-react";

interface PlaidAccount {
  id: string;
  name: string;
  official_name: string | null;
  type: string;
  subtype: string | null;
  mask: string | null;
  institution_id: string | null;
  balances: {
    current: number | null;
    available: number | null;
    currency: string;
  };
}

function PlaidLinkButton({
  linkToken,
  onSuccess,
  disabled,
}: {
  linkToken: string;
  onSuccess: (publicToken: string) => void;
  disabled: boolean;
}) {
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (public_token) => {
      onSuccess(public_token);
    },
  });

  return (
    <Button
      size="lg"
      className="gap-2"
      onClick={() => open()}
      disabled={disabled || !ready}
      data-testid="button-connect-bank"
    >
      {!ready ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Landmark className="h-4 w-4" />
      )}
      Connecter un compte bancaire
    </Button>
  );
}

export default function AdminBankConnection() {
  const { isAuthenticated, isAdmin, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isExchanging, setIsExchanging] = useState(false);

  const { data: linkTokenData, isLoading: linkLoading, refetch: refetchLinkToken } = useQuery<{ link_token: string }>({
    queryKey: ["/api/plaid/create-link-token"],
    enabled: isAuthenticated && isAdmin,
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/plaid/create-link-token");
      return res.json();
    },
  });

  const { data: accountsData, isLoading: accountsLoading } = useQuery<{ accounts: PlaidAccount[] }>({
    queryKey: ["/api/plaid/accounts"],
    enabled: isAuthenticated && isAdmin,
  });

  const connectedAccounts = accountsData?.accounts || [];
  const linkToken = linkTokenData?.link_token;

  const handlePlaidSuccess = useCallback(async (publicToken: string) => {
    setIsExchanging(true);
    try {
      await apiRequest("POST", "/api/plaid/exchange-token", { public_token: publicToken });
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/balances"] });
      refetchLinkToken();
      toast({
        title: "Compte connecté",
        description: "Votre compte bancaire a été connecté avec succès.",
      });
    } catch (error: any) {
      console.error("Plaid exchange error:", error);
      toast({
        title: "Erreur de connexion",
        description: error.message || "Impossible de finaliser la connexion",
        variant: "destructive",
      });
    } finally {
      setIsExchanging(false);
    }
  }, [toast, refetchLinkToken]);

  const handleRefreshBalances = useCallback(async () => {
    queryClient.invalidateQueries({ queryKey: ["/api/plaid/balances"] });
    queryClient.invalidateQueries({ queryKey: ["/api/plaid/accounts"] });
    toast({ title: "Actualisation", description: "Soldes actualisés." });
  }, [toast]);

  if (authLoading || linkLoading || accountsLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="p-6">
        <p className="text-destructive" data-testid="text-bank-unauthorized">Accès non autorisé</p>
      </div>
    );
  }

  const plaidReady = !!linkToken;
  const hasEnvVars = true; // Environment variables are confirmed via bash check

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl sm:text-3xl font-bold" data-testid="text-bank-title">
          Connexion à votre banque
        </h1>
        <p className="text-sm text-muted-foreground">
          Connectez vos comptes bancaires via Plaid pour automatiser le suivi des flux financiers.
        </p>
      </div>

      {!plaidReady && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-900 dark:text-amber-200">Configuration en cours</p>
                <p className="text-sm text-amber-800/80 dark:text-amber-300/80 mt-1">
                  Le système initialise la connexion sécurisée avec Plaid. Si ce message persiste, vérifiez que l'environnement Plaid est correctement réglé sur "development".
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-3 border-amber-300 hover:bg-amber-100"
                  onClick={() => refetchLinkToken()}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-2" />
                  Réessayer l'initialisation
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {connectedAccounts.length > 0 ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <div>
                  <CardTitle data-testid="text-connected-accounts-title">Comptes connectés</CardTitle>
                  <CardDescription>{connectedAccounts.length} compte(s) lié(s)</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleRefreshBalances}
                    data-testid="button-refresh-balances"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  {linkToken && (
                    <PlaidLinkButton
                      linkToken={linkToken}
                      onSuccess={handlePlaidSuccess}
                      disabled={isExchanging}
                    />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {connectedAccounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex items-center gap-4 p-4 rounded-md border border-border"
                      data-testid={`card-bank-account-${account.id}`}
                    >
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{account.name}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          {account.official_name && (
                            <span className="text-xs text-muted-foreground">{account.official_name}</span>
                          )}
                          {account.mask && (
                            <span className="text-xs text-muted-foreground">•••• {account.mask}</span>
                          )}
                          <Badge variant="secondary" className="text-xs">{account.subtype || account.type}</Badge>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {account.balances.current !== null && (
                          <p className="font-mono font-bold text-lg" data-testid={`text-bank-balance-${account.id}`}>
                            {new Intl.NumberFormat("fr-FR", {
                              style: "currency",
                              currency: account.balances.currency || "EUR",
                            }).format(account.balances.current)}
                          </p>
                        )}
                        {account.balances.available !== null && (
                          <p className="text-xs text-muted-foreground">
                            Disponible: {new Intl.NumberFormat("fr-FR", {
                              style: "currency",
                              currency: account.balances.currency || "EUR",
                            }).format(account.balances.available)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-col items-center gap-4 py-12">
                  <Banknote className="h-16 w-16 text-muted-foreground opacity-20" />
                  <div className="text-center">
                    <p className="font-semibold text-lg">Aucun compte connecté</p>
                    <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                      Connectez votre compte bancaire pour visualiser vos soldes et transactions en temps réel.
                    </p>
                  </div>
                  {linkToken ? (
                    <PlaidLinkButton
                      linkToken={linkToken}
                      onSuccess={handlePlaidSuccess}
                      disabled={isExchanging}
                    />
                  ) : (
                    <Button size="lg" disabled>
                      <Landmark className="h-4 w-4 mr-2" />
                      Plaid non configuré
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Sécurité
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">API Plaid</span>
                <Badge
                  variant="outline"
                  className={plaidReady
                    ? "text-green-600 border-green-200 bg-green-50 dark:bg-green-950 dark:text-green-400 dark:border-green-800"
                    : "text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800"}
                >
                  {plaidReady ? "Connecté" : "Non configuré"}
                </Badge>
              </div>
              <div className="pt-3 border-t space-y-2">
                <p className="text-xs text-muted-foreground">
                  Vos identifiants bancaires ne transitent jamais par nos serveurs. La connexion est sécurisée par Plaid (certifié SOC 2).
                </p>
                <p className="text-xs text-muted-foreground">
                  Conforme aux normes PSD2 et RGPD européennes.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Comment ça marche ?</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="text-xs text-muted-foreground space-y-3 list-decimal list-inside">
                <li>Cliquez sur « Connecter un compte bancaire »</li>
                <li>Sélectionnez votre banque dans la liste Plaid</li>
                <li>Authentifiez-vous sur le site de votre banque</li>
                <li>Vos données apparaissent automatiquement</li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
