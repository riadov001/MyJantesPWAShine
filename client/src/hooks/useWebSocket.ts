import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "./useAuth";
import { queryClient, apiRequest } from "@/lib/queryClient";

export function useWebSocket() {
  const { user, isAuthenticated } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;
  const isConnectingRef = useRef(false);

  const connectWebSocket = useCallback(async () => {
    if (!isAuthenticated || !user || isConnectingRef.current) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    isConnectingRef.current = true;

    try {
      const tokenRes = await apiRequest("POST", "/api/ws/auth-token");
      const tokenResponse = await tokenRes.json() as { token: string };

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected");
        reconnectAttemptsRef.current = 0;
        ws.send(JSON.stringify({
          type: "authenticate",
          token: tokenResponse.token,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "authenticated") {
            if (data.success) {
              console.log("WebSocket authenticated successfully");
            } else {
              console.error("WebSocket authentication failed:", data.error);
            }
            return;
          }

          if (data.type === "quote_updated") {
            queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          } else if (data.type === "invoice_created") {
            queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          } else if (data.type === "payment_confirmed") {
            queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          } else if (data.type === "reservation_confirmed") {
            queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          } else if (data.type === "chat_message") {
            queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations", data.conversationId, "messages"] });
            queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          } else if (data.type === "notification") {
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          }
        } catch (error) {
          console.error("WebSocket message error:", error);
        }
      };

      ws.onerror = () => {
        console.error("WebSocket error");
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected");
        isConnectingRef.current = false;
        wsRef.current = null;

        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;
          console.log(`WebSocket reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
        }
      };
    } catch (error) {
      console.error("Failed to connect WebSocket:", error);
      isConnectingRef.current = false;

      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        const delay = Math.min(2000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
      }
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  return wsRef;
}
