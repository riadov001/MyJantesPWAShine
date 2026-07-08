import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ExternalApi } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Trash2, Globe, Key, Search, Play, Loader2, CheckCircle,
  XCircle, ChevronDown, ChevronRight, Pencil, Zap, ArrowUpDown,
  Copy, ExternalLink, RefreshCw, Shield, Eye, EyeOff,
} from "lucide-react";

type DiscoveredRoute = {
  method: string;
  path: string;
  summary: string;
  operationId: string;
  tags: string[];
  parameters: { name: string; in: string; required: boolean; type: string; description: string }[];
  requestBody: { contentType: string; schema: any; required: boolean } | null;
  responses: { code: string; description: string }[];
};

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  POST: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  PUT: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  PATCH: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  DELETE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

function RouteItem({ route, apiId, baseUrl }: { route: DiscoveredRoute; apiId: string; baseUrl: string }) {
  const [expanded, setExpanded] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testBody, setTestBody] = useState("");
  const [queryParams, setQueryParams] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const callMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/external-apis/${apiId}/call`, {
        method: route.method,
        path: route.path,
        body: testBody ? (() => { try { return JSON.parse(testBody); } catch { throw new Error("JSON invalide dans le corps de la requête"); } })() : undefined,
        queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
      });
      return res.json();
    },
    onSuccess: (data) => setTestResult(data),
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="border rounded-md" data-testid={`route-item-${route.method}-${route.path}`}>
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover-elevate"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <Badge className={`${METHOD_COLORS[route.method] || ""} font-mono text-xs no-default-hover-elevate no-default-active-elevate`}>
          {route.method}
        </Badge>
        <code className="text-sm font-mono flex-1 truncate">{route.path}</code>
        {route.summary && <span className="text-xs text-muted-foreground truncate max-w-[200px]">{route.summary}</span>}
        {route.tags.length > 0 && route.tags[0] !== "discovered" && (
          <Badge variant="outline" className="text-xs">{route.tags[0]}</Badge>
        )}
      </div>

      {expanded && (
        <div className="border-t p-4 space-y-4">
          {route.summary && <p className="text-sm text-muted-foreground">{route.summary}</p>}

          {route.parameters.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Paramètres</h4>
              <div className="space-y-2">
                {route.parameters.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="text-xs">{p.in}</Badge>
                    <code className="font-mono">{p.name}</code>
                    <span className="text-muted-foreground">({p.type})</span>
                    {p.required && <Badge variant="destructive" className="text-xs">requis</Badge>}
                    {p.in === "query" && (
                      <Input
                        className="h-7 w-32 ml-auto"
                        placeholder={p.name}
                        value={queryParams[p.name] || ""}
                        onChange={(e) => setQueryParams(prev => ({ ...prev, [p.name]: e.target.value }))}
                        data-testid={`input-param-${p.name}`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {route.requestBody && (
            <div>
              <h4 className="text-sm font-medium mb-2">Corps de la requête ({route.requestBody.contentType})</h4>
              <Textarea
                value={testBody}
                onChange={(e) => setTestBody(e.target.value)}
                placeholder='{"key": "value"}'
                className="font-mono text-sm"
                rows={4}
                data-testid="textarea-request-body"
              />
            </div>
          )}

          {route.responses.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Réponses attendues</h4>
              <div className="flex gap-2 flex-wrap">
                {route.responses.map((r, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {r.code}: {r.description}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => callMutation.mutate()}
              disabled={callMutation.isPending}
              data-testid="button-test-endpoint"
            >
              {callMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Tester
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(`${baseUrl}${route.path}`);
                toast({ title: "URL copiée" });
              }}
              data-testid="button-copy-url"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copier l'URL
            </Button>
          </div>

          {testResult && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={testResult.status < 400 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"}>
                  {testResult.status} {testResult.statusText}
                </Badge>
                <span className="text-xs text-muted-foreground">{testResult.duration}ms</span>
                <code className="text-xs text-muted-foreground truncate max-w-[300px]">{testResult.url}</code>
              </div>
              <pre className="bg-muted p-3 rounded-md text-xs overflow-auto max-h-[300px] font-mono">
                {typeof testResult.body === "string" ? testResult.body : JSON.stringify(testResult.body, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminExternalApis() {
  const { toast } = useToast();
  const [addDialog, setAddDialog] = useState(false);
  const [editDialog, setEditDialog] = useState(false);
  const [editingApi, setEditingApi] = useState<ExternalApi | null>(null);
  const [selectedApi, setSelectedApi] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [routeFilter, setRouteFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");

  const [formName, setFormName] = useState("");
  const [formBaseUrl, setFormBaseUrl] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formAuthType, setFormAuthType] = useState("none");
  const [formAuthConfig, setFormAuthConfig] = useState<Record<string, string>>({});
  const [formHeaders, setFormHeaders] = useState("");

  const { data: apis = [], isLoading } = useQuery<ExternalApi[]>({
    queryKey: ["/api/admin/external-apis"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/external-apis", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/external-apis"] });
      toast({ title: "API ajoutée" });
      setAddDialog(false);
      resetForm();
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/external-apis/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/external-apis"] });
      toast({ title: "API mise à jour" });
      setEditDialog(false);
      setEditingApi(null);
      resetForm();
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/external-apis/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/external-apis"] });
      toast({ title: "API supprimée" });
      if (selectedApi) setSelectedApi(null);
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const discoverMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/external-apis/${id}/discover`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/external-apis"] });
      toast({ title: "Découverte terminée", description: `${data.routesFound} route(s) trouvée(s)${data.specFound ? " via OpenAPI" : ""}` });
    },
    onError: (err: any) => toast({ title: "Erreur de découverte", description: err.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/external-apis/${id}/test-connection`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Connexion réussie", description: `HTTP ${data.status} en ${data.duration}ms` });
      } else {
        toast({ title: "Connexion échouée", description: data.statusText, variant: "destructive" });
      }
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setFormName("");
    setFormBaseUrl("");
    setFormDescription("");
    setFormAuthType("none");
    setFormAuthConfig({});
    setFormHeaders("");
  };

  const [authConfigChanged, setAuthConfigChanged] = useState(false);

  const openEdit = (api: ExternalApi) => {
    setEditingApi(api);
    setFormName(api.name);
    setFormBaseUrl(api.baseUrl);
    setFormDescription(api.description || "");
    setFormAuthType(api.authType);
    setFormAuthConfig({});
    setAuthConfigChanged(false);
    setFormHeaders(Object.entries((api.defaultHeaders || {}) as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join("\n"));
    setEditDialog(true);
  };

  const updateAuthConfig = (key: string, value: string) => {
    setFormAuthConfig(prev => ({ ...prev, [key]: value }));
    setAuthConfigChanged(true);
  };

  const handleSubmit = (isEdit: boolean) => {
    const headersObj: Record<string, string> = {};
    formHeaders.split("\n").forEach(line => {
      const idx = line.indexOf(":");
      if (idx > 0) headersObj[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    });

    const data: any = {
      name: formName,
      baseUrl: formBaseUrl.replace(/\/$/, ""),
      description: formDescription || null,
      authType: formAuthType,
      defaultHeaders: headersObj,
    };

    if (!isEdit || authConfigChanged) {
      data.authConfig = formAuthConfig;
    }

    if (isEdit && editingApi) {
      updateMutation.mutate({ id: editingApi.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const currentApi = apis.find(a => a.id === selectedApi);
  const routes = ((currentApi?.discoveredRoutes || []) as DiscoveredRoute[]).filter(r => {
    if (methodFilter !== "all" && r.method !== methodFilter) return false;
    if (routeFilter && !r.path.toLowerCase().includes(routeFilter.toLowerCase()) && !r.summary.toLowerCase().includes(routeFilter.toLowerCase())) return false;
    return true;
  });

  const renderAuthFields = () => {
    switch (formAuthType) {
      case "bearer":
        return (
          <div>
            <Label>Token</Label>
            <div className="flex items-center gap-2">
              <Input
                type={showSecrets["token"] ? "text" : "password"}
                value={formAuthConfig.token || ""}
                onChange={(e) => updateAuthConfig("token", e.target.value)}
                placeholder={editingApi && !authConfigChanged ? "Saisir un nouveau token..." : "eyJhbGciOiJIUzI1NiIsInR..."}
                data-testid="input-auth-token"
              />
              <Button size="icon" variant="ghost" onClick={() => setShowSecrets(p => ({ ...p, token: !p.token }))}>
                {showSecrets["token"] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        );
      case "api_key":
        return (
          <>
            <div>
              <Label>Nom du header</Label>
              <Input
                value={formAuthConfig.headerName || ""}
                onChange={(e) => updateAuthConfig("headerName", e.target.value)}
                placeholder="X-API-Key"
                data-testid="input-auth-header-name"
              />
            </div>
            <div>
              <Label>Clé API</Label>
              <div className="flex items-center gap-2">
                <Input
                  type={showSecrets["key"] ? "text" : "password"}
                  value={formAuthConfig.key || ""}
                  onChange={(e) => updateAuthConfig("key", e.target.value)}
                  placeholder={editingApi && !authConfigChanged ? "Saisir une nouvelle clé..." : "sk_live_..."}
                  data-testid="input-auth-key"
                />
                <Button size="icon" variant="ghost" onClick={() => setShowSecrets(p => ({ ...p, key: !p.key }))}>
                  {showSecrets["key"] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </>
        );
      case "basic":
        return (
          <>
            <div>
              <Label>Utilisateur</Label>
              <Input
                value={formAuthConfig.username || ""}
                onChange={(e) => updateAuthConfig("username", e.target.value)}
                placeholder="user"
                data-testid="input-auth-username"
              />
            </div>
            <div>
              <Label>Mot de passe</Label>
              <div className="flex items-center gap-2">
                <Input
                  type={showSecrets["pass"] ? "text" : "password"}
                  value={formAuthConfig.password || ""}
                  onChange={(e) => updateAuthConfig("password", e.target.value)}
                  placeholder={editingApi && !authConfigChanged ? "Saisir un nouveau mot de passe..." : "pass"}
                  data-testid="input-auth-password"
                />
                <Button size="icon" variant="ghost" onClick={() => setShowSecrets(p => ({ ...p, pass: !p.pass }))}>
                  {showSecrets["pass"] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  const renderFormDialog = (isEdit: boolean) => (
    <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Modifier la connexion API" : "Nouvelle connexion API"}</DialogTitle>
        <DialogDescription>
          {isEdit ? "Modifiez les paramètres de connexion." : "Configurez une nouvelle API externe à connecter."}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label>Nom</Label>
          <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Mon API" data-testid="input-api-name" />
        </div>
        <div>
          <Label>URL de base</Label>
          <Input value={formBaseUrl} onChange={e => setFormBaseUrl(e.target.value)} placeholder="https://api.example.com" data-testid="input-api-url" />
        </div>
        <div>
          <Label>Description (optionnel)</Label>
          <Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Description de l'API..." rows={2} data-testid="textarea-api-description" />
        </div>
        <div>
          <Label>Authentification</Label>
          <Select value={formAuthType} onValueChange={setFormAuthType}>
            <SelectTrigger data-testid="select-auth-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Aucune</SelectItem>
              <SelectItem value="api_key">Clé API (header)</SelectItem>
              <SelectItem value="bearer">Bearer Token</SelectItem>
              <SelectItem value="basic">Basic Auth</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {renderAuthFields()}
        <div>
          <Label>Headers personnalisés (un par ligne: Nom: Valeur)</Label>
          <Textarea
            value={formHeaders}
            onChange={e => setFormHeaders(e.target.value)}
            placeholder={"X-Custom-Header: value\nAccept-Language: fr"}
            rows={3}
            className="font-mono text-sm"
            data-testid="textarea-custom-headers"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => { isEdit ? setEditDialog(false) : setAddDialog(false); resetForm(); }}>Annuler</Button>
        <Button
          onClick={() => handleSubmit(isEdit)}
          disabled={!formName || !formBaseUrl || createMutation.isPending || updateMutation.isPending}
          data-testid="button-save-api"
        >
          {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          {isEdit ? "Mettre à jour" : "Ajouter"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-external-apis">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Connexions API externes</h1>
          <p className="text-muted-foreground text-sm">Connectez et testez des APIs tierces directement depuis l'interface</p>
        </div>
        <Button onClick={() => { resetForm(); setAddDialog(true); }} data-testid="button-add-api">
          <Plus className="h-4 w-4 mr-2" />
          Nouvelle connexion
        </Button>
      </div>

      {apis.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Globe className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Aucune API connectée</h3>
            <p className="text-muted-foreground text-sm mb-4">Ajoutez une connexion API pour commencer à explorer et tester des endpoints.</p>
            <Button onClick={() => { resetForm(); setAddDialog(true); }} data-testid="button-add-first-api">
              <Plus className="h-4 w-4 mr-2" />
              Ajouter une API
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-6 flex-col lg:flex-row">
          <div className="w-full lg:w-80 shrink-0 space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">APIs configurées</h2>
            {apis.map(api => {
              const routeCount = ((api.discoveredRoutes || []) as any[]).length;
              const isSelected = selectedApi === api.id;
              return (
                <Card
                  key={api.id}
                  className={`cursor-pointer transition-colors ${isSelected ? "border-primary" : ""}`}
                  onClick={() => setSelectedApi(api.id)}
                  data-testid={`card-api-${api.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium truncate">{api.name}</h3>
                          {api.isActive ? (
                            <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">actif</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">inactif</Badge>
                          )}
                        </div>
                        <code className="text-xs text-muted-foreground block truncate mt-1">{api.baseUrl}</code>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            <Shield className="h-3 w-3 mr-1" />
                            {api.authType === "none" ? "Aucune" : api.authType === "api_key" ? "API Key" : api.authType === "bearer" ? "Bearer" : "Basic"}
                          </Badge>
                          {routeCount > 0 && (
                            <Badge variant="secondary" className="text-xs">{routeCount} route{routeCount > 1 ? "s" : ""}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="flex-1 min-w-0">
            {!currentApi ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Zap className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">Sélectionnez une API pour voir ses routes et la tester</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
                    <div className="min-w-0">
                      <CardTitle className="text-lg">{currentApi.name}</CardTitle>
                      <code className="text-xs text-muted-foreground">{currentApi.baseUrl}</code>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => testMutation.mutate(currentApi.id)}
                        disabled={testMutation.isPending}
                        data-testid="button-test-connection"
                      >
                        {testMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                        Tester
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => discoverMutation.mutate(currentApi.id)}
                        disabled={discoverMutation.isPending}
                        data-testid="button-discover-routes"
                      >
                        {discoverMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                        Découvrir les routes
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(currentApi)} data-testid="button-edit-api">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => { if (confirm("Supprimer cette connexion API ?")) deleteMutation.mutate(currentApi.id); }}
                        data-testid="button-delete-api"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {currentApi.description && <p className="text-sm text-muted-foreground mb-3">{currentApi.description}</p>}
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge variant="outline">
                        <Shield className="h-3 w-3 mr-1" />
                        Auth: {currentApi.authType === "none" ? "Aucune" : currentApi.authType === "api_key" ? "API Key" : currentApi.authType === "bearer" ? "Bearer" : "Basic"}
                      </Badge>
                      {(currentApi.openApiSpec as any)?.info?.title && (
                        <Badge variant="secondary">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          {(currentApi.openApiSpec as any).info.title}
                          {(currentApi.openApiSpec as any).info.version ? ` v${(currentApi.openApiSpec as any).info.version}` : ""}
                        </Badge>
                      )}
                      {(currentApi.openApiSpec as any)?.specUrl && (
                        <Badge variant="outline" className="text-xs">
                          Spec: {(currentApi.openApiSpec as any).specUrl}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="font-medium">Routes découvertes ({routes.length})</h3>
                    <Input
                      placeholder="Filtrer les routes..."
                      value={routeFilter}
                      onChange={e => setRouteFilter(e.target.value)}
                      className="w-48"
                      data-testid="input-filter-routes"
                    />
                    <Select value={methodFilter} onValueChange={setMethodFilter}>
                      <SelectTrigger className="w-28" data-testid="select-filter-method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Toutes</SelectItem>
                        <SelectItem value="GET">GET</SelectItem>
                        <SelectItem value="POST">POST</SelectItem>
                        <SelectItem value="PUT">PUT</SelectItem>
                        <SelectItem value="PATCH">PATCH</SelectItem>
                        <SelectItem value="DELETE">DELETE</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => discoverMutation.mutate(currentApi.id)}
                      disabled={discoverMutation.isPending}
                      data-testid="button-refresh-routes"
                    >
                      <RefreshCw className={`h-4 w-4 ${discoverMutation.isPending ? "animate-spin" : ""}`} />
                    </Button>
                  </div>

                  {routes.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center">
                        <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground text-sm">
                          {((currentApi.discoveredRoutes || []) as any[]).length === 0
                            ? "Aucune route découverte. Cliquez sur \"Découvrir les routes\" pour scanner l'API."
                            : "Aucune route ne correspond au filtre."}
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {routes.map((route, i) => (
                        <RouteItem key={`${route.method}-${route.path}-${i}`} route={route} apiId={currentApi.id} baseUrl={currentApi.baseUrl} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        {renderFormDialog(false)}
      </Dialog>

      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        {renderFormDialog(true)}
      </Dialog>
    </div>
  );
}