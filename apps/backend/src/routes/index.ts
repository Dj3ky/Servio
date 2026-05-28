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

const router = Router();

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/users', userRoutes);
router.use('/customers', customerRoutes);
router.use('/facilities', facilityRoutes);
router.use('/contracts', contractRoutes);
router.use('/reviews', reviewRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/settings', settingsRoutes);
router.use('/notifications', notificationRoutes);
router.use('/audit-logs', auditLogRoutes);
router.use('/reports', reportRoutes);
router.use('/smb', smbRoutes);
router.use('/scheduler', schedulerRoutes);

export default router;
