import { Router } from 'express';
import * as categoryController from '../controllers/category.controller';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import { createCategorySchema, updateCategorySchema } from '../validators/category.validator';

const router = Router();

router.get('/', categoryController.list);
router.get('/:slug', categoryController.getBySlug);

router.post('/', protect, restrictTo('admin'), validate(createCategorySchema), categoryController.create);
router.patch('/:id', protect, restrictTo('admin'), validate(updateCategorySchema), categoryController.update);
router.delete('/:id', protect, restrictTo('admin'), categoryController.remove);

export default router;
