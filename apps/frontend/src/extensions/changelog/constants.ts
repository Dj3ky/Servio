export const CATEGORY_COLOR_PRESETS = [
  '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444',
  '#06b6d4', '#f97316', '#64748b', '#ec4899', '#84cc16',
];

export interface ClCategory {
  id: string;
  name: string;
  color: string;
  orderIndex: number;
  translationKey: string | null;
}

// Seeded default categories carry a translationKey so they show translated (sl/en)
// instead of the literal DB `name`; a custom/renamed category has no key and shows as-is.
export function getCategoryLabel(category: Pick<ClCategory, 'name' | 'translationKey'>, t: (key: string) => string) {
  return category.translationKey ? t(`changelog.categoryDefaults.${category.translationKey}`) : category.name;
}

// Picks readable foreground text for an arbitrary background color (relative luminance).
export function getContrastColor(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? '#1e293b' : '#ffffff';
}

const AVATAR_COLOR_PRESETS = [
  '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444',
  '#06b6d4', '#f97316', '#0ea5e9', '#ec4899', '#84cc16',
];

export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic color per name, so the same person always gets the same avatar color.
export function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLOR_PRESETS[Math.abs(hash) % AVATAR_COLOR_PRESETS.length];
}

function dayKey(date: Date) {
  return date.toDateString();
}

// Buckets a reverse-chronological list into "Today" / "Yesterday" / formatted-date groups.
export function groupByDay<T extends { createdAt: string }>(
  items: T[],
  t: (key: string) => string,
  locale: string,
): { label: string; items: T[] }[] {
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));

  const groups: { key: string; label: string; items: T[] }[] = [];
  for (const item of items) {
    const date = new Date(item.createdAt);
    const key = dayKey(date);
    let group = groups.find(g => g.key === key);
    if (!group) {
      const label = key === today
        ? t('common.today')
        : key === yesterday
        ? t('common.yesterday')
        : date.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
      group = { key, label, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}
