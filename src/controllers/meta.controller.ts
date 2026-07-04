import { Request, Response } from 'express';
import * as metaService from '../services/meta.service';
import { asyncHandler } from '../utils/asyncHandler';
import { sendResponse } from '../utils/sendResponse';

export const currencyRates = asyncHandler(async (_req: Request, res: Response) => {
  const rates = await metaService.getCurrencyRates();
  sendResponse(res, 200, { data: rates });
});

export const countries = asyncHandler(async (_req: Request, res: Response) => {
  const list = await metaService.getCountries();
  sendResponse(res, 200, { data: list });
});
