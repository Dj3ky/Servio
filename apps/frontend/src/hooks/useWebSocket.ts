import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import i18n from 'i18next';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useInboxStore } from '@/stores/inboxStore';
import { queryClient } from '@/lib/queryClient';
import { showDesktopNotification, notificationLink } from '@/lib/desktopNotifications';
import { playNotificationSound } from '@/lib/notificationSound';
import { WsEvent, NotificationCreatedPayload } from '@servio/shared';

export function useWebSocket() {
  const token = useAuthStore((s) => s.token);
  // Kept in a ref so the socket effect doesn't reconnect when navigate changes
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const addNotification = useNotificationStore((s) => s.addNotification);
  const setUnreadCount = useInboxStore((s) => s.setUnreadCount);
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

    // Personal notifications: a Windows notification when the app is in the background,
    // an in-app toast when the user is looking at it. Both play the chime.
    function showPersonalNotification(payload: NotificationCreatedPayload) {
      const title = i18n.t(`notifications.${payload.type}` as any, payload.title) as string;
      const link = notificationLink(payload);
      const open = () => { if (link) navigateRef.current(link); };
      const inFocus = document.visibilityState === 'visible' && document.hasFocus();
      if (!inFocus && showDesktopNotification({ title, body: payload.message, tag: payload.id, onClick: open })) {
        playNotificationSound();
        return;
      }
      toast(`${title}: ${payload.message}`, { icon: '🔔', duration: 6000 });
      playNotificationSound();
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
          const payload = event.payload as NotificationCreatedPayload;
          addNotification({
            id: payload.id || crypto.randomUUID(),
            type: payload.type,
            title: payload.title,
            message: payload.message,
            isRead: false,
            entityType: payload.entityType ?? null,
            entityId: payload.entityId ?? null,
            createdAt: event.timestamp,
          });
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          if (payload.personal) {
            showPersonalNotification(payload);
            if (payload.type.startsWith('pm_task_')) {
              queryClient.invalidateQueries({ queryKey: ['pm-my-tasks'] });
              queryClient.invalidateQueries({ queryKey: ['pm-my-task-count'] });
            }
          } else {
            playNotificationSound();
          }
          break;
        }
        case 'dashboard_refresh':
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          queryClient.invalidateQueries({ queryKey: ['reviews'] });
          queryClient.invalidateQueries({ queryKey: ['reviews-timeline'] });
          queryClient.invalidateQueries({ queryKey: ['contracts'] });
          break;
        case 'permissions_updated':
          queryClient.invalidateQueries({ queryKey: ['permissions'] });
          break;
        case 'user_updated':
          // Role changed: reload the current user and everything that depended on the old role
          queryClient.invalidateQueries();
          break;
        case 'inbox_count': {
          const payload = event.payload as { unreadCount: number };
          setUnreadCount(payload.unreadCount);
          break;
        }
      }
    }

    connect();

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [token, addNotification, setUnreadCount]);
}
