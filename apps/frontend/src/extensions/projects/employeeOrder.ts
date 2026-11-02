import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Manual order of employee groups, set with the arrows on the Projects page
export function useEmployeeOrder() {
  const { data = [] } = useQuery<string[]>({
    queryKey: ['pm-employee-order'],
    queryFn: () => api.get('/pm/projects/employee-order'),
  });
  return data;
}

// Same group order as the Projects page: saved manual order, then the rest, unassigned last
export function sortByEmployeeOrder<T extends { employeeId: string | null }>(groups: T[], order: string[]): T[] {
  const rank = (id: string | null) => {
    if (!id) return Number.MAX_SAFE_INTEGER;
    const i = order.indexOf(id);
    return i === -1 ? order.length : i;
  };
  return [...groups].sort((a, b) => rank(a.employeeId) - rank(b.employeeId));
}
