import { Router } from 'express';
import * as managerController from '../controllers/manager.controller';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import { createAdminSchema, setAdminStatusSchema } from '../validators/manager.validator';

const router = Router();

// Everything here needs manager+ (manager or superadmin). Routes that are
// superadmin-only add a second restrictTo('superadmin').
router.use(protect, restrictTo('manager'));

// Store Owner accounts — manager+ can provision/manage.
router.post('/store-owners', validate(createAdminSchema), managerController.createStoreOwner);
router.get('/store-owners', managerController.listStoreOwners);
router.patch('/store-owners/:id/status', validate(setAdminStatusSchema), managerController.setStoreOwnerStatus);

// Manager accounts — superadmin only.
router.post('/managers', restrictTo('superadmin'), validate(createAdminSchema), managerController.createManager);
router.get('/managers', restrictTo('superadmin'), managerController.listManagers);
router.patch('/managers/:id/status', restrictTo('superadmin'), validate(setAdminStatusSchema), managerController.setManagerStatus);

// Complete activity log — superadmin only.
router.get('/activity', restrictTo('superadmin'), managerController.listActivity);

export default router;
