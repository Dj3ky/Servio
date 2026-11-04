import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { formatHours } from './hoursFormat';

export interface LabourCostData {
  totalCost: string;
  entryCount: number;
  unknownEntries: number;
  unreliableEntries: number;
  byMonth: { month: string; cost: string; seconds: number }[];
  byUser: { userName: string; cost: string; seconds: number }[];
}

const AXIS_TICK = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };

function formatCost(value: string | number) {
  // de-DE: same format as sl-SI, but sl-SI skips the thousands separator for 4-digit amounts
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value));
}

function formatCostTick(value: number) {
  return value >= 1000 ? `${(value / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })}k €` : `${value} €`;
}

function monthLabel(month: string) {
  const [year, m] = month.split('-').map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString('sl-SI', { month: 'short', year: '2-digit' });
}

// Months without entries stay on the axis as empty, so the chart doesn't hide gaps in the work
function withEmptyMonths(months: LabourCostData['byMonth']) {
  if (months.length === 0) return [];
  const known = new Map(months.map(m => [m.month, m]));
  const [lastYear, lastMonth] = months[months.length - 1].month.split('-').map(Number);
  let [year, month] = months[0].month.split('-').map(Number);

  const filled = [];
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const row = known.get(key);
    filled.push({ month: key, label: monthLabel(key), cost: Number(row?.cost ?? 0), seconds: row?.seconds ?? 0 });
    month++;
    if (month > 12) { month = 1; year++; }
  }
  return filled;
}

function CostTooltip({ active, payload }: { active?: boolean; payload?: { payload: { label: string; cost: number; seconds: number } }[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="font-medium">{row.label}</p>
      <p>{formatCost(row.cost)}</p>
      <p className="text-muted-foreground">{formatHours(row.seconds)}</p>
    </div>
  );
}

export function LabourCostView({ data }: { data: LabourCostData }) {
  const { t } = useTranslation();
  const months = useMemo(() => withEmptyMonths(data.byMonth), [data.byMonth]);
  const allUnknown = data.unknownEntries === data.entryCount;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">{t('pm.kimai.labourCost')}</p>
        <p className="text-2xl font-semibold">{allUnknown ? t('pm.kimai.costUnknown') : formatCost(data.totalCost)}</p>
      </div>

      {data.unknownEntries > 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          {t('pm.kimai.costUnknownEntries', { count: data.unknownEntries, total: data.entryCount })}
        </p>
      )}
      {data.unreliableEntries > 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          {t('pm.kimai.costUnreliableEntries', { count: data.unreliableEntries, total: data.entryCount })}
        </p>
      )}

      {!allUnknown && (
        <>
          {/* One month is just the total above, so a chart would add nothing */}
          {months.length > 1 && (
            <div>
              <p className="text-sm font-medium mb-2">{t('pm.kimai.costByMonth')}</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={months} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid className="stroke-border" vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={8} />
                    <YAxis width={56} tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={formatCostTick} />
                    <Tooltip content={<CostTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
                    <Bar dataKey="cost" fill="hsl(var(--primary))" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{t('pm.kimai.person')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t('pm.kimai.hours')}</th>
                  <th className="py-2 text-right font-medium">{t('pm.kimai.cost')}</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {data.byUser.map(u => (
                  <tr key={u.userName} className="border-b last:border-0">
                    <td className="py-2 pr-3">{u.userName}</td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">{formatHours(u.seconds)}</td>
                    <td className="py-2 text-right whitespace-nowrap">{formatCost(u.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {months.length > 1 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">{t('pm.kimai.costMonthTable')}</summary>
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">{t('pm.kimai.month')}</th>
                      <th className="py-2 pr-3 text-right font-medium">{t('pm.kimai.hours')}</th>
                      <th className="py-2 text-right font-medium">{t('pm.kimai.cost')}</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {months.map(m => (
                      <tr key={m.month} className="border-b last:border-0">
                        <td className="py-2 pr-3">{m.label}</td>
                        <td className="py-2 pr-3 text-right whitespace-nowrap">{formatHours(m.seconds)}</td>
                        <td className="py-2 text-right whitespace-nowrap">{formatCost(m.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

export function LabourCostPanel({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery<LabourCostData>({
    queryKey: ['pm-kimai-cost', projectId],
    queryFn: () => api.get(`/pm/kimai/cost/${projectId}`),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  if (!data || data.entryCount === 0) return null;
  return <LabourCostView data={data} />;
}
