import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';

interface LicenseStatus {
  valid: boolean;
  configured: boolean;
}

export function LicenseGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();

  const { data: license, isLoading } = useQuery<LicenseStatus>({
    queryKey: ['license-status'],
    queryFn: () => api.get<LicenseStatus>('/license/status'),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Settings is always accessible — admin uploads the license there
  if (location.pathname.startsWith('/settings')) {
    return <>{children}</>;
  }

  // While license status is loading, render nothing so page components
  // don't mount and fire API calls that would return 402
  if (isLoading) {
    return null;
  }

  // Valid license — normal render
  if (!user || license?.valid) {
    return <>{children}</>;
  }

  // No valid license — show gate
  const isAdmin = user.role === 'admin';

  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-6 max-w-sm text-center px-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <KeyRound className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">{t('license.gateTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('license.gateDesc')}</p>
        </div>
        {isAdmin ? (
          <Button onClick={() => navigate('/settings?tab=license')}>
            <KeyRound className="h-4 w-4 mr-2" />
            {t('license.gateButton')}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground rounded-lg border bg-muted/40 px-4 py-3">
            {t('license.gateNonAdmin')}
          </p>
        )}
      </div>
    </div>
  );
}
