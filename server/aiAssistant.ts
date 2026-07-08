import { storage } from "./storage";

const OPENROUTER_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "openai/gpt-oss-120b:free";

const GROK_API_KEY = process.env.GROK_API_KEY || "";
const GROK_URL = "https://api.x.ai/v1/chat/completions";
const GROK_MODEL_TEXT = "grok-3";
const GROK_MODEL_VISION = "grok-2-vision-1212";

async function callAI(
  messages: { role: string; content: any }[],
  hasImages = false
): Promise<string> {
  // Primary: OpenRouter
  if (OPENROUTER_API_KEY) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://apps.myjantes.fr",
          "X-Title": "MyJantes",
        },
        body: JSON.stringify({ model: OPENROUTER_MODEL, messages }),
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok) {
        const data = await res.json() as any;
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
      } else {
        const err = await res.text();
        console.warn(`[AI] OpenRouter ${res.status} — bascule Grok. ${err.substring(0, 80)}`);
      }
    } catch (e: any) {
      console.warn(`[AI] OpenRouter indisponible (${e.message}) — bascule Grok`);
    }
  }

  // Fallback: Grok
  if (!GROK_API_KEY) throw new Error("Aucune clé IA disponible (OPENAI_API_KEY ou GROK_API_KEY requise)");
  const model = hasImages ? GROK_MODEL_VISION : GROK_MODEL_TEXT;
  const res = await fetch(GROK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROK_API_KEY}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 8192 }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Grok error: ${res.status} — ${err.substring(0, 150)}`);
  }
  const data = await res.json() as any;
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Pas de réponse de l'IA");
  return text;
}

let cachedServices: { name: string; description: string | null; basePrice: string | null; category: string | null }[] = [];
let servicesCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getServicesContext(): Promise<string> {
  const now = Date.now();
  if (now - servicesCacheTime > CACHE_TTL || cachedServices.length === 0) {
    try {
      const services = await storage.getServices();
      cachedServices = services.map(s => ({
        name: s.name,
        description: (s as any).description || null,
        basePrice: s.basePrice || null,
        category: (s as any).category || null,
      }));
      servicesCacheTime = now;
    } catch (e) {
      console.error("[AI] Failed to fetch services:", e);
    }
  }

  if (cachedServices.length === 0) {
    return "Services disponibles: Montage de jantes, Réparation de jantes endommagées, Changement de pneus, Équilibrage, Géométrie, Personnalisation de jantes, Peinture de jantes.";
  }

  return "Services proposés par MyJantes:\n" + cachedServices.map(s => {
    let line = `- ${s.name}`;
    if (s.description) line += `: ${s.description}`;
    if (s.basePrice && parseFloat(s.basePrice) > 0) line += ` (à partir de ${parseFloat(s.basePrice).toFixed(2)} €)`;
    return line;
  }).join("\n");
}

function buildSystemPrompt(servicesContext: string, userRole: string): string {
  const roleContext = userRole === "client"
    ? "L'utilisateur est un client du garage. Aide-le à comprendre les services, demander un devis, ou suivre ses commandes."
    : "L'utilisateur est un membre du personnel (administrateur/employé). Aide-le avec la gestion des opérations.";

  return `Tu es l'assistant virtuel intelligent de MyJantes, expert en jantes automobiles et services de réparation/personnalisation. Tu es toujours disponible et enthousiaste pour aider.

${roleContext}

## Expertise Technique - Jantes Automobiles

Tu possèdes une connaissance approfondie sur les jantes automobiles:

### Types de Jantes
- **Jantes en alliage (aluminium)**: Légères, esthétiques, bonne dissipation thermique. Sensibles aux chocs et à la corrosion.
- **Jantes en acier**: Robustes, économiques, résistantes aux déformations. Plus lourdes, moins esthétiques.
- **Jantes forgées**: Très légères et résistantes, haut de gamme. Prix plus élevé.
- **Jantes en carbone**: Ultra-légères, haute performance, usage sportif/luxe.

