import { Router } from 'express';
import * as managerController from '../controllers/manager.controller';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import { createAdminSchema, setAdminStatusSchema } from '../validators/manager.validator';

const router = Router();

// Manager-only. NOTE: restrictTo('manager') does NOT include admins — only the
// manager can provision/disable admin accounts.
router.use(protect, restrictTo('manager'));

router.post('/admins', validate(createAdminSchema), managerController.createAdmin);
router.get('/admins', managerController.listAdmins);
router.patch('/admins/:id/status', validate(setAdminStatusSchema), managerController.setAdminStatus);

// Approval workflow
router.get('/change-requests', managerController.listChangeRequests);
router.post('/change-requests/:id/approve', managerController.approveChange);
router.post('/change-requests/:id/reject', managerController.rejectChange);

export default router;
