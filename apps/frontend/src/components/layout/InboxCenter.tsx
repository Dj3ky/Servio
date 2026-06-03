import { Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useInboxStore } from '@/stores/inboxStore';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { formatDateTime } from '@/lib/utils';

interface InboxResponse {
  enabled: boolean;
  unreadCount: number;
  messages: Array<{ uid: number; from: string; subject: string; date: string; seen: boolean }>;
}

export function InboxCenter() {
  const { t } = useTranslation();
  const { enabled, unreadCount, messages, setInbox, markSeen } = useInboxStore();

  useQuery({
    queryKey: ['inbox'],
    queryFn: async () => {
      const result = await api.get<InboxResponse>('/inbox');
      setInbox(result.enabled, result.unreadCount, result.messages);
      return result;
    },
    refetchInterval: 5 * 60 * 1000,
  });

  const markReadMutation = useMutation({
    mutationFn: (uid: number) => api.post(`/inbox/${uid}/read`),
    onSuccess: (_data, uid) => {
      markSeen(uid);
      queryClient.invalidateQueries({ queryKey: ['inbox'] });
    },
  });

  if (!enabled) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Mail className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96">
        <div className="flex items-center justify-between px-2 py-1">
          <DropdownMenuLabel className="p-0">{t('inbox.title')}</DropdownMenuLabel>
          {unreadCount > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {unreadCount} {t('inbox.unread')}
            </Badge>
          )}
        </div>
        <DropdownMenuSeparator />
        {messages.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">{t('inbox.empty')}</div>
        ) : (
          <ScrollArea className="h-96">
            {messages.map((m) => (
              <DropdownMenuItem
                key={m.uid}
                className={`flex flex-col items-start gap-0.5 p-3 cursor-pointer ${!m.seen ? 'bg-muted/50' : ''}`}
                onClick={() => !m.seen && markReadMutation.mutate(m.uid)}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className={`text-xs truncate max-w-[200px] ${!m.seen ? 'font-semibold' : ''}`}>{m.from}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{formatDateTime(m.date)}</span>
                </div>
                <span className={`text-xs truncate w-full ${!m.seen ? 'font-medium' : 'text-muted-foreground'}`}>{m.subject}</span>
              </DropdownMenuItem>
            ))}
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
