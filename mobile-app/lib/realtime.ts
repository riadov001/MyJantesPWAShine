import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth-context';
import { emitToast } from './toast';

type RealtimeMessage =
  | { type: 'authenticated'; success: boolean }
  | { type: 'pong' }
  | { type: 'notification'; title: string; message: string; eventType?: string; relatedId?: string | null }
  | { type: 'chat_message'; conversationId: string; message: unknown }
  | { type: string; [k: string]: unknown };

function isNotification(m: RealtimeMessage): m is { type: 'notification'; title: string; message: string; eventType?: string; relatedId?: string | null } {
  return m.type === 'notification';
}

function isChatMessage(m: RealtimeMessage): m is { type: 'chat_message'; conversationId: string; message: unknown } {
  return m.type === 'chat_message';
}

export function useRealtime() {
  const { client, isAuthenticated, user } = useAuth();
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    stoppedRef.current = false;
    let cancelled = false;
    let pingTimer: ReturnType<typeof setInterval> | null = null;

    const connect = async () => {
      if (stoppedRef.current || cancelled) return;
      try {
        const ws = await client.openWebSocket();
        wsRef.current = ws;

        ws.onopen = () => {
          retryRef.current = 0;
          pingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(JSON.stringify({ type: 'ping' }));
              } catch {
                /* ignore */
              }
            }
          }, 25_000);
        };

        ws.onmessage = (event) => {
          let data: RealtimeMessage | null = null;
          try {
            data = JSON.parse(String(event.data));
          } catch {
            return;
          }
          if (!data) return;

          if (isNotification(data)) {
            qc.invalidateQueries({ queryKey: ['notifications'] });
            qc.invalidateQueries({ queryKey: ['notifications-unread'] });

            // Invalidate the relevant entity list/detail so dependent screens refresh.
            const ev = (data.eventType ?? '').toLowerCase();
            const rid = data.relatedId ?? null;
            const touchesQuote = ev.includes('quote') || ev.includes('devis');
            const touchesInvoice = ev.includes('invoice') || ev.includes('facture') || ev.includes('payment');
            const touchesReservation = ev.includes('reservation') || ev.includes('rendez');

            if (touchesQuote) {
              qc.invalidateQueries({ queryKey: ['quotes'] });
              if (rid) qc.invalidateQueries({ queryKey: ['quote', rid] });
            }
            if (touchesInvoice) {
              qc.invalidateQueries({ queryKey: ['invoices'] });
              if (rid) qc.invalidateQueries({ queryKey: ['invoice', rid] });
            }
            if (touchesReservation) {
              qc.invalidateQueries({ queryKey: ['reservations'] });
              if (rid) qc.invalidateQueries({ queryKey: ['reservation', rid] });
            }

            emitToast('info', `${data.title}: ${data.message}`);
          } else if (isChatMessage(data)) {
            qc.invalidateQueries({ queryKey: ['conversations'] });
            qc.invalidateQueries({ queryKey: ['chat-unread'] });
            qc.invalidateQueries({ queryKey: ['messages', data.conversationId] });
          }
        };

        ws.onclose = () => {
          if (pingTimer) {
            clearInterval(pingTimer);
            pingTimer = null;
          }
          wsRef.current = null;
          if (stoppedRef.current || cancelled) return;
          // Exponential backoff up to 30s
          const delay = Math.min(30_000, 1000 * Math.pow(2, retryRef.current));
          retryRef.current += 1;
          setTimeout(() => connect(), delay);
        };

        ws.onerror = () => {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        };
      } catch (err) {
        if (stoppedRef.current || cancelled) return;
        const delay = Math.min(30_000, 1000 * Math.pow(2, retryRef.current));
        retryRef.current += 1;
        setTimeout(() => connect(), delay);
      }
    };

    connect();

    return () => {
      cancelled = true;
      stoppedRef.current = true;
      if (pingTimer) clearInterval(pingTimer);
      try {
        wsRef.current?.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    };
  }, [isAuthenticated, user?.id, client, qc]);
}
