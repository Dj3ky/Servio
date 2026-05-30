import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type FilterValue = string | undefined;

interface FilterState {
  filters: Record<string, Record<string, FilterValue>>;
  setFilter: (page: string, key: string, value: FilterValue) => void;
  getFilter: (page: string, key: string, defaultValue?: FilterValue) => FilterValue;
  clearFilters: (page: string) => void;
}

export const useFilterStore = create<FilterState>()(
  persist(
    (set, get) => ({
      filters: {},
      setFilter: (page, key, value) =>
        set((state) => ({
          filters: {
            ...state.filters,
            [page]: { ...(state.filters[page] ?? {}), [key]: value },
          },
        })),
      getFilter: (page, key, defaultValue) =>
        get().filters[page]?.[key] ?? defaultValue,
      clearFilters: (page) =>
        set((state) => {
          const { [page]: _, ...rest } = state.filters;
          return { filters: rest };
        }),
    }),
    { name: 'servio-filters' },
  ),
);
