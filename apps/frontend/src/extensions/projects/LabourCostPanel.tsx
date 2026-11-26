import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatHours } from './hoursFormat';

export interface LabourCostData {
  totalCost: string;
  entryCount: number;
  unknownEntries: number;
  unreliableEntries: number;
  byMonth: { month: string; cost: string; seconds: number }[];
  byUser: { userName: string; cost: string; seconds: number }[];
  byActivity: { activityName: string | null; cost: string; seconds: number }[];
}

const MAX_ACTIVITY_LABEL = 34;
// Rough width of one character at the 11px axis font, to size the label column to the longest name
const LABEL_CHAR_PX = 7;

const AXIS_TICK = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };

export function formatCost(value: string | number) {
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

// Rows sit 40px apart so bars stay thin however many activities there are; the full names are in the table below
function ActivityChart({ rows }: { rows: { label: string; cost: number; seconds: number }[] }) {
  const total = rows.reduce((sum, r) => sum + r.cost, 0);
  const data = rows.map(r => ({ ...r, valueLabel: `${formatCost(r.cost)} · ${total > 0 ? Math.round((r.cost / total) * 100) : 0} %` }));
  const longest = Math.min(MAX_ACTIVITY_LABEL, Math.max(...rows.map(r => r.label.length)));
  const labelWidth = Math.max(80, Math.ceil(longest * LABEL_CHAR_PX) + 12);
  return (
    <div style={{ height: rows.length * 40 + 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 130, bottom: 4, left: 0 }}>
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey="label"
            width={labelWidth}
            interval={0}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            tickFormatter={(name: string) => (name.length > MAX_ACTIVITY_LABEL ? `${name.slice(0, MAX_ACTIVITY_LABEL - 1)}…` : name)}
          />
          <Tooltip content={<CostTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
          <Bar dataKey="cost" fill="hsl(var(--primary))" maxBarSize={24} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {/* Plain <text>: Recharts' own label wraps to the bar's width, which breaks short bars onto two lines */}
            <LabelList
              dataKey="valueLabel"
              content={({ x, y, width, height, value }) => (
                <text
                  x={Number(x) + Number(width) + 6}
                  y={Number(y) + Number(height) / 2}
                  dominantBaseline="central"
                  fontSize={11}
                  fill="hsl(var(--foreground))"
                  className="tabular-nums"
                >
                  {value}
                </text>
              )}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Warnings and charts only: the total sits in the Hours tab's summary tiles, and cost per person in its people table
export function LabourCostCharts({ data }: { data: LabourCostData }) {
  const { t } = useTranslation();
  const months = useMemo(() => withEmptyMonths(data.byMonth), [data.byMonth]);
  const activities = useMemo(() => data.byActivity.map(a => ({
    label: a.activityName ?? t('pm.kimai.noActivity'),
    cost: Number(a.cost),
    seconds: a.seconds,
  })), [data.byActivity, t]);
  const allUnknown = data.unknownEntries === data.entryCount;

  return (
    <div className="space-y-6">
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

          <div className="space-y-2">
            <p className="text-sm font-medium">{t('pm.kimai.costByActivity')}</p>
            {/* A single activity is just the total above, so a chart would add nothing */}
            {activities.length > 1 && <ActivityChart rows={activities} />}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">{t('pm.kimai.activity')}</th>
                    <th className="py-2 pr-3 text-right font-medium">{t('pm.kimai.hours')}</th>
                    <th className="py-2 pr-3 text-right font-medium">{t('pm.kimai.costPerHour')}</th>
                    <th className="py-2 text-right font-medium">{t('pm.kimai.cost')}</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {activities.map(a => (
                    <tr key={a.label} className="border-b last:border-0">
                      <td className="py-2 pr-3">{a.label}</td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">{formatHours(a.seconds)}</td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">{a.seconds > 0 ? formatCost(a.cost / (a.seconds / 3600)) : '—'}</td>
                      <td className="py-2 text-right whitespace-nowrap">{formatCost(a.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
