import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { kimaiSafeName, type KimaiCreate } from '@servio/shared';
import { api, ApiError } from '@/lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface KimaiCustomer { id: number; name: string; }
export interface KimaiProject {
  id: number;
  name: string;
  number: string | null;
  customerName: string | null;
  visible: boolean;
  linkedTo: { id: string; projectNumber: string; name: string } | null;
}

const NEW_CUSTOMER = '__new__';

export function normalizeKimaiName(name: string) {
  return kimaiSafeName(name).toLocaleLowerCase('sl');
}

export function useKimaiStatus() {
  return useQuery<{ configured: boolean }>({
    queryKey: ['pm-kimai-status'],
    queryFn: () => api.get('/pm/kimai/status'),
  });
}

// The Kimai error text, plus any field messages Kimai sent back; Kimai's own wording is not translated
export function kimaiErrorMessage(err: unknown, t: (key: string) => string): string {
  if (!(err instanceof ApiError)) return t('errors.unknown');
  const details = err.details?.kimai?.join('; ');
  return details ? `${t(err.code)} (${details})` : t(err.code);
}

// Kimai requires a customer on every project. An exact name match is preselected and any other
// name defaults to creating a new customer; either way the choice stays visible to confirm or change.
export function useKimaiCustomerChoice(customerName: string, enabled: boolean) {
  const query = useQuery<KimaiCustomer[]>({
    queryKey: ['pm-kimai-customers'],
    queryFn: () => api.get('/pm/kimai/customers'),
    enabled,
    retry: false,
  });

  const name = kimaiSafeName(customerName);
  const wanted = normalizeKimaiName(customerName);
  const [picked, setPicked] = useState<{ forName: string; value: string } | null>(null);

  // Similar names first, so a typo doesn't hide the customer that was meant
  const customers = useMemo(() => {
    const rank = (c: KimaiCustomer) => {
      const candidate = normalizeKimaiName(c.name);
      if (!wanted) return 2;
      if (candidate === wanted) return 0;
      return candidate.includes(wanted) || wanted.includes(candidate) ? 1 : 2;
    };
    return [...(query.data ?? [])].sort((a, b) => rank(a) - rank(b));
  }, [query.data, wanted]);

  const canCreate = name.length >= 2;
  const exact = customers.find(c => normalizeKimaiName(c.name) === wanted);
  const suggested = exact ? String(exact.id) : canCreate ? NEW_CUSTOMER : '';
  const value = picked?.forName === name ? picked.value : suggested;

  let payload: KimaiCreate | null = null;
  if (query.data && value === NEW_CUSTOMER) payload = { newCustomerName: name };
  else if (query.data && value) payload = { customerId: Number(value) };

  return {
    name,
    canCreate,
    customers,
    value,
    setValue: (next: string) => setPicked({ forName: name, value: next }),
    payload,
    isLoading: query.isLoading && enabled,
    error: query.error,
  };
}

export function KimaiCustomerField({ choice }: { choice: ReturnType<typeof useKimaiCustomerChoice> }) {
  const { t } = useTranslation();

  if (choice.isLoading) return <p className="text-xs text-muted-foreground">{t('common.loading')}</p>;
  if (choice.error) return <p className="text-xs text-destructive">{kimaiErrorMessage(choice.error, t)}</p>;

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{t('pm.kimai.customer')}</label>
      <Select value={choice.value} onValueChange={choice.setValue}>
        <SelectTrigger><SelectValue placeholder={t('pm.kimai.selectCustomer')} /></SelectTrigger>
        <SelectContent>
          {choice.canCreate && (
            <SelectItem value={NEW_CUSTOMER}>{t('pm.kimai.createCustomer', { name: choice.name })}</SelectItem>
          )}
          {choice.customers.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
