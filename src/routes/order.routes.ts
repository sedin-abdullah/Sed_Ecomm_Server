import { Router } from 'express';
import * as orderController from '../controllers/order.controller';
import { protect } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import { createOrderSchema, listOrdersQuerySchema } from '../validators/order.validator';

const router = Router();

router.use(protect);

router.post('/', validate(createOrderSchema), orderController.create);
router.get('/', validate(listOrdersQuerySchema, 'query'), orderController.myOrders);
router.get('/:id', orderController.getById);
router.post('/:id/cancel', orderController.cancel);
router.post('/:id/return', orderController.returnOrder);
router.get('/:id/invoice', orderController.invoice);
router.get('/:id/track', orderController.track);

export default router;
