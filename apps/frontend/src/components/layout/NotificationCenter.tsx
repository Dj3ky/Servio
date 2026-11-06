import { useState } from 'react';
import { Bell, MonitorSmartphone, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotificationStore } from '@/stores/notificationStore';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { formatDateTime } from '@/lib/utils';
import { desktopNotificationPermission, requestDesktopNotifications, notificationLink } from '@/lib/desktopNotifications';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

export function NotificationCenter() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setNotifications, markRead, markAllRead, unreadCount } = useNotificationStore();
  const [desktopPermission, setDesktopPermission] = useState(desktopNotificationPermission);

  const { data: licenseStatus } = useQuery<{ valid: boolean }>({
    queryKey: ['license-status'],
    queryFn: () => api.get('/license/status'),
    staleTime: 5 * 60 * 1000,
  });

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const result = await api.get<{ data: NotificationItem[]; unreadCount: number }>('/notifications');
      setNotifications(result.data, result.unreadCount);
      return result;
    },
    refetchInterval: 60000,
    enabled: licenseStatus?.valid === true,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: (_data, id) => {
      markRead(id);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => {
      markAllRead();
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/notifications/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const clearReadMutation = useMutation({
    mutationFn: () => api.delete('/notifications/read'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const notifications = data?.data ?? [];
  const hasRead = notifications.some(n => n.isRead);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" title={t('notifications.title')}>
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1">
          <DropdownMenuLabel className="p-0">{t('notifications.title')}</DropdownMenuLabel>
          <div className="flex flex-wrap justify-end">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="h-auto py-0 text-xs" onClick={() => markAllReadMutation.mutate()}>
                {t('notifications.markAllRead')}
              </Button>
            )}
            {hasRead && (
              <Button variant="ghost" size="sm" className="h-auto py-0 text-xs" disabled={clearReadMutation.isPending} onClick={() => clearReadMutation.mutate()}>
                {t('notifications.clearRead')}
              </Button>
            )}
          </div>
        </div>
        <DropdownMenuSeparator />
        {desktopPermission === 'default' && (
          <>
            <DropdownMenuItem
              className="gap-2 text-xs"
              onSelect={e => { e.preventDefault(); requestDesktopNotifications().then(setDesktopPermission); }}
            >
              <MonitorSmartphone className="h-4 w-4 shrink-0" />
              {t('notifications.enableDesktop')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {notifications.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">{t('notifications.noNotifications')}</div>
        ) : (
          <ScrollArea className="h-80">
            {notifications.map((n) => (
              <DropdownMenuItem
                key={n.id}
                className={`flex flex-col items-start gap-1 p-3 ${!n.isRead ? 'bg-muted/50' : ''}`}
                onClick={() => {
                  if (!n.isRead) markReadMutation.mutate(n.id);
                  const link = notificationLink(n);
                  if (link) navigate(link);
                }}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{t(`notifications.${n.type}` as any, n.title)}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {!n.isRead && <Badge variant="info" className="text-[10px]">{t('notifications.unread')}</Badge>}
                    {/* stopPropagation keeps the menu open and doesn't follow the notification's link */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      title={t('common.delete')}
                      disabled={deleteMutation.isPending}
                      onClick={e => { e.stopPropagation(); deleteMutation.mutate(n.id); }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground line-clamp-2">{n.message}</span>
                <span className="text-[10px] text-muted-foreground">{formatDateTime(n.createdAt)}</span>
              </DropdownMenuItem>
            ))}
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
