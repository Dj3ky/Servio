import { Router } from 'express';
import authRoutes from './auth';
import dashboardRoutes from './dashboard';
import userRoutes from './users';
import customerRoutes from './customers';
import facilityRoutes from './facilities';
import contractRoutes from './contracts';
import reviewRoutes from './reviews';
import invoiceRoutes from './invoices';
import settingsRoutes from './settings';
import notificationRoutes from './notifications';
import auditLogRoutes from './auditLogs';
import reportRoutes from './reports';
import smbRoutes from './smb';
import schedulerRoutes from './scheduler';
import searchRoutes from './search';
import updateRoutes from './update';
import inboxRoutes from './inbox';
import licenseRoutes from './license';
import { requireValidLicense } from '../middleware/license';

const router = Router();

router.use('/auth', authRoutes);
router.use('/license', licenseRoutes);

// Settings GET is allowed without a license so admins can reach the license upload page
router.use('/settings', (req, res, next) => {
  if (req.method === 'GET') return next();
  return requireValidLicense(req, res, next);
}, settingsRoutes);

// All other routes require a valid license (skipped automatically when public key is placeholder)
router.use((req, res, next) => requireValidLicense(req, res, next));
router.use('/dashboard', dashboardRoutes);
router.use('/users', userRoutes);
router.use('/customers', customerRoutes);
router.use('/facilities', facilityRoutes);
router.use('/contracts', contractRoutes);
router.use('/reviews', reviewRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/notifications', notificationRoutes);
router.use('/audit-logs', auditLogRoutes);
router.use('/reports', reportRoutes);
router.use('/smb', smbRoutes);
router.use('/scheduler', schedulerRoutes);
router.use('/search', searchRoutes);
router.use('/update', updateRoutes);
router.use('/inbox', inboxRoutes);

export default router;