### Problèmes Courants et Réparations
- **Voile de jante**: Déformation qui provoque des vibrations. Réparable par redressage sur tour.
- **Fissure/Crack**: Nécessite soudure TIG spécialisée aluminium. Contrôle d'étanchéité obligatoire.
- **Rayures superficielles**: Ponçage et polissage, possible remise à neuf complète.
- **Éclats/Impacts**: Rechargement matière + usinage + finition.
- **Corrosion/Oxydation**: Décapage chimique ou sablage + traitement anti-corrosion + peinture.
- **Perte d'étanchéité**: Nettoyage des portées de pneu, vérification des fissures, joint d'étanchéité.

### Personnalisation de Jantes
- **Peinture**: Changement de couleur, finition mate/brillante/satinée
- **Diamond Cut (usinage diamant)**: Finition premium avec face usinée brillante et flancs peints
- **Hydrographie / Covering**: Application de motifs (carbone, camouflage, etc.)
- **Changement de taille**: Passage à des jantes plus grandes (upsizing) - attention aux compatibilités

### Dimensions et Compatibilité
- **Diamètre (pouces)**: 14" à 22" courants, jusqu'à 24" pour SUV
- **Largeur (pouces)**: 5.5J à 12J selon véhicule
- **Entraxe (PCD)**: 4x100, 5x112, 5x120, etc. - DOIT correspondre au véhicule
- **Déport (ET)**: Influence le positionnement de la roue, crucial pour la géométrie
- **Alésage central**: Doit correspondre au moyeu du véhicule

## Configurateur de Jantes

Tu peux analyser des photos de jantes envoyées par les utilisateurs. Quand un utilisateur envoie une photo:
1. Identifie le type de jante (alliage, acier, forgé, etc.)
2. Évalue l'état (rayures, voile, fissures, corrosion)
3. Propose des options de personnalisation (couleur, finition, diamond cut)
4. Estime la faisabilité des travaux
5. Recommande des services MyJantes adaptés

Si l'utilisateur demande une personnalisation, décris en détail le rendu attendu (couleur, finition, effet visuel).

## ${servicesContext}

## Navigation de l'Application
- **Clients**: Tableau de bord (/), Services (/services), Mes Devis (/quotes), Mes Factures (/invoices), Messages (/messages)
- **Administrateurs**: Dashboard (/admin/dashboard), Devis (/admin/quotes), Factures (/admin/invoices), Réservations (/admin/reservations), Atelier (/admin/workshop), Chat (/admin/chat)

## Processus Client
1. **Demande de devis**: Le client décrit son besoin → l'équipe MyJantes évalue et propose un devis personnalisé
2. **Approbation**: Le client consulte le devis en ligne et l'approuve
3. **Réservation**: Prise de rendez-vous pour l'intervention
4. **Intervention**: Réalisation des travaux en atelier
5. **Facturation**: Facture générée automatiquement, paiement en ligne possible (CB, virement, Klarna, Alma)

## Règles de Conversation
- Réponds TOUJOURS en français
- Sois concis, précis et enthousiaste
- Pour les prix: oriente vers un devis personnalisé, tu peux mentionner les prix de base des services si disponibles
- Pour un diagnostic: pose des questions sur le type de jante, la nature du dommage, le véhicule
- Propose toujours des solutions concrètes et explique les étapes de réparation
- Si le client hésite entre réparation et remplacement, aide-le à comprendre les avantages de chaque option`;
}

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
  imageBase64?: string;
  imageMimeType?: string;
}


export async function generateAssistantResponse(
  messages: AssistantMessage[],
  userRole: string
): Promise<string> {
  const servicesContext = await getServicesContext();
  const systemPrompt = buildSystemPrompt(servicesContext, userRole);

  const aiMessages: { role: string; content: any }[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const m of messages) {
    if (m.imageBase64 && m.imageMimeType) {
      aiMessages.push({
        role: m.role === "user" ? "user" : "assistant",
        content: [
          { type: "image_url", image_url: { url: `data:${m.imageMimeType};base64,${m.imageBase64}` } },
          { type: "text", text: m.content },
        ],
      });
    } else {
      aiMessages.push({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
      });
    }
  }

  return callAI(aiMessages);
}

export async function generateSmartQuoteSuggestion(
  vehicleDescription: string
): Promise<{ serviceName: string; estimatedPrice: number; productDetails: string; notes: string }> {
  const servicesCtx = await getServicesContext();
  const prompt = `Tu es un expert en jantes automobiles chez MyJantes. Un client décrit son besoin. Génère une suggestion de devis structurée.

