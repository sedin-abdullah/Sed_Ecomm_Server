import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import * as orderController from '../controllers/order.controller';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import { setCustomerStatusSchema } from '../validators/admin.validator';
import { listOrdersQuerySchema, updateOrderStatusSchema } from '../validators/order.validator';

const router = Router();

router.use(protect, restrictTo('admin'));

router.get('/dashboard/summary', adminController.dashboardSummary);
router.get('/dashboard/best-sellers', adminController.bestSellers);

router.get('/customers', adminController.listCustomers);
router.get('/customers/:id', adminController.getCustomer);
router.patch(
  '/customers/:id/status',
  validate(setCustomerStatusSchema),
  adminController.setCustomerStatus,
);

router.get('/orders', validate(listOrdersQuerySchema, 'query'), orderController.listAllOrders);
router.patch('/orders/:id/status', validate(updateOrderStatusSchema), orderController.updateStatus);

export default router;
