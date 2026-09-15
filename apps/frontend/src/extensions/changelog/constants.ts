export const CATEGORY_COLOR_PRESETS = [
  '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444',
  '#06b6d4', '#f97316', '#64748b', '#ec4899', '#84cc16',
];

export interface ClCategory {
  id: string;
  name: string;
  color: string;
  orderIndex: number;
}
