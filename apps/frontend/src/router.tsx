import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Skeleton } from '@/components/ui/skeleton';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const ContractsPage = lazy(() => import('@/pages/ContractsPage'));
const FacilityDetailPage = lazy(() => import('@/pages/FacilityDetailPage'));
const FacilityFormPage = lazy(() => import('@/pages/FacilityFormPage'));
const InvoiceQueuePage = lazy(() => import('@/pages/InvoiceQueuePage'));
const ReportsPage = lazy(() => import('@/pages/ReportsPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const UsersPage = lazy(() => import('@/pages/UsersPage'));
const AuditLogPage = lazy(() => import('@/pages/AuditLogPage'));

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
    children: [
      { index: true, element: withSuspense(<DashboardPage />) },
      { path: 'contracts', element: withSuspense(<ContractsPage />) },
      {
        path: 'facilities/new',
        element: withSuspense(
          <ProtectedRoute roles={['admin', 'manager']}><FacilityFormPage /></ProtectedRoute>,
        ),
      },
      {
        path: 'facilities/:id/edit',
        element: withSuspense(
          <ProtectedRoute roles={['admin', 'manager']}><FacilityFormPage /></ProtectedRoute>,
        ),
      },
      { path: 'facilities/:id', element: withSuspense(<FacilityDetailPage />) },
      {
        path: 'invoices',
        element: withSuspense(
          <ProtectedRoute roles={['admin', 'manager', 'accountant']}><InvoiceQueuePage /></ProtectedRoute>,
        ),
      },
      {
        path: 'reports',
        element: withSuspense(
          <ProtectedRoute roles={['admin', 'manager', 'accountant']}><ReportsPage /></ProtectedRoute>,
        ),
      },
      {
        path: 'users',
        element: withSuspense(
          <ProtectedRoute roles={['admin', 'manager']}><UsersPage /></ProtectedRoute>,
        ),
      },
      {
        path: 'audit-log',
        element: withSuspense(
          <ProtectedRoute roles={['admin', 'manager']}><AuditLogPage /></ProtectedRoute>,
        ),
      },
      {
        path: 'settings',
        element: withSuspense(
          <ProtectedRoute roles={['admin']}><SettingsPage /></ProtectedRoute>,
        ),
      },
    ],
  },
]);
