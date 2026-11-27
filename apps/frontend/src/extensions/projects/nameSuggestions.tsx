import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Suggestions {
  customers: string[];
}

// Customer names already used on projects
export function useNameSuggestions(enabled = true) {
  return useQuery<Suggestions>({
    queryKey: ['pm-name-suggestions'],
    queryFn: () => api.get('/pm/projects/suggestions'),
    enabled,
  }).data;
}

// Browser <datalist> suggestions for the free-text customer field, from names already used on projects.
export function NameSuggestionLists({ id, enabled }: { id: string; enabled: boolean }) {
  const data = useNameSuggestions(enabled);

  return (
    <datalist id={`${id}-customers`}>
      {(data?.customers ?? []).map(name => <option key={name} value={name} />)}
    </datalist>
  );
}
