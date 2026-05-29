import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotificationStore } from '@/stores/notificationStore';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { formatDateTime } from '@/lib/utils';

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
  const { setNotifications, markRead, markAllRead, unreadCount } = useNotificationStore();

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const result = await api.get<{ data: NotificationItem[]; unreadCount: number }>('/notifications');
      setNotifications(result.data, result.unreadCount);
      return result;
    },
    refetchInterval: 60000,
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

  const notifications = data?.data ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
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
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-auto py-0 text-xs" onClick={() => markAllReadMutation.mutate()}>
              {t('notifications.markAllRead')}
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">{t('notifications.noNotifications')}</div>
        ) : (
          <ScrollArea className="h-80">
            {notifications.map((n) => (
              <DropdownMenuItem
                key={n.id}
                className={`flex flex-col items-start gap-1 p-3 ${!n.isRead ? 'bg-muted/50' : ''}`}
                onClick={() => !n.isRead && markReadMutation.mutate(n.id)}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-xs font-semibold">{t(`notifications.${n.type}` as any, n.title)}</span>
                  {!n.isRead && <Badge variant="info" className="text-[10px]">{t('notifications.unread')}</Badge>}
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
