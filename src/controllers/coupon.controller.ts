import { Request, Response } from 'express';
import * as couponService from '../services/coupon.service';
import { asyncHandler } from '../utils/asyncHandler';
import { sendResponse } from '../utils/sendResponse';
import { CreateCouponInput, UpdateCouponInput } from '../validators/coupon.validator';

export const validate = asyncHandler(async (req: Request<{ code: string }>, res: Response) => {
  const amount = req.query.amount !== undefined ? Number(req.query.amount) : undefined;
  const preview = await couponService.validateCouponCode(req.params.code, amount);
  sendResponse(res, 200, { data: preview });
});

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const coupons = await couponService.listCoupons();
  sendResponse(res, 200, { data: coupons });
});

export const create = asyncHandler(
  async (req: Request<unknown, unknown, CreateCouponInput>, res: Response) => {
    const coupon = await couponService.createCoupon(req.body);
    sendResponse(res, 201, { data: coupon, message: 'Coupon created successfully' });
  },
);

export const update = asyncHandler(
  async (req: Request<{ id: string }, unknown, UpdateCouponInput>, res: Response) => {
    const coupon = await couponService.updateCoupon(req.params.id, req.body);
    sendResponse(res, 200, { data: coupon, message: 'Coupon updated successfully' });
  },
);

export const remove = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  await couponService.deleteCoupon(req.params.id);
  sendResponse(res, 200, { message: 'Coupon deleted successfully' });
});
