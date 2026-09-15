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
