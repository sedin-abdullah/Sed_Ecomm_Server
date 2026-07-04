import { Router } from 'express';
import * as wishlistController from '../controllers/wishlist.controller';
import { protect } from '../middlewares/auth.middleware';

const router = Router();

router.use(protect);

router.get('/', wishlistController.getWishlist);
router.post('/:productId', wishlistController.addProduct);
router.delete('/:productId', wishlistController.removeProduct);

export default router;
