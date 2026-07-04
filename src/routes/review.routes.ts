import { Router } from 'express';
import * as reviewController from '../controllers/review.controller';
import { protect } from '../middlewares/auth.middleware';

const router = Router();

router.post('/:id/like', protect, reviewController.like);
router.delete('/:id', protect, reviewController.remove);

export default router;
