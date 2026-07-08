import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Save } from "lucide-react";
import { useState, useEffect } from "react";
import type { ApplicationSettings } from "@shared/schema";

export default function AdminWheelSettings() {
  const { toast } = useToast();

  const { data: appSettings, isLoading } = useQuery<ApplicationSettings>({
    queryKey: ["/api/admin/settings"],
  });

  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    if (appSettings?.simulatorSettings) {
      setSettings(appSettings.simulatorSettings);
    } else if (appSettings && !appSettings.simulatorSettings) {
      setSettings({
        prices: {
          base: 50,
          peinture: 30,
          vernis: 20,
          polissage: 40,
          reparation: 60
        },
        maxPhotos: 5,
        colors: [],
        enabledOptions: ["lisere", "gravure", "photoTexture"]
      });
    }
  }, [appSettings]);

  const updateMutation = useMutation({
    mutationFn: async (newSettings: any) => {
      return apiRequest("PATCH", "/api/admin/settings", {
        simulatorSettings: newSettings,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({ title: "Paramètres enregistrés" });
    },
  });

  if (isLoading || !settings) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const addColor = () => {
    setSettings({
      ...settings,
      colors: [...(settings.colors || []), { name: "Nouvelle Couleur", hex: "#000000" }],
    });
  };

  const removeColor = (index: number) => {
    setSettings({
      ...settings,
      colors: settings.colors.filter((_: any, i: number) => i !== index),
    });
  };

  const updateColor = (index: number, field: string, value: string) => {
    const newColors = [...settings.colors];
    newColors[index] = { ...newColors[index], [field]: value };
    setSettings({ ...settings, colors: newColors });
  };

  const updatePrice = (key: string, value: string) => {
    setSettings({
      ...settings,
      prices: { ...settings.prices, [key]: parseFloat(value) || 0 },
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" data-testid="text-simulator-title">Paramètres du Simulateur 3D</h1>
        <Button 
          onClick={() => updateMutation.mutate(settings)}
          disabled={updateMutation.isPending}
          data-testid="button-save-simulator"
        >
          {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Enregistrer les modifications
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Tarification (HT)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {settings.prices && Object.entries(settings.prices).map(([key, value]: [string, any]) => (
              <div key={key} className="space-y-2">
                <Label className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</Label>
                <div className="flex items-center gap-2">
                  <Input 
                    type="number" 
                    value={value} 
                    onChange={(e) => updatePrice(key, e.target.value)}
                    data-testid={`input-price-${key}`}
                  />
                  <span className="text-muted-foreground">€</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configuration Générale</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre maximum de photos</Label>
              <Input 
                type="number" 
                value={settings.maxPhotos} 
                onChange={(e) => setSettings({ ...settings, maxPhotos: parseInt(e.target.value) || 1 })}
                data-testid="input-max-photos"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Nuancier de Couleurs</CardTitle>
            <Button variant="outline" size="sm" onClick={addColor} data-testid="button-add-color">
              <Plus className="mr-2 h-4 w-4" /> Ajouter
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {settings.colors && settings.colors.map((color: any, index: number) => (
                <div key={index} className="p-3 border rounded-lg space-y-2 bg-muted/30" data-testid={`card-color-${index}`}>
                  <div className="flex items-center justify-between">
                    <div 
                      className="w-6 h-6 rounded-full border" 
                      style={{ backgroundColor: color.hex }}
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeColor(index)} data-testid={`button-remove-color-${index}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Input 
                    placeholder="Nom" 
                    value={color.name} 
                    onChange={(e) => updateColor(index, "name", e.target.value)}
                    className="h-8 text-xs"
                    data-testid={`input-color-name-${index}`}
                  />
                  <Input 
                    type="color" 
                    value={color.hex} 
                    onChange={(e) => updateColor(index, "hex", e.target.value)}
                    className="h-8 p-1"
                    data-testid={`input-color-hex-${index}`}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
