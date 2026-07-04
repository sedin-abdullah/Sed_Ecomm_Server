import { Router } from 'express';
import * as couponController from '../controllers/coupon.controller';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import { createCouponSchema, updateCouponSchema } from '../validators/coupon.validator';

const router = Router();

router.get('/validate/:code', couponController.validate);

router.get('/', protect, restrictTo('admin'), couponController.list);
router.post('/', protect, restrictTo('admin'), validate(createCouponSchema), couponController.create);
router.patch('/:id', protect, restrictTo('admin'), validate(updateCouponSchema), couponController.update);
router.delete('/:id', protect, restrictTo('admin'), couponController.remove);

export default router;
