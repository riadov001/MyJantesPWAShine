import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Brain, TrendingUp, ShoppingCart, Wrench, Upload, Trash2, Mail,
  FileSpreadsheet, FileDown, RefreshCw, AlertTriangle, CheckCircle,
  Info, Clock, X, Image, Zap, Target, ArrowUp, ArrowDown, Minus,
  MessageSquare, BarChart2, ChevronRight, Star,
} from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, LineChart, Line, Cell, ComposedChart,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface AiAnalysis {
  id: string;
  type: "globale" | "commerciale" | "croissance" | "wheel";
  title: string;
  result: any;
  emailSentAt?: string;
  createdAt: string;
}

const TYPE_CONFIG = {
  globale: { label: "Analyse Globale", icon: Brain, color: "text-primary", bg: "bg-primary/10", accent: "#3b82f6" },
  commerciale: { label: "Analyse Commerciale", icon: ShoppingCart, color: "text-blue-600", bg: "bg-blue-500/10", accent: "#2563eb" },
  croissance: { label: "Analyse Croissance", icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-500/10", accent: "#10b981" },
  wheel: { label: "Diagnostic Jante", icon: Wrench, color: "text-amber-600", bg: "bg-amber-500/10", accent: "#f59e0b" },
};

function CoachMessage({ message, color = "primary" }: { message: string; color?: string }) {
  const colors: Record<string, string> = {
    primary: "bg-primary/5 border-primary/20 text-primary",
    blue: "bg-blue-500/5 border-blue-500/20 text-blue-600",
    emerald: "bg-emerald-500/5 border-emerald-500/20 text-emerald-600",
    amber: "bg-amber-500/5 border-amber-500/20 text-amber-600",
  };
  return (
    <div className={`rounded-md border p-4 ${colors[color] || colors.primary}`}>
      <div className="flex gap-3">
        <MessageSquare className="h-5 w-5 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1 opacity-70">Message du Coach</p>
          <p className="text-sm font-medium leading-relaxed text-foreground">{message}</p>
        </div>
      </div>
    </div>
  );
}

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const color = score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
  const radius = (size - 8) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={6} className="text-muted/30" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-xl font-bold" style={{ color }}>{score}</span>
        <span className="text-[9px] text-muted-foreground -mt-1">/100</span>
      </div>
    </div>
  );
}

function KpiCard({ label, value, unit = "", evolution, objectif, atteinte, color = "#3b82f6" }:
  { label: string; value: any; unit?: string; evolution?: string; objectif?: number; atteinte?: number; color?: string }) {
  const isUp = evolution?.startsWith("+");
  const isDown = evolution?.startsWith("-");
  return (
    <Card className="bg-muted/30">
      <CardContent className="p-4 space-y-2">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-2xl font-bold" style={{ color }}>
          {typeof value === "number" ? value.toLocaleString("fr-FR") : value}{unit}
        </p>
        {evolution && (
          <div className="flex items-center gap-1 text-xs">
            {isUp ? <ArrowUp className="h-3 w-3 text-emerald-500" /> : isDown ? <ArrowDown className="h-3 w-3 text-red-500" /> : <Minus className="h-3 w-3 text-muted-foreground" />}
            <span className={isUp ? "text-emerald-600" : isDown ? "text-red-600" : "text-muted-foreground"}>{evolution}</span>
          </div>
        )}
        {objectif !== undefined && atteinte !== undefined && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Objectif: {typeof objectif === "number" ? objectif.toLocaleString("fr-FR") : objectif}{unit}</span>
              <span>{Math.min(atteinte, 100)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted">
              <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(atteinte, 100)}%`, backgroundColor: color }} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ImpactBadge({ impact }: { impact: string }) {
  const colors: Record<string, string> = {
    "Élevé": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    "Moyen": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    "Faible": "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    "Immédiat": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    "Court terme": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    "Préventif": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[impact] || "bg-muted text-muted-foreground"}`}>{impact}</span>;
}

const CHART_TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "12px" },
  labelStyle: { color: "hsl(var(--foreground))", fontWeight: 600 },
};

function AnalysisError() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-3">
      <AlertTriangle className="h-10 w-10 text-amber-500" />
      <p className="font-semibold text-base">Analyse non disponible</p>
      <p className="text-sm text-muted-foreground max-w-xs">
        La réponse IA n'a pas pu être interprétée. Relancez l'analyse pour obtenir un nouveau résultat.
      </p>
    </div>
  );
}

