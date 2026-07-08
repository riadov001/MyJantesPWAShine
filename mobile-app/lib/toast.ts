export type ToastTone = 'error' | 'info' | 'success';

export interface ToastMessage {
  id: string;
  tone: ToastTone;
  text: string;
}

type Listener = (msg: ToastMessage) => void;

const listeners = new Set<Listener>();

export function subscribeToast(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitToast(tone: ToastTone, text: string): void {
  const msg: ToastMessage = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tone,
    text,
  };
  listeners.forEach((l) => l(msg));
}

export function reportNetworkError(err: unknown): void {
  const status =
    err && typeof err === 'object' && 'status' in err
      ? Number((err as { status: unknown }).status)
      : undefined;
  const message =
    err instanceof Error && err.message
      ? err.message
      : 'Le service est momentanément indisponible.';
  if (status && status >= 500) {
    emitToast('error', 'Erreur serveur — veuillez réessayer dans un instant.');
  } else if (status === 0 || status === undefined) {
    emitToast('error', 'Connexion indisponible — vérifiez votre réseau.');
  } else if (status >= 400 && status < 500 && status !== 401 && status !== 404) {
    emitToast('error', message);
  }
}
