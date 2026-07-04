import { Router } from 'express';
import * as cartController from '../controllers/cart.controller';
import { protect } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import { addCartItemSchema, applyCouponSchema, updateCartItemSchema } from '../validators/cart.validator';

const router = Router();

router.use(protect);

router.get('/', cartController.getCart);
router.post('/items', validate(addCartItemSchema), cartController.addItem);
router.patch('/items/:itemId', validate(updateCartItemSchema), cartController.updateItem);
router.delete('/items/:itemId', cartController.removeItem);
router.post('/items/:itemId/save-for-later', cartController.toggleSaveForLater);
router.post('/apply-coupon', validate(applyCouponSchema), cartController.applyCoupon);
router.post('/remove-coupon', cartController.removeCoupon);

export default router;
