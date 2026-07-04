import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller';
import { protect } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import { initiatePaymentSchema, verifyPaymentSchema } from '../validators/payment.validator';

const router = Router();

router.use(protect);

router.post('/initiate', validate(initiatePaymentSchema), paymentController.initiate);
router.post('/verify', validate(verifyPaymentSchema), paymentController.verify);
router.get('/:id', paymentController.getById);

export default router;