function ResultGlobale({ result }: { result: any }) {
  if (result?.error && !result?.radarScores) return <AnalysisError />;

  const radar = result?.radarScores || [];
  const revenues = result?.revenusMensuelGraph || [];
  const kpis = result?.kpis || {};

  return (
    <div className="space-y-6">
      {result.coachMessage && <CoachMessage message={result.coachMessage} color="primary" />}

      <div className="flex items-center gap-6 flex-wrap">
        {result.score !== undefined && (
          <div className="flex items-center gap-4">
            <ScoreRing score={result.score} size={90} />
            <div>
              <p className="text-sm font-semibold">Score global</p>
              <p className="text-xs text-muted-foreground">{result.tendance || ""}</p>
              {result.resumeExecutif && <p className="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">{result.resumeExecutif}</p>}
            </div>
          </div>
        )}
      </div>

      {kpis && Object.keys(kpis).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {kpis.ca && <KpiCard label="CA 12 mois" value={kpis.ca.valeur} unit=" €" evolution={kpis.ca.evolution} objectif={kpis.ca.objectif} atteinte={kpis.ca.atteinte} color="#3b82f6" />}
          {kpis.conversion && <KpiCard label="Taux conversion" value={kpis.conversion.valeur} unit="%" evolution={kpis.conversion.evolution} objectif={kpis.conversion.objectif} atteinte={kpis.conversion.atteinte} color="#8b5cf6" />}
          {kpis.panier && <KpiCard label="Panier moyen" value={kpis.panier.valeur} unit=" €" evolution={kpis.panier.evolution} objectif={kpis.panier.objectif} atteinte={kpis.panier.atteinte} color="#10b981" />}
          {kpis.clients && <KpiCard label="Clients totaux" value={kpis.clients.valeur} evolution={kpis.clients.evolution} objectif={kpis.clients.objectif} atteinte={kpis.clients.atteinte} color="#f59e0b" />}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {radar.length > 0 && (
          <Card className="bg-muted/20">
            <CardHeader className="py-3 px-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><BarChart2 className="h-4 w-4 text-primary" /> Performance par domaine</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radar} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="domaine" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Votre garage" dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} strokeWidth={2} />
                  <Radar name="Benchmark" dataKey="benchmark" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.1} strokeWidth={1.5} strokeDasharray="4 2" />
                  <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {revenues.length > 0 && (
          <Card className="bg-muted/20">
            <CardHeader className="py-3 px-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" /> Revenus mensuels</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revenues} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="mois" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: any) => [`${Number(v).toLocaleString("fr-FR")} €`]} />
                  <Bar dataKey="ca" name="CA réel" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="objectif" name="Objectif" fill="#94a3b8" radius={[3, 3, 0, 0]} opacity={0.5} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {((result.points_forts || []).length > 0 || (result.alertes || []).length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(result.points_forts || []).length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold flex items-center gap-2"><CheckCircle className="h-4 w-4 text-emerald-500" /> Points forts</p>
              {result.points_forts.map((p: string, i: number) => (
                <div key={i} className="flex items-start gap-2 text-sm p-2 rounded-md bg-emerald-500/5">
                  <Star className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" /><span>{p}</span>
                </div>
              ))}
            </div>
          )}
          {(result.alertes || []).length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Alertes</p>
              {result.alertes.map((a: string, i: number) => (
                <div key={i} className="flex items-start gap-2 text-sm p-2 rounded-md bg-amber-500/5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" /><span>{a}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(result.actions_prioritaires || []).length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Actions prioritaires</p>
          {result.actions_prioritaires.map((a: any, i: number) => (
            <div key={i} className="flex items-start justify-between gap-3 p-3 rounded-md bg-muted/40 text-sm">
              <div className="flex items-start gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">{i + 1}</span>
                <div>
                  <p>{a.action}</p>
                  {a.gain_estime && <p className="text-xs text-emerald-600 font-medium mt-0.5">Gain estimé: {a.gain_estime}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <ImpactBadge impact={a.impact} />
                <span className="text-xs text-muted-foreground whitespace-nowrap">{a.delai}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ResultCommerciale({ result }: { result: any }) {
  if (result?.error && !result?.funnelConversion) return <AnalysisError />;

  const funnel = result?.funnelConversion || [];
  const caData = result?.caParMois || [];
  const perf = result?.performanceCommerciale || {};
  const serviceData = result?.serviceByPrice || [];
  const seasonalData = result?.seasonalityMatrix || [];
  const clientMetrics = result?.clientMetrics || [];
  const FUNNEL_COLORS = ["#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe"];

  return (
    <div className="space-y-6">
      {result.coachMessage && <CoachMessage message={result.coachMessage} color="blue" />}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {result.tauxConversion !== undefined && (
          <Card className="bg-muted/30 text-center p-4">
            <p className="text-xs text-muted-foreground mb-1">Taux conversion</p>
            <p className="text-2xl font-bold text-blue-600">{result.tauxConversion}%</p>
            {result.benchmarkSecteur?.tauxConversionMoyen && <p className="text-[10px] text-muted-foreground mt-1">Marché: {result.benchmarkSecteur.tauxConversionMoyen}</p>}
          </Card>
        )}
        {result.panierMoyen !== undefined && (
          <Card className="bg-muted/30 text-center p-4">
            <p className="text-xs text-muted-foreground mb-1">Panier moyen</p>
            <p className="text-2xl font-bold text-primary">{Number(result.panierMoyen).toLocaleString("fr-FR")} €</p>
            {result.benchmarkSecteur?.panierMoyenMoyen && <p className="text-[10px] text-muted-foreground mt-1">Marché: {result.benchmarkSecteur.panierMoyenMoyen}</p>}
          </Card>
        )}
        {perf.score !== undefined && (
          <Card className="bg-muted/30 text-center p-4">
            <p className="text-xs text-muted-foreground mb-1">Score perf.</p>
            <div className="flex justify-center mt-1"><ScoreRing score={perf.score} size={60} /></div>
          </Card>
        )}
        {result.benchmarkSecteur?.scoreComparaison !== undefined && (
          <Card className="bg-muted/30 text-center p-4">
            <p className="text-xs text-muted-foreground mb-1">vs Marché</p>
            <p className="text-2xl font-bold text-emerald-600">{result.benchmarkSecteur.scoreComparaison}/100</p>
          </Card>
        )}
      </div>

      {perf.analyse && (
        <div className="rounded-md bg-muted p-4 flex gap-3">
          <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-sm leading-relaxed">{perf.analyse}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {caData.length > 0 && (
          <Card className="bg-muted/20">
            <CardHeader className="py-3 px-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><BarChart2 className="h-4 w-4 text-blue-600" /> CA mensuel & prévisions</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={caData} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="mois" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: any) => [`${Number(v).toLocaleString("fr-FR")} €`]} />
                  <Bar dataKey="ca" name="CA réel" fill="#2563eb" radius={[3, 3, 0, 0]} />
                  <Line dataKey="prevision" name="Prévision" stroke="#94a3b8" strokeDasharray="4 2" dot={false} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {funnel.length > 0 && (
          <Card className="bg-muted/20">
            <CardHeader className="py-3 px-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4 text-blue-600" /> Funnel de conversion</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={funnel} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis type="category" dataKey="etape" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={100} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: any, name: string) => name === "taux" ? [`${v}%`, "Taux"] : [v, "Volume"]} />
                  <Bar dataKey="valeur" name="Volume" radius={[0, 3, 3, 0]}>
                    {funnel.map((_: any, index: number) => (
                      <Cell key={index} fill={FUNNEL_COLORS[index % FUNNEL_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {serviceData.length > 0 && (
          <Card className="bg-muted/20">
            <CardHeader className="py-3 px-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><BarChart2 className="h-4 w-4 text-blue-600" /> Performance services (CA généré)</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={serviceData} margin={{ top: 5, right: 10, bottom: 30, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="service" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} angle={-25} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: any) => [`${Number(v).toLocaleString("fr-FR")} €`]} />
                  <Bar dataKey="ca_genere" name="CA généré" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {seasonalData.length > 0 && (
          <Card className="bg-muted/20">
            <CardHeader className="py-3 px-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-blue-600" /> Variation saisonnière</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={seasonalData} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="periode" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: any) => [`${v}%`]} />
                  <Bar dataKey="variation" name="Variation" fill="#06b6d4" radius={[3, 3, 0, 0]}>
                    {seasonalData.map((d: any, i: number) => (
                      <Cell key={i} fill={d.variation > 0 ? "#10b981" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {clientMetrics.length > 0 && (
        <Card className="bg-muted/20">
          <CardHeader className="py-3 px-4 pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><BarChart2 className="h-4 w-4 text-blue-600" /> Métriques clients (derniers mois)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={clientMetrics.slice(-6)} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="mois" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip {...CHART_TOOLTIP_STYLE} />
                <Bar dataKey="nouveaux" name="Nouveaux" fill="#2563eb" radius={[3, 3, 0, 0]} />
                <Bar dataKey="fideles" name="Fidèles" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {result.seasonalite && (
        <Card className="bg-muted/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="flex-1 space-y-1">
                <p className="text-sm font-semibold mb-2">Saisonnalité</p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <div><span className="text-muted-foreground text-xs">Mois fort: </span><Badge variant="secondary" className="text-xs">{result.seasonalite.moisFort}</Badge></div>
                  <div><span className="text-muted-foreground text-xs">Mois faible: </span><Badge variant="outline" className="text-xs">{result.seasonalite.moisFaible}</Badge></div>
                </div>
                {result.seasonalite.amplitude && <p className="text-xs text-muted-foreground mt-1">{result.seasonalite.amplitude}</p>}
                {result.seasonalite.conseil && (
                  <div className="mt-2 text-xs p-2 rounded bg-blue-500/5 text-blue-700 dark:text-blue-300 border border-blue-500/10">
                    <span className="font-semibold">Conseil: </span>{result.seasonalite.conseil}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {(result.opportunites || []).length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold flex items-center gap-2"><Star className="h-4 w-4 text-amber-500" /> Opportunités identifiées</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {result.opportunites.map((o: string, i: number) => (
              <div key={i} className="p-3 rounded-md bg-amber-500/5 border border-amber-500/10 text-sm">{o}</div>
            ))}
          </div>
        </div>
      )}

      {(result.actionsConcretes || []).length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Actions recommandées</p>
          {result.actionsConcretes.map((a: any, i: number) => (
            <div key={i} className="flex items-start justify-between gap-3 p-3 rounded-md bg-muted/40 text-sm">
              <div className="flex items-start gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p>{a.action}</p>
                  {a.gain && <p className="text-xs text-emerald-600 font-medium mt-0.5">Gain estimé: {a.gain}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <ImpactBadge impact={a.impact} />
                <span className="text-xs text-muted-foreground">{a.delai}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {result.benchmarkSecteur?.positionRelative && (
        <div className="rounded-md bg-muted/30 p-4 text-sm">
          <p className="font-semibold mb-1 text-xs uppercase tracking-wide text-muted-foreground">Position marché</p>
          <p>{result.benchmarkSecteur.positionRelative}</p>
        </div>
      )}
    </div>
  );
}

function ResultCroissance({ result }: { result: any }) {
  if (result?.error && !result?.projectionsM6) return <AnalysisError />;

  const projections = result?.projectionsM6 || [];
  const matrice = result?.matriceActions || [];
  const clientLTV = result?.clientLTVTrend || [];
  const actionsByCategory = result?.actionsByCategory || [];
  const fmt = (v: number) => v ? `${Number(v).toLocaleString("fr-FR")} €` : "—";

  return (
    <div className="space-y-6">
      {result.coachMessage && <CoachMessage message={result.coachMessage} color="emerald" />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {result.potentielCAM6Pessimiste !== undefined && (
          <Card className="bg-muted/30 text-center p-4">
            <p className="text-xs text-muted-foreground mb-1">Scénario pessimiste</p>
            <p className="text-xl font-bold text-red-600">{fmt(result.potentielCAM6Pessimiste)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">6 prochains mois</p>
          </Card>
        )}
        {result.potentielCAM6 !== undefined && (
          <Card className="text-center p-4 border-emerald-500/30">
            <p className="text-xs text-muted-foreground mb-1">Potentiel réaliste</p>
            <p className="text-2xl font-bold text-emerald-600">{fmt(result.potentielCAM6)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">6 prochains mois</p>
          </Card>
        )}
        {result.potentielCAM6Optimiste !== undefined && (
          <Card className="bg-muted/30 text-center p-4">
            <p className="text-xs text-muted-foreground mb-1">Scénario optimiste</p>
            <p className="text-xl font-bold text-emerald-600">{fmt(result.potentielCAM6Optimiste)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">6 prochains mois</p>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {projections.length > 0 && (
          <Card className="bg-muted/20">
            <CardHeader className="py-3 px-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" /> Projections 6 mois</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={projections} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <defs>
                    <linearGradient id="gradOpt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradReal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mois" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: any) => [`${Number(v).toLocaleString("fr-FR")} €`]} />
                  <Area type="monotone" dataKey="optimiste" name="Optimiste" stroke="#10b981" fill="url(#gradOpt)" strokeWidth={2} />
                  <Area type="monotone" dataKey="realiste" name="Réaliste" stroke="#3b82f6" fill="url(#gradReal)" strokeWidth={2} />
                  <Area type="monotone" dataKey="pessimiste" name="Pessimiste" stroke="#f87171" fill="none" strokeWidth={1.5} strokeDasharray="4 2" />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: "11px" }} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {matrice.length > 0 && (
          <Card className="bg-muted/20">
            <CardHeader className="py-3 px-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4 text-emerald-600" /> Matrice Impact / Effort</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={matrice} margin={{ top: 5, right: 10, bottom: 30, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="action" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} angle={-25} textAnchor="end" interval={0} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="impact_score" name="Impact" fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="effort_score" name="Effort" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {clientLTV.length > 0 && (
          <Card className="bg-muted/20">
            <CardHeader className="py-3 px-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><BarChart2 className="h-4 w-4 text-emerald-600" /> Valeur de vie client (cohortes)</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={clientLTV} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="cohorte" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: any) => [`${Number(v).toLocaleString("fr-FR")} €`]} />
                  <Bar dataKey="ltv" name="LTV €" fill="#06b6d4" radius={[3, 3, 0, 0]} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {actionsByCategory.length > 0 && (
          <Card className="bg-muted/20">
            <CardHeader className="py-3 px-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><BarChart2 className="h-4 w-4 text-emerald-600" /> Actions par catégorie (ROI)</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={actionsByCategory} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="categorie" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} yAxisId="left" />
                  <YAxis type="number" yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} />
                  <Bar yAxisId="left" dataKey="count" name="Nombre d'actions" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {result.segmentation && (
        <Card className="bg-muted/20">
          <CardContent className="p-4">
            <p className="text-sm font-semibold mb-3">Segmentation clientèle</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-sm">
              {result.segmentation.clientsFideles && <div className="p-3 rounded-md bg-emerald-500/5"><p className="text-xs text-muted-foreground">Fidèles</p><p className="font-bold text-emerald-600">{result.segmentation.clientsFideles}</p></div>}
              {result.segmentation.clientsOccasionnels && <div className="p-3 rounded-md bg-blue-500/5"><p className="text-xs text-muted-foreground">Occasionnels</p><p className="font-bold text-blue-600">{result.segmentation.clientsOccasionnels}</p></div>}
              {result.segmentation.clientsUniques && <div className="p-3 rounded-md bg-amber-500/5"><p className="text-xs text-muted-foreground">Uniques</p><p className="font-bold text-amber-600">{result.segmentation.clientsUniques}</p></div>}
              {result.segmentation.valeurVieClient && <div className="p-3 rounded-md bg-primary/5"><p className="text-xs text-muted-foreground">Valeur vie client</p><p className="font-bold text-primary">{Number(result.segmentation.valeurVieClient).toLocaleString("fr-FR")} €</p></div>}
            </div>
          </CardContent>
        </Card>
      )}

      {(result.recommandations || []).length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold flex items-center gap-2"><Zap className="h-4 w-4 text-emerald-600" /> Recommandations stratégiques</p>
          {result.recommandations.map((r: any, i: number) => (
            <Card key={i} className="bg-muted/30">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold shrink-0">{r.priorite || i + 1}</span>
                    <span className="font-semibold text-sm">{r.titre}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <ImpactBadge impact={r.impact} />
                    <span className="text-xs text-muted-foreground">Effort: {r.effort}</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground pl-8">{r.description}</p>
                {r.roi && <p className="text-xs text-emerald-600 pl-8 font-semibold">ROI estimé: {r.roi}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(result.planAction90j || []).length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Plan d'action 90 jours</p>
          <div className="space-y-1.5">
            {result.planAction90j.map((p: any, i: number) => (
              <div key={i} className="flex items-start gap-3 text-sm p-3 rounded-md bg-muted/30">
                <Badge variant="outline" className="shrink-0 text-xs whitespace-nowrap">{p.semaine}</Badge>
                <div className="flex-1">
                  <p>{p.action}</p>
                  {p.responsable && <p className="text-xs text-muted-foreground mt-0.5">Responsable: {p.responsable}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(result.risques || []).length > 0 && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Risques identifiés</p>
          {result.risques.map((r: string, i: number) => (
            <div key={i} className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /><span>{r}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ResultWheel({ result }: { result: any }) {
  if (result?.error && !result?.diagnosis) return <AnalysisError />;

  const d = result?.diagnosis;
  const defauts = d?.defauts || [];
  const services = result?.servicesRequis || [];
  const fmt = (v: number) => v ? `${Number(v).toLocaleString("fr-FR")} €` : "—";
  const etatColor: Record<string, string> = {
    "Excellent": "text-emerald-600", "Bon": "text-blue-600",
    "Moyen": "text-amber-600", "Mauvais": "text-orange-600", "Critique": "text-red-600",
  };
  const servicePrixData = services.filter((s: any) => s.prixMin > 0 || s.prixMax > 0).map((s: any) => ({
    service: s.service.length > 18 ? s.service.substring(0, 15) + "…" : s.service,
    min: s.prixMin, max: s.prixMax,
  }));

  return (
    <div className="space-y-6">
      {result.recommandation && (
        <div className="rounded-md bg-amber-500/5 border border-amber-500/20 p-4 flex gap-3">
          <Wrench className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-1">Diagnostic technicien</p>
            <p className="text-sm font-medium text-foreground">{result.recommandation}</p>
          </div>
        </div>
      )}

      {d && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="flex flex-col items-center gap-2 p-4 rounded-md bg-muted/30">
            <p className="text-xs text-muted-foreground">Score santé</p>
            {d.score !== undefined && <ScoreRing score={d.score} size={70} />}
          </div>
          <Card className="bg-muted/30 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">État général</p>
            <p className={`text-xl font-bold ${etatColor[d.etat] || ""}`}>{d.etat}</p>
          </Card>
          <Card className="bg-muted/30 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Type</p>
            <p className="text-sm font-semibold leading-tight">{d.typeJante || "—"}</p>
            {d.dimension && <p className="text-xs text-muted-foreground mt-1">{d.dimension}</p>}
          </Card>
          <Card className="bg-muted/30 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Finition</p>
            <p className="text-sm font-semibold capitalize">{d.finitionActuelle || "—"}</p>
            {d.couleurActuelle && <p className="text-xs text-muted-foreground mt-1">{d.couleurActuelle}</p>}
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {defauts.filter((df: any) => df.severite > 0).length > 0 && (
          <Card className="bg-muted/20">
            <CardHeader className="py-3 px-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /> Radar des défauts</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={defauts} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="type" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Sévérité" dataKey="severite" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} strokeWidth={2} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: any) => [`${v}/100`, "Sévérité"]} />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {servicePrixData.length > 0 && (
          <Card className="bg-muted/20">
            <CardHeader className="py-3 px-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><BarChart2 className="h-4 w-4 text-amber-600" /> Estimation services (€)</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={servicePrixData} margin={{ top: 5, right: 10, bottom: 30, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="service" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} angle={-25} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${v}€`} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: any) => [`${v} €`]} />
                  <Bar dataKey="min" name="Min" fill="#fbbf24" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="max" name="Max" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {(d?.problemesDetectes || []).length > 0 && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3 space-y-1">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">Problèmes détectés</p>
          {d.problemesDetectes.map((p: string, i: number) => (
            <div key={i} className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
              <X className="h-3.5 w-3.5 shrink-0" /><span>{p}</span>
            </div>
          ))}
        </div>
      )}

      {defauts.filter((df: any) => df.severite > 0).length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Détail des défauts</p>
          {defauts.filter((df: any) => df.severite > 0).map((df: any, i: number) => (
            <div key={i} className="flex items-center gap-3 p-2 rounded-md bg-muted/30">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{df.type}</span>
                  <span className="text-xs text-muted-foreground">{df.severite}/100</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div className="h-1.5 rounded-full" style={{ width: `${df.severite}%`, backgroundColor: df.severite > 60 ? "#ef4444" : df.severite > 30 ? "#f59e0b" : "#10b981" }} />
                </div>
                {df.localisation && <p className="text-[10px] text-muted-foreground mt-0.5">{df.localisation}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between p-4 rounded-md bg-primary/5 border border-primary/20">
        <div>
          <p className="text-sm font-semibold">Estimation totale restauration</p>
          {result.prixTotalEstimeMax && result.prixTotalEstimeMax !== result.prixTotalEstime &&
            <p className="text-xs text-muted-foreground">Fourchette haute: {fmt(result.prixTotalEstimeMax)}</p>}
        </div>
        <p className="text-2xl font-bold text-primary">{fmt(result.prixTotalEstime)}</p>
      </div>

      {services.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Services requis</p>
          {services.map((s: any, i: number) => (
            <div key={i} className="flex items-start justify-between gap-3 p-3 rounded-md bg-muted/40 text-sm">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <ImpactBadge impact={s.urgence} />
                  <span className="font-medium">{s.service}</span>
                </div>
                <p className="text-xs text-muted-foreground">{s.description}</p>
              </div>
              <span className="shrink-0 text-sm font-semibold whitespace-nowrap">
                {s.prixMin && s.prixMax ? `${s.prixMin}–${s.prixMax} €` : "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      {result.securite && (
        <div className={`rounded-md p-3 flex items-center gap-3 ${result.securite.circulationAutorisee ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-red-50 dark:bg-red-900/20"}`}>
          {result.securite.circulationAutorisee
            ? <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
            : <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />}
          <div>
            <p className={`text-sm font-semibold ${result.securite.circulationAutorisee ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
              {result.securite.circulationAutorisee ? "Circulation autorisée" : "Circulation déconseillée"}
            </p>
            {result.securite.remarque && <p className="text-xs text-muted-foreground">{result.securite.remarque}</p>}
          </div>
        </div>
      )}

      {(result.optionsPersonnalisation || []).length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Options de personnalisation</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {result.optionsPersonnalisation.map((o: any, i: number) => (
              <div key={i} className="p-3 rounded-md bg-muted/30 border text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{o.option}</span>
                  <span className="text-primary font-semibold text-xs">{o.prix}</span>
                </div>
                <p className="text-xs text-muted-foreground">{o.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AnalysisHistoryCard({ data, onEmailSend, onDelete }: { data: AiAnalysis; onEmailSend: (id: string) => void; onDelete: (id: string) => void }) {
  const cfg = TYPE_CONFIG[data.type];
  const Icon = cfg.icon;
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className="overflow-hidden" data-testid={`card-history-${data.id}`}>
      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center w-8 h-8 rounded-md shrink-0 ${cfg.bg}`}>
            <Icon className={`h-4 w-4 ${cfg.color}`} />
          </div>
          <div>
            <p className="text-sm font-semibold">{data.title}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(data.createdAt).toLocaleString("fr-FR")}
              {data.emailSentAt && <span className="ml-1 text-emerald-600">· Email envoyé</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => setExpanded(e => !e)} data-testid={`button-expand-${data.id}`}>
            {expanded ? "Réduire" : "Voir détails"}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onEmailSend(data.id)} data-testid={`button-email-${data.id}`}>
            <Mail className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => onDelete(data.id)} data-testid={`button-delete-${data.id}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="px-4 pb-4 border-t">
          <div className="pt-3">
            {data.type === "globale" && <ResultGlobale result={data.result} />}
            {data.type === "commerciale" && <ResultCommerciale result={data.result} />}
            {data.type === "croissance" && <ResultCroissance result={data.result} />}
            {data.type === "wheel" && <ResultWheel result={data.result} />}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function generatePDF(data: AiAnalysis) {
  const doc = new jsPDF();
  const cfg = TYPE_CONFIG[data.type];
  const date = new Date(data.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  doc.setFillColor(220, 38, 38);
  doc.rect(0, 0, 210, 18, "F");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("MyJantes — Rapport IA Coach Business", 14, 12);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("46 rue de la Convention, 62800 Liévin | contact@myjantes.com", 210 - 14, 12, { align: "right" });
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(cfg.label, 14, 30);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Généré le ${date}`, 14, 38);
  if (data.result?.coachMessage || data.result?.resumeExecutif) {
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Message du Coach:", 14, 50);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const msg = data.result?.coachMessage || data.result?.resumeExecutif || "";
    const lines = doc.splitTextToSize(msg, 182);
    doc.text(lines, 14, 57);
  }
  doc.setDrawColor(220, 38, 38);
  doc.setLineWidth(0.5);
  doc.line(14, 70, 196, 70);
  const rows: string[][] = [];
  const flat = (obj: any, prefix = ""): void => {
    if (!obj || typeof obj !== "object") return;
    Object.entries(obj).forEach(([k, v]) => {
      if (["coachMessage", "revenusMensuelGraph", "projectionsM6", "radarScores", "funnelConversion", "caParMois", "matriceActions", "defauts"].includes(k)) return;
      const key = prefix ? `${prefix} › ${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) flat(v, key);
      else if (Array.isArray(v)) rows.push([key, v.map((x: any) => typeof x === "object" ? (x.action || x.titre || x.service || JSON.stringify(x)) : String(x)).join(" | ")]);
      else rows.push([key, String(v ?? "")]);
    });
  };
  flat(data.result);
  autoTable(doc, {
    startY: 74,
    head: [["Champ", "Valeur"]],
    body: rows,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: { 0: { cellWidth: 60, fontStyle: "bold" }, 1: { cellWidth: 120 } },
    margin: { left: 14, right: 14 },
  });
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} / ${pageCount}`, 196, 290, { align: "right" });
  }
  doc.save(`${data.type}-coach-ia-${new Date(data.createdAt).toISOString().slice(0, 10)}.pdf`);
}

export default function AdminAIAnalyses() {
  const { isAuthenticated, isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("globale");
  const [historyType, setHistoryType] = useState<string>("");
  const [latestResults, setLatestResults] = useState<Record<string, AiAnalysis | null>>({});
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: history = [], isLoading: historyLoading } = useQuery<AiAnalysis[]>({
    queryKey: ["/api/admin/ai/history", historyType],
    queryFn: () => fetch(`/api/admin/ai/history${historyType ? `?type=${historyType}` : ""}`, { credentials: "include" }).then(r => r.json()),
    enabled: isAuthenticated && isAdmin,
  });

  const analyseGlobale = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/ai/analyse").then(r => r.json()),
    onSuccess: (data) => { setLatestResults(p => ({ ...p, globale: data })); qc.invalidateQueries({ queryKey: ["/api/admin/ai/history"] }); toast({ title: "Analyse globale générée", description: "Coach IA prêt" }); },
    onError: () => toast({ title: "Erreur analyse", variant: "destructive" }),
  });
  const analyseCommerciale = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/ai/commercial").then(r => r.json()),
    onSuccess: (data) => { setLatestResults(p => ({ ...p, commerciale: data })); qc.invalidateQueries({ queryKey: ["/api/admin/ai/history"] }); toast({ title: "Analyse commerciale générée" }); },
    onError: () => toast({ title: "Erreur analyse", variant: "destructive" }),
  });
  const analyseCroissance = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/ai/growth").then(r => r.json()),
    onSuccess: (data) => { setLatestResults(p => ({ ...p, croissance: data })); qc.invalidateQueries({ queryKey: ["/api/admin/ai/history"] }); toast({ title: "Analyse croissance générée" }); },
    onError: () => toast({ title: "Erreur analyse", variant: "destructive" }),
  });
  const analyseWheel = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData(); fd.append("image", file);
      return fetch("/api/admin/ai/wheel", { method: "POST", body: fd, credentials: "include" }).then(async r => { if (!r.ok) throw new Error((await r.json()).message); return r.json(); });
    },
    onSuccess: (data) => { setLatestResults(p => ({ ...p, wheel: data })); qc.invalidateQueries({ queryKey: ["/api/admin/ai/history"] }); toast({ title: "Diagnostic jante généré" }); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message || "Erreur diagnostic", variant: "destructive" }),
  });

  const sendEmail = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/ai/history/${id}/email`, {}).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/ai/history"] }); toast({ title: "Email envoyé" }); },
    onError: () => toast({ title: "Erreur envoi email", variant: "destructive" }),
  });
  const deleteAnalysis = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/ai/history/${id}`).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/ai/history"] }); toast({ title: "Analyse supprimée" }); },
    onError: () => toast({ title: "Erreur suppression", variant: "destructive" }),
  });
  const cleanFailed = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/admin/ai/history/bulk/failed", {}).then(r => r.json()),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/ai/history"] });
      toast({ title: `${data?.deleted ?? 0} analyse(s) cassée(s) supprimée(s)` });
    },
    onError: () => toast({ title: "Erreur nettoyage", variant: "destructive" }),
  });

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) { toast({ title: "Fichier invalide", description: "Image requise", variant: "destructive" }); return; }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = e => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, [toast]);
  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }, [handleFileSelect]);
  const exportExcel = () => window.open(historyType ? `/api/admin/ai/history/export/excel?type=${historyType}` : "/api/admin/ai/history/export/excel", "_blank");

  if (!isAuthenticated || !isAdmin) return null;

  const TABS = [
    { id: "globale", label: "Globale", icon: Brain, mutation: analyseGlobale, desc: "Vue d'ensemble + coaching business" },
    { id: "commerciale", label: "Commerciale", icon: ShoppingCart, mutation: analyseCommerciale, desc: "Performance & funnel de conversion" },
    { id: "croissance", label: "Croissance", icon: TrendingUp, mutation: analyseCroissance, desc: "Projections & stratégie de développement" },
    { id: "wheel", label: "Jante IA", icon: Wrench, mutation: analyseWheel, desc: "Diagnostic jante par photo" },
  ];

  const renderResult = (tabId: string) => {
    const r = latestResults[tabId];
    if (!r) return null;
    if (tabId === "globale") return <ResultGlobale result={r.result} />;
    if (tabId === "commerciale") return <ResultCommerciale result={r.result} />;
    if (tabId === "croissance") return <ResultCroissance result={r.result} />;
    return null;
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto pb-20">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-ai-analyses-title">
            Coach IA Business
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Analyses approfondies avec graphiques · Powered by Gemini AI</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={exportExcel} data-testid="button-export-excel">
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" /> Excel
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 h-auto gap-2 bg-transparent p-0">
          {TABS.map(tab => (
            <TabsTrigger key={tab.id} value={tab.id}
              className="gap-1.5 py-2.5 border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              data-testid={`tab-ai-${tab.id}`}>
              <tab.icon className="h-3.5 w-3.5" /><span className="hidden sm:inline">{tab.label}</span><span className="sm:hidden">{tab.label.split(" ")[0]}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.filter(t => t.id !== "wheel").map(tab => {
          const result = latestResults[tab.id];
          const isPending = tab.mutation.isPending;
          return (
            <TabsContent key={tab.id} value={tab.id} className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3 pb-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <tab.icon className={`h-5 w-5 ${TYPE_CONFIG[tab.id as keyof typeof TYPE_CONFIG].color}`} />
                      {tab.label}
                    </CardTitle>
                    <CardDescription>{tab.desc}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {result && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => generatePDF(result)} data-testid={`button-pdf-${tab.id}`}>
                          <FileDown className="h-3.5 w-3.5 mr-1.5" /> PDF
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => sendEmail.mutate(result.id)} disabled={sendEmail.isPending} data-testid={`button-email-result-${tab.id}`}>
                          <Mail className="h-3.5 w-3.5 mr-1.5" /> Email
                        </Button>
                      </>
                    )}
                    <Button onClick={() => (tab.mutation as any).mutate()} disabled={isPending} size="sm" data-testid={`button-run-${tab.id}`}>
                      {isPending ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Analyse…</> : <><Brain className="h-3.5 w-3.5 mr-1.5" />{result ? "Relancer" : "Lancer l'analyse"}</>}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {isPending && (
                    <div className="space-y-3">
                      <Skeleton className="h-20" />
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
                      <div className="grid grid-cols-2 gap-4"><Skeleton className="h-52" /><Skeleton className="h-52" /></div>
                      <Skeleton className="h-32" />
                    </div>
                  )}
                  {!isPending && !result && (
                    <div className="text-center py-16 text-muted-foreground">
                      <tab.icon className="h-12 w-12 mx-auto mb-3 opacity-15" />
                      <p className="text-sm font-medium">Lancez l'analyse pour obtenir votre rapport coach</p>
                      <p className="text-xs mt-1 opacity-60">Graphiques + recommandations personnalisées</p>
                    </div>
                  )}
                  {!isPending && result && renderResult(tab.id)}
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}

        <TabsContent value="wheel" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3 pb-4">
              <div>
                <CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5 text-amber-600" /> Diagnostic Jante IA</CardTitle>
                <CardDescription>Photo → Analyse complète avec radar des défauts et devis</CardDescription>
              </div>
              {latestResults.wheel && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => generatePDF(latestResults.wheel!)} data-testid="button-pdf-wheel">
                    <FileDown className="h-3.5 w-3.5 mr-1.5" /> PDF
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => sendEmail.mutate(latestResults.wheel!.id)} disabled={sendEmail.isPending} data-testid="button-email-wheel">
                    <Mail className="h-3.5 w-3.5 mr-1.5" /> Email
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div onDragOver={e => { e.preventDefault(); setIsDragOver(true); }} onDragLeave={() => setIsDragOver(false)} onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-md cursor-pointer transition-colors ${isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"}`}
                data-testid="drop-zone-wheel">
                <input ref={fileInputRef} type="file" accept="image/*" className="sr-only"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                  data-testid="input-image-wheel" />
                {imagePreview ? (
                  <div className="relative">
                    <img src={imagePreview} alt="Aperçu jante" className="w-full max-h-64 object-contain rounded-md" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity rounded-md">
                      <div className="text-white text-center"><Image className="h-6 w-6 mx-auto mb-1" /><p className="text-sm">Changer</p></div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Upload className="h-10 w-10 text-muted-foreground/40" />
                    <div className="text-center">
                      <p className="text-sm font-medium">Glissez une photo ici ou cliquez</p>
                      <p className="text-xs text-muted-foreground">JPG, PNG, WebP — max 20 Mo</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={() => imageFile && analyseWheel.mutate(imageFile)} disabled={!imageFile || analyseWheel.isPending} className="flex-1" data-testid="button-run-wheel">
                  {analyseWheel.isPending ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Analyse en cours…</> : <><Wrench className="h-3.5 w-3.5 mr-1.5" /> Lancer le diagnostic</>}
                </Button>
                {imagePreview && (
                  <Button variant="outline" size="icon" onClick={() => { setImagePreview(null); setImageFile(null); }} data-testid="button-clear-image">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {analyseWheel.isPending && (
                <div className="space-y-3">
                  <Skeleton className="h-16" />
                  <div className="grid grid-cols-4 gap-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
                  <div className="grid grid-cols-2 gap-4"><Skeleton className="h-52" /><Skeleton className="h-52" /></div>
                </div>
              )}
              {!analyseWheel.isPending && latestResults.wheel && (
                <div className="pt-2 border-t"><ResultWheel result={latestResults.wheel.result} /></div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold">Historique des analyses</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {["", "globale", "commerciale", "croissance", "wheel"].map(type => (
              <Button key={type} variant={historyType === type ? "default" : "outline"} size="sm"
                onClick={() => setHistoryType(type)} data-testid={`filter-history-${type || "all"}`}>
                {type === "" ? "Tout" : TYPE_CONFIG[type as keyof typeof TYPE_CONFIG]?.label?.split(" ")[1] || TYPE_CONFIG[type as keyof typeof TYPE_CONFIG]?.label}
              </Button>
            ))}
            <Button variant="outline" size="sm" onClick={() => cleanFailed.mutate()}
              disabled={cleanFailed.isPending} data-testid="button-clean-failed"
              title="Supprimer les analyses cassées (réponse IA invalide)">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              {cleanFailed.isPending ? "Nettoyage..." : "Nettoyer cassées"}
            </Button>
          </div>
        </div>
        {historyLoading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : history.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Brain className="h-10 w-10 mx-auto mb-2 opacity-15" />
            <p className="text-sm">Aucune analyse enregistrée</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map(item => (
              <AnalysisHistoryCard key={item.id} data={item}
                onEmailSend={(id) => sendEmail.mutate(id)}
                onDelete={(id) => deleteAnalysis.mutate(id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
