import { Router } from 'express';
import * as metaController from '../controllers/meta.controller';

const router = Router();

router.get('/currency-rates', metaController.currencyRates);
router.get('/countries', metaController.countries);

export default router;
