/**
 * ConflictResolver - Fusion intelligente par champ pour le Mode Atelier
 * Priorité : atelierStatus / urgency / estimatedEndDate > notes > photos
 */

export type ConflictField = {
  field: string;
  serverValue: any;
  clientValue: any;
  resolution: "server" | "client" | "merge";
  resolvedValue: any;
};

export type ConflictResult = {
  resolved: boolean;
  requiresManualReview: boolean;
  mergedData: Record<string, any>;
  conflicts: ConflictField[];
  conflictEntry: {
    at: string;
    clientVersion: number;
    serverVersion: number;
    fields: ConflictField[];
    autoResolved: boolean;
  };
};

// Priorité haute : ces champs sont toujours pris côté serveur si les deux ont changé
const HIGH_PRIORITY_FIELDS = ["atelierStatus", "urgency", "status"];
// Priorité moyenne : on prend le plus récent (lastUpdated)
const MEDIUM_PRIORITY_FIELDS = ["estimatedEndDate", "scheduledDate", "assignedEmployeeId"];
// Merge : on fusionne (ex. photos = union des deux listes)
const MERGE_FIELDS = ["photos"];
// Priorité basse : on prend la valeur client (notes, observations)
const CLIENT_PRIORITY_FIELDS = ["notes", "technicianNotes", "clientObservations"];

export function resolveConflict(
  serverData: Record<string, any>,
  clientData: Record<string, any>,
  baseData: Record<string, any>
): ConflictResult {
  const conflicts: ConflictField[] = [];
  const mergedData: Record<string, any> = { ...serverData };
  let requiresManualReview = false;

  const allKeys = new Set([
    ...Object.keys(serverData),
    ...Object.keys(clientData),
  ]);

  for (const field of allKeys) {
    if (field === "version" || field === "conflictHistory" || field === "lastUpdated" || field === "updatedAt") continue;

    const serverVal = serverData[field];
    const clientVal = clientData[field];
    const baseVal = baseData[field];

    const serverChanged = JSON.stringify(serverVal) !== JSON.stringify(baseVal);
    const clientChanged = JSON.stringify(clientVal) !== JSON.stringify(baseVal);

    if (!serverChanged || !clientChanged) {
      // Un seul côté a changé — on prend la valeur qui a changé
      if (clientChanged && !serverChanged) {
        mergedData[field] = clientVal;
      }
      // sinon server wins (déjà dans mergedData)
      continue;
    }

    // Les deux ont changé → conflit réel
    if (JSON.stringify(serverVal) === JSON.stringify(clientVal)) {
      // Même valeur finale, pas de conflit
      continue;
    }

    let resolution: "server" | "client" | "merge" = "server";
    let resolvedValue = serverVal;

    if (HIGH_PRIORITY_FIELDS.includes(field)) {
      resolution = "server";
      resolvedValue = serverVal;
    } else if (MERGE_FIELDS.includes(field)) {
      // Fusionner les tableaux (union par URL/id)
      const serverArr: any[] = Array.isArray(serverVal) ? serverVal : [];
      const clientArr: any[] = Array.isArray(clientVal) ? clientVal : [];
      const merged = [...serverArr];
      for (const item of clientArr) {
        const key = item?.url || item?.id || JSON.stringify(item);
        const exists = serverArr.some(
          (s) => (s?.url || s?.id || JSON.stringify(s)) === key
        );
        if (!exists) merged.push(item);
      }
      resolution = "merge";
      resolvedValue = merged;
      mergedData[field] = resolvedValue;
    } else if (CLIENT_PRIORITY_FIELDS.includes(field)) {
      resolution = "client";
      resolvedValue = clientVal;
      mergedData[field] = resolvedValue;
    } else if (MEDIUM_PRIORITY_FIELDS.includes(field)) {
      // Prend le serveur par défaut, mais signale le conflit
      resolution = "server";
      resolvedValue = serverVal;
      requiresManualReview = true;
    } else {
      // Champ inconnu → serveur wins, on notifie
      resolution = "server";
      resolvedValue = serverVal;
      requiresManualReview = true;
    }

    conflicts.push({ field, serverValue: serverVal, clientValue: clientVal, resolution, resolvedValue });
    if (resolution !== "merge") mergedData[field] = resolvedValue;
  }

  const autoResolved = !requiresManualReview;

  return {
    resolved: true,
    requiresManualReview,
    mergedData,
    conflicts,
    conflictEntry: {
      at: new Date().toISOString(),
      clientVersion: clientData.version ?? 0,
      serverVersion: serverData.version ?? 0,
      fields: conflicts,
      autoResolved,
    },
  };
}
