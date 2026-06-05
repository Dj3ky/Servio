import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { usePermissionsStore } from '@/stores/permissionsStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: string[];
  permKey?: string; // "section.action" — resolved against the live permissions store
}

export function ProtectedRoute({ children, roles, permKey }: ProtectedRouteProps) {
  const { token, user } = useAuthStore();
  const location = useLocation();
  const perms = usePermissionsStore(s => s.perms);

  if (!token || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const allowedRoles: string[] | undefined = permKey
    ? (() => { const [section, action] = permKey.split('.'); return perms[section]?.[action]; })()
    : roles;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
