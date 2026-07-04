import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { protect } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import { createAddressSchema, updateAddressSchema, updateMeSchema } from '../validators/user.validator';

const router = Router();

router.use(protect);

router.get('/me', userController.me);
router.patch('/me', validate(updateMeSchema), userController.updateMe);

router.get('/addresses', userController.listAddresses);
router.post('/addresses', validate(createAddressSchema), userController.createAddress);
router.patch('/addresses/:id', validate(updateAddressSchema), userController.updateAddress);
router.delete('/addresses/:id', userController.deleteAddress);

export default router;
