import { Router } from 'express';
import * as productController from '../controllers/product.controller';
import * as reviewController from '../controllers/review.controller';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import { upload } from '../middlewares/upload';
import { validate } from '../middlewares/validate';
import {
  createProductSchema,
  listProductsQuerySchema,
  updateProductSchema,
} from '../validators/product.validator';
import { createReviewSchema } from '../validators/review.validator';

const router = Router();

router.get('/', validate(listProductsQuerySchema, 'query'), productController.list);
router.get('/search/suggest', productController.suggest);
router.get('/facets', productController.facets);
router.get('/:slug', productController.getBySlug);
router.get('/:id/related', productController.related);

router.get('/:id/reviews', reviewController.listByProduct);
router.post(
  '/:id/reviews',
  protect,
  upload.array('images', 4),
  validate(createReviewSchema),
  reviewController.create,
);

router.post(
  '/',
  protect,
  restrictTo('admin'),
  upload.array('images', 8),
  validate(createProductSchema),
  productController.create,
);
router.patch(
  '/:id',
  protect,
  restrictTo('admin'),
  upload.array('images', 8),
  validate(updateProductSchema),
  productController.update,
);
router.delete('/:id', protect, restrictTo('admin'), productController.remove);
router.post('/:id/images', protect, restrictTo('admin'), upload.array('images', 8), productController.addImages);

export default router;
