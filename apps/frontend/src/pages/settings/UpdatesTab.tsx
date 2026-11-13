import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { CheckCircle2, RefreshCw, GitBranch, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { formatDateTime } from '@/lib/utils';
import { SectionHeader } from './shared';

interface UpdateStatus {
  currentCommit: string;
  remoteCommit: string | null;
  updateAvailable: boolean;
  lastChecked: string | null;
  checking: boolean;
  applying: boolean;
  lastError: string | null;
  isDocker: boolean;
}

interface UpdateLog {
  lines: string[];
  done: boolean;
  success: boolean;
}

export function UpdatesTab() {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [updateDone, setUpdateDone] = useState(false);
  const [updateSucceeded, setUpdateSucceeded] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: status } = useQuery<UpdateStatus>({
    queryKey: ['update-status'],
    queryFn: () => api.get<UpdateStatus>('/update/status'),
    refetchInterval: isUpdating ? false : 60_000,
  });

  const check = useMutation({
    mutationFn: () => api.post<UpdateStatus>('/update/check'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['update-status'] }),
    onError: () => toast.error(t('settings.checkFailed')),
  });


  function startLogPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    let consecutiveErrors = 0;
    let maxSeenLines = 0;

    function finishAsSuccess(extraLine?: string) {
      clearInterval(pollRef.current!);
      pollRef.current = null;
      if (extraLine) setLogLines(prev => [...prev, extraLine]);
      setUpdateDone(true);
      setUpdateSucceeded(true);
      waitForServerAndReload();
    }

    pollRef.current = setInterval(async () => {
      try {
        const log = await api.get<UpdateLog>('/update/log');
        consecutiveErrors = 0;

        setLogLines(log.lines);
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;

        if (log.done) {
          // Script finished cleanly before the process was killed
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setUpdateDone(true);
          setUpdateSucceeded(log.success);
          if (log.success) setTimeout(() => waitForServerAndReload(), 3000);
          return;
        }

        if (log.lines.length > maxSeenLines) {
          maxSeenLines = log.lines.length;
        } else if (maxSeenLines > 0 && log.lines.length === 0) {
          // pm2 reload swapped to new process — in-memory log reset to empty.
          // All fallible steps (git pull, build, migrate) already passed.
          finishAsSuccess('==> Restarting server...');
        }
      } catch {
        consecutiveErrors++;
        // pm2 restart (hard kill) scenario — server fully down for ≥3 s
        if (consecutiveErrors >= 3) {
          finishAsSuccess('==> Restarting server...');
        }
      }
    }, 1000);
  }

  function waitForServerAndReload() {
    const poll = setInterval(async () => {
      try {
        await fetch('/api/health');
        clearInterval(poll);
        window.location.reload();
      } catch {
        // not back yet
      }
    }, 2000);
  }

  const apply = useMutation({
    mutationFn: () => api.post('/update/apply'),
    onSuccess: () => {
      setConfirmOpen(false);
      setIsUpdating(true);
      setLogLines([]);
      setUpdateDone(false);
      setUpdateSucceeded(false);
      startLogPolling();
    },
    onError: () => toast.error(t('settings.updateFailed')),
  });

  const busy = status?.checking || status?.applying || check.isPending || isUpdating;

  return (
    <div className="space-y-4">
      <Card>
        <SectionHeader icon={GitBranch} title={t('settings.updates')} description={t('settings.updatesDesc')} />
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('settings.currentVersion')}</p>
              <p className="text-sm font-mono">{status?.currentCommit || t('settings.unknown')}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('settings.remoteVersion')}</p>
              <p className="text-sm font-mono">{status?.remoteCommit || '—'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('settings.lastChecked')}</p>
              <p className="text-sm">{status?.lastChecked ? formatDateTime(status.lastChecked) : t('settings.neverChecked')}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('common.status')}</p>
              {status?.updateAvailable ? (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="h-3 w-3" />{t('settings.updateAvailable')}
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />{t('settings.upToDate')}
                </Badge>
              )}
            </div>
          </div>

          {status?.lastError && !isUpdating && !status.isDocker && (
            <p className="text-sm text-destructive">{status.lastError}</p>
          )}

          <Separator />

          {status?.isDocker ? (
            <div className="space-y-3">
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => check.mutate()} disabled={busy}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${check.isPending || status?.checking ? 'animate-spin' : ''}`} />
                  {t('settings.checkNow')}
                </Button>
              </div>
              {status?.lastError && (
                <p className="text-sm text-destructive">{status.lastError}</p>
              )}
              <div className="flex items-start gap-3 rounded-md border border-muted bg-muted/40 p-4 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="space-y-2">
                  <p>{t('settings.dockerUpdateNotice')}</p>
                  <pre className="text-xs font-mono bg-black/10 dark:bg-white/5 rounded px-2 py-1 select-all whitespace-pre-wrap">docker compose pull && docker compose up -d</pre>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => check.mutate()} disabled={busy}>
                <RefreshCw className={`h-4 w-4 mr-2 ${check.isPending || status?.checking ? 'animate-spin' : ''}`} />
                {t('settings.checkNow')}
              </Button>
              {status?.updateAvailable && !isUpdating && (
                <Button onClick={() => setConfirmOpen(true)} disabled={busy}>
                  {t('settings.applyUpdate')}
                </Button>
              )}
            </div>
          )}

          {/* Terminal output */}
          {isUpdating && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {!updateDone && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                {updateDone && updateSucceeded && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                {updateDone && !updateSucceeded && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
                <p className="text-xs font-medium text-muted-foreground">
                  {!updateDone
                    ? t('settings.applying')
                    : updateSucceeded
                    ? t('settings.updateSuccess')
                    : t('settings.updateFailed')}
                </p>
                {updateDone && updateSucceeded && (
                  <p className="text-xs text-muted-foreground">{t('settings.reloading')}</p>
                )}
              </div>
              <pre
                ref={logRef}
                className="bg-black text-green-400 text-xs font-mono rounded-md p-3 h-56 overflow-y-auto whitespace-pre-wrap leading-relaxed"
              >
                {logLines.join('\n')}
                {!updateDone && <span className="animate-pulse">█</span>}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.applyConfirmTitle')}</DialogTitle>
            <p className="text-sm text-muted-foreground pt-1">{t('settings.applyConfirmDesc')}</p>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => apply.mutate()} disabled={apply.isPending}>
              {apply.isPending ? t('settings.applying') : t('settings.applyUpdate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
