import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { queryClient } from '@/lib/queryClient';
import { WsEvent } from '@servio/shared';

export function useWebSocket() {
  const token = useAuthStore((s) => s.token);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!token) return;

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const ws = new WebSocket(`${protocol}//${host}/ws?token=${encodeURIComponent(token!)}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WsEvent;
          handleEvent(msg);
        } catch {}
      };

      ws.onclose = () => {
        wsRef.current = null;
        reconnectTimer.current = setTimeout(connect, 5000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    function handleEvent(event: WsEvent) {
      switch (event.type) {
        case 'review_completed':
        case 'invoice_created':
        case 'invoice_updated':
          queryClient.invalidateQueries({ queryKey: ['reviews'] });
          queryClient.invalidateQueries({ queryKey: ['invoices'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          break;
        case 'facility_updated':
          queryClient.invalidateQueries({ queryKey: ['contracts'] });
          break;
        case 'notification_created': {
          const payload = event.payload as { id: string; type: string; title: string; message: string };
          addNotification({
            id: payload.id || crypto.randomUUID(),
            type: payload.type,
            title: payload.title,
            message: payload.message,
            isRead: false,
            entityType: null,
            entityId: null,
            createdAt: event.timestamp,
          });
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          break;
        }
        case 'dashboard_refresh':
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          break;
      }
    }

    connect();

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [token, addNotification]);
}
