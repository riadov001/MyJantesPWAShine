/**
 * useDossiers - Hook TanStack Query + fallback offline IndexedDB
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useCallback } from "react";
import { atelierDB, enqueueMutation, upsertDossiers, type DossierRecord } from "@/lib/dossierDb";
import { triggerSync } from "@/lib/offlineQueue";

const POLL_INTERVAL = 25000; // 25s auto-refresh

async function fetchDossiers(params: Record<string, string> = {}): Promise<DossierRecord[]> {
  const qs = new URLSearchParams(params).toString();
  const resp = await fetch(`/api/dossiers${qs ? "?" + qs : ""}`);
  if (!resp.ok) throw new Error("Erreur réseau");
  return resp.json();
}

async function fetchStats() {
  const resp = await fetch("/api/dossiers/stats");
  if (!resp.ok) throw new Error("Erreur réseau stats");
  return resp.json();
}

export function useDossiers(filters: Record<string, string> = {}) {
  const queryClient = useQueryClient();

  const query = useQuery<DossierRecord[]>({
    queryKey: ["dossiers", filters],
    queryFn: async () => {
      try {
        const data = await fetchDossiers(filters);
        await upsertDossiers(data.map(d => ({
          ...d,
          scheduledDate: d.scheduledDate?.toString() ?? new Date().toISOString(),
          lastUpdated: d.lastUpdated?.toString() ?? new Date().toISOString(),
          createdAt: d.createdAt?.toString() ?? new Date().toISOString(),
          updatedAt: d.updatedAt?.toString() ?? new Date().toISOString(),
          _syncedAt: Date.now(),
          _dirty: false,
        })));
        return data;
      } catch {
        // Fallback offline IndexedDB
        const offline = await atelierDB.dossiers.toArray();
        return offline as DossierRecord[];
      }
    },
    refetchInterval: POLL_INTERVAL,
    staleTime: 10000,
    retry: 1,
  });

  const statsQuery = useQuery({
    queryKey: ["dossiers-stats"],
    queryFn: fetchStats,
    refetchInterval: POLL_INTERVAL,
    staleTime: 10000,
    retry: 1,
  });

  const updateStatus = useMutation({
    mutationFn: async ({
      id,
      atelierStatus,
      urgency,
      clientVersion,
    }: {
      id: string;
      atelierStatus?: string;
      urgency?: string;
      clientVersion: number;
    }) => {
      if (!navigator.onLine) {
        // Queue offline
        await enqueueMutation(id, "status", { atelierStatus, urgency }, clientVersion);
        return { offline: true };
      }
      const resp = await fetch(`/api/dossiers/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atelierStatus, urgency, clientVersion }),
      });
      if (resp.status === 409) {
        const conflict = await resp.json();
        throw Object.assign(new Error("conflict"), { conflict });
      }
      if (!resp.ok) throw new Error("Erreur mise à jour");
      return resp.json();
    },
    onMutate: async ({ id, atelierStatus, urgency }) => {
      await queryClient.cancelQueries({ queryKey: ["dossiers"] });
      const prev = queryClient.getQueryData<DossierRecord[]>(["dossiers", filters]);
      queryClient.setQueryData<DossierRecord[]>(["dossiers", filters], (old = []) =>
        old.map((d) =>
          d.id === id
            ? { ...d, ...(atelierStatus && { atelierStatus }), ...(urgency && { urgency }) }
            : d
        )
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["dossiers", filters], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["dossiers"] });
      queryClient.invalidateQueries({ queryKey: ["dossiers-stats"] });
      triggerSync();
    },
  });

  return {
    dossiers: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    stats: statsQuery.data,
    statsLoading: statsQuery.isLoading,
    updateStatus,
  };
}
