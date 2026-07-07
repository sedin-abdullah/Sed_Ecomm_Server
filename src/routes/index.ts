import { Router } from 'express';
import adminRoutes from './admin.routes';
import authRoutes from './auth.routes';
import cartRoutes from './cart.routes';
import categoryRoutes from './category.routes';
import couponRoutes from './coupon.routes';
import managerRoutes from './manager.routes';
import metaRoutes from './meta.routes';
import orderRoutes from './order.routes';
import paymentRoutes from './payment.routes';
import productRoutes from './product.routes';
import reviewRoutes from './review.routes';
import userRoutes from './user.routes';
import wishlistRoutes from './wishlist.routes';

const router = Router();

router.get('/health', (_req, res) => {
  res.status(200).json({ success: true, message: 'ok' });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/reviews', reviewRoutes);
router.use('/cart', cartRoutes);
router.use('/wishlist', wishlistRoutes);
router.use('/coupons', couponRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/admin', adminRoutes);
router.use('/manager', managerRoutes);
router.use('/meta', metaRoutes);

export default router;
