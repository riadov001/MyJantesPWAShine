import { useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { setStatusCallback, startOfflineQueue } from "@/lib/offlineQueue";

type SyncStatus = "idle" | "syncing" | "synced" | "offline" | "error";

export function SyncIndicator() {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    setStatusCallback((s, p) => { setStatus(s); setPending(p); });
    const stop = startOfflineQueue();
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { stop(); window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  if (!online || status === "offline") {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-900/80 border border-red-500 text-red-200 text-sm font-medium">
        <WifiOff className="h-4 w-4" />
        <span>Hors-ligne</span>
        {pending > 0 && <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{pending}</span>}
      </div>
    );
  }

  if (status === "syncing") {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-900/80 border border-yellow-500 text-yellow-200 text-sm font-medium">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>Sync en cours…</span>
        {pending > 0 && <span className="text-xs">({pending})</span>}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-900/80 border border-orange-500 text-orange-200 text-sm font-medium">
        <AlertCircle className="h-4 w-4" />
        <span>Erreur sync</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-900/80 border border-green-500 text-green-200 text-sm font-medium">
      <CheckCircle2 className="h-4 w-4" />
      <span>Synchronisé</span>
    </div>
  );
}
