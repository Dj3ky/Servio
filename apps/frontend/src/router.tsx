import { createBrowserRouter } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import ContractsPage from '@/pages/ContractsPage';
import FacilityDetailPage from '@/pages/FacilityDetailPage';
import FacilityFormPage from '@/pages/FacilityFormPage';
import InvoiceQueuePage from '@/pages/InvoiceQueuePage';
import ReportsPage from '@/pages/ReportsPage';
import SettingsPage from '@/pages/SettingsPage';
import UsersPage from '@/pages/UsersPage';
import AuditLogPage from '@/pages/AuditLogPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'contracts', element: <ContractsPage /> },
      { path: 'facilities/new', element: <ProtectedRoute roles={['admin', 'manager']}><FacilityFormPage /></ProtectedRoute> },
      { path: 'facilities/:id/edit', element: <ProtectedRoute roles={['admin', 'manager']}><FacilityFormPage /></ProtectedRoute> },
      { path: 'facilities/:id', element: <FacilityDetailPage /> },
      {
        path: 'invoices',
        element: (
          <ProtectedRoute roles={['admin', 'manager', 'accountant']}>
            <InvoiceQueuePage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'reports',
        element: (
          <ProtectedRoute roles={['admin', 'manager', 'accountant']}>
            <ReportsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'users',
        element: (
          <ProtectedRoute roles={['admin', 'manager']}>
            <UsersPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'audit-log',
        element: (
          <ProtectedRoute roles={['admin', 'manager']}>
            <AuditLogPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings',
        element: (
          <ProtectedRoute roles={['admin']}>
            <SettingsPage />
          </ProtectedRoute>
        ),
      },
    ],
  },
]);
