import { lazy, Suspense, useEffect } from 'react';
import { permissions } from '@servio/shared';
import { createBrowserRouter, useRouteError } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Skeleton } from '@/components/ui/skeleton';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const ContractsPage = lazy(() => import('@/pages/ContractsPage'));
const FacilityDetailPage = lazy(() => import('@/pages/FacilityDetailPage'));
const InvoiceQueuePage = lazy(() => import('@/pages/InvoiceQueuePage'));
const ReportsPage = lazy(() => import('@/pages/ReportsPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const UsersPage = lazy(() => import('@/pages/UsersPage'));
const AuditLogPage = lazy(() => import('@/pages/AuditLogPage'));
const ContractTimelinePage = lazy(() => import('@/pages/ContractTimelinePage'));

function ChunkErrorBoundary() {
  const error = useRouteError();
  const isChunkError = error instanceof TypeError && error.message.includes('dynamically imported module');

  useEffect(() => {
    if (!isChunkError) return;
    // Reload once to pick up new chunk filenames after a deployment.
    // The flag prevents an infinite reload loop if chunks are genuinely missing.
    const key = 'chunk_reload_attempted';
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
      window.location.reload();
    }
  }, [isChunkError]);

  // Clear the flag on every clean render so future reloads work normally.
  useEffect(() => {
    if (!isChunkError) sessionStorage.removeItem('chunk_reload_attempted');
  });

  if (isChunkError) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Posodabljanje aplikacije…
      </div>
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="flex h-screen items-center justify-center p-8 text-center">
      <div className="space-y-2">
        <p className="font-semibold">Prišlo je do napake</p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

function PageLoader() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function withSuspense(element: React.ReactNode) {
  return <Suspense fallback={<PageLoader />}>{element}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: withSuspense(<LoginPage />),
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    errorElement: <ChunkErrorBoundary />,
    children: [
      { index: true, element: withSuspense(<DashboardPage />) },
      { path: 'contracts', element: withSuspense(<ContractsPage />) },
      { path: 'contract-timeline', element: withSuspense(<ContractTimelinePage />) },
      { path: 'facilities/:id', element: withSuspense(<FacilityDetailPage />) },
      {
        path: 'invoices',
        element: withSuspense(
          <ProtectedRoute roles={permissions.pages.invoices}><InvoiceQueuePage /></ProtectedRoute>,
        ),
      },
      {
        path: 'reports',
        element: withSuspense(
          <ProtectedRoute roles={permissions.pages.reports}><ReportsPage /></ProtectedRoute>,
        ),
      },
      {
        path: 'users',
        element: withSuspense(
          <ProtectedRoute roles={permissions.pages.users}><UsersPage /></ProtectedRoute>,
        ),
      },
      {
        path: 'audit-log',
        element: withSuspense(
          <ProtectedRoute roles={permissions.pages.auditLog}><AuditLogPage /></ProtectedRoute>,
        ),
      },
      {
        path: 'settings',
        element: withSuspense(
          <ProtectedRoute roles={permissions.pages.settings}><SettingsPage /></ProtectedRoute>,
        ),
      },
    ],
  },
]);