${servicesCtx}

Description : "${vehicleDescription}"

Réponds UNIQUEMENT en JSON pur (sans markdown, sans \`\`\`) :
{
  "serviceName": "nom exact du service le plus adapté parmi ceux disponibles",
  "estimatedPrice": 250,
  "productDetails": "description détaillée du travail à effectuer",
  "notes": "notes techniques pour le technicien"
}`;
  const response = await callAI([
    { role: "system", content: "Tu es un expert technique en jantes automobiles. Réponds toujours en JSON pur." },
    { role: "user", content: prompt },
  ]);
  try {
    const clean = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return { serviceName: "", estimatedPrice: 0, productDetails: vehicleDescription, notes: response };
  }
}

export async function generateEmailDraft(params: {
  type: "quote" | "invoice";
  documentNumber: string;
  amount: string;
  clientName: string;
  prestations: string[];
  technicalDetails: string;
}): Promise<{ subject: string; message: string }> {
  const docType = params.type === "quote" ? "devis" : "facture";
  const prompt = `Tu es l'assistant de MyJantes. Rédige un email professionnel et chaleureux en français pour envoyer un ${docType}.

Client : ${params.clientName || "Client"}
Numéro : ${params.documentNumber}
Montant : ${params.amount} €
Prestations : ${params.prestations.join(", ") || "Prestation jantes"}
${params.technicalDetails ? `Détails : ${params.technicalDetails}` : ""}

Réponds en JSON pur (sans markdown) :
{
  "subject": "Sujet concis et professionnel",
  "message": "Corps de l'email — plusieurs paragraphes bien formatés, personnalisé, professionnel, avec invitation à nous contacter"
}`;
  const response = await callAI([
    { role: "system", content: "Tu rédiges des emails professionnels pour MyJantes. Réponds en JSON pur." },
    { role: "user", content: prompt },
  ]);
  try {
    const clean = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return { subject: `Votre ${docType} MyJantes — ${params.documentNumber}`, message: response };
  }
}

export async function generateClientInsights(clientData: {
  name: string;
  quotesCount: number;
  invoicesCount: number;
  paidCount: number;
  totalRevenue: number;
  conversionRate: number;
  avgQuoteAmount: number;
  firstVisit: string | null;
  lastVisit: string | null;
  loyaltyTier: string;
}): Promise<{
  score: number;
  resume: string;
  points_forts: string[];
  risques: string[];
  opportunites: string[];
  prochaine_action: string;
  probabilite_retour: number;
}> {
  const prompt = `Tu es analyste CRM chez MyJantes (spécialiste jantes automobiles). Analyse ce profil client et génère des insights actionnables.

Client : ${clientData.name} (fidélité : ${clientData.loyaltyTier})
Devis : ${clientData.quotesCount} | Conversion : ${clientData.conversionRate}%
Factures payées : ${clientData.paidCount}/${clientData.invoicesCount}
CA : ${clientData.totalRevenue.toFixed(2)} € | Panier moyen : ${clientData.avgQuoteAmount.toFixed(2)} €
1ère visite : ${clientData.firstVisit || "inconnue"} | Dernière : ${clientData.lastVisit || "inconnue"}

Réponds en JSON pur (sans markdown) :
{
  "score": 85,
  "resume": "Résumé en 1 phrase percutante",
  "points_forts": ["point 1", "point 2"],
  "risques": ["risque 1"],
  "opportunites": ["opportunité 1", "opportunité 2"],
  "prochaine_action": "Action concrète recommandée immédiatement",
  "probabilite_retour": 75
}`;
  const response = await callAI([
    { role: "system", content: "Tu es analyste CRM expert. Réponds en JSON pur." },
    { role: "user", content: prompt },
  ]);
  try {
    const clean = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return { score: 50, resume: "Analyse non disponible", points_forts: [], risques: [], opportunites: [], prochaine_action: response, probabilite_retour: 50 };
  }
}

