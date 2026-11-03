import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Suggestions {
  customers: string[];
  facilities: { name: string; customerName: string | null }[];
}

// Browser <datalist> suggestions for the free-text customer / facility fields, from names already used on projects.
// Facilities are narrowed to the typed customer when that customer has any; otherwise all are offered.
export function NameSuggestionLists({ id, customerName, enabled }: { id: string; customerName: string; enabled: boolean }) {
  const { data } = useQuery<Suggestions>({
    queryKey: ['pm-name-suggestions'],
    queryFn: () => api.get('/pm/projects/suggestions'),
    enabled,
  });

  const customer = customerName.trim().toLowerCase();
  const forCustomer = (data?.facilities ?? []).filter(f => customer && f.customerName?.toLowerCase() === customer);
  const facilities = [...new Set((forCustomer.length > 0 ? forCustomer : data?.facilities ?? []).map(f => f.name))]
    .sort((a, b) => a.localeCompare(b, 'sl'));

  return (
    <>
      <datalist id={`${id}-customers`}>
        {(data?.customers ?? []).map(name => <option key={name} value={name} />)}
      </datalist>
      <datalist id={`${id}-facilities`}>
        {facilities.map(name => <option key={name} value={name} />)}
      </datalist>
    </>
  );
}