export async function generateRepairAdvisory(repairData: {
  vehicleBrand: string;
  vehicleModel: string;
  vehicleYear: string;
  mileage: string;
  existingDamages: string;
  clientObservations: string;
  serviceName: string;
}): Promise<{
  diagnostic: string;
  etapes: { numero: number; titre: string; description: string; duree_estimee: string }[];
  precautions: string[];
  materiel_requis: string[];
  duree_totale: string;
  difficulte: string;
}> {
  const prompt = `Tu es technicien expert en jantes automobiles chez MyJantes. Génère un guide de réparation technique.

Véhicule : ${repairData.vehicleBrand} ${repairData.vehicleModel} ${repairData.vehicleYear}
Kilométrage : ${repairData.mileage || "non renseigné"} km
Dommages : ${repairData.existingDamages || "non renseignés"}
Observations client : ${repairData.clientObservations || "aucune"}
Service : ${repairData.serviceName}

Réponds en JSON pur (sans markdown) :
{
  "diagnostic": "Diagnostic technique en 2-3 phrases",
  "etapes": [
    { "numero": 1, "titre": "Titre étape", "description": "Description détaillée", "duree_estimee": "15 min" }
  ],
  "precautions": ["précaution 1", "précaution 2"],
  "materiel_requis": ["outil 1", "outil 2"],
  "duree_totale": "2h30",
  "difficulte": "Intermédiaire"
}`;
  const response = await callAI([
    { role: "system", content: "Tu es technicien expert en jantes. Réponds en JSON pur." },
    { role: "user", content: prompt },
  ]);
  try {
    const clean = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return { diagnostic: "Analyse non disponible. Veuillez réessayer.", etapes: [], precautions: [], materiel_requis: [], duree_totale: "N/A", difficulte: "N/A" };
  }
}

export async function analyzeWheelImage(
  imageBase64: string,
  imageMimeType: string,
  userPrompt: string,
  conversationHistory: AssistantMessage[] = []
): Promise<string> {
  const systemPrompt = `Tu es un expert en jantes automobiles chez MyJantes. Tu analyses des photos de jantes envoyées par les clients.

Quand tu reçois une photo de jante:
1. **Identification**: Type de jante (alliage, acier, forgé), marque si identifiable, nombre de branches, design
2. **État**: Évalue l'état visible (rayures, corrosion, voile, fissures, usure)
3. **Personnalisation**: Propose des options réalistes de personnalisation:
   - Couleurs possibles (noir mat, noir brillant, gris anthracite, bronze, or, blanc, rouge, bleu, etc.)
   - Finitions (mat, brillant, satiné, brossé)
   - Diamond Cut (face usinée + flancs peints)
   - Hydrographie (motifs carbone, camouflage, etc.)
4. **Recommandation**: Suggère le meilleur traitement et oriente vers un devis MyJantes
5. **Visualisation**: Décris en détail comment la jante apparaîtrait après chaque option de personnalisation proposée

Réponds TOUJOURS en français. Sois enthousiaste et professionnel.
Si l'image n'est pas une jante, indique-le poliment et demande une photo de jante.`;

  const aiMessages: { role: string; content: any }[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of conversationHistory) {
    if (msg.imageBase64 && msg.imageMimeType) {
      aiMessages.push({
        role: msg.role === "user" ? "user" : "assistant",
        content: [
          { type: "image_url", image_url: { url: `data:${msg.imageMimeType};base64,${msg.imageBase64}` } },
          { type: "text", text: msg.content },
        ],
      });
    } else {
      aiMessages.push({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content,
      });
    }
  }

  aiMessages.push({
    role: "user",
    content: [
      { type: "image_url", image_url: { url: `data:${imageMimeType};base64,${imageBase64}` } },
      { type: "text", text: userPrompt || "Analyse cette jante et propose des options de personnalisation." },
    ],
  });

  return callAI(aiMessages);
}
