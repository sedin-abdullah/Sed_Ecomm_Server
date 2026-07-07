import { Request, Response } from 'express';
import * as couponService from '../services/coupon.service';
import { asyncHandler } from '../utils/asyncHandler';
import { sendResponse } from '../utils/sendResponse';
import { gate } from '../utils/approvalGate';
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
    await gate(
      req,
      res,
      { module: 'coupon', action: 'create', targetLabel: req.body.code, payload: req.body, appliedStatus: 201, appliedMessage: 'Coupon created successfully' },
      () => couponService.createCoupon(req.body),
    );
  },
);

export const update = asyncHandler(
  async (req: Request<{ id: string }, unknown, UpdateCouponInput>, res: Response) => {
    await gate(
      req,
      res,
      { module: 'coupon', action: 'update', targetId: req.params.id, targetLabel: req.body.code, payload: req.body, appliedMessage: 'Coupon updated successfully' },
      () => couponService.updateCoupon(req.params.id, req.body),
    );
  },
);

export const remove = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  await gate(
    req,
    res,
    { module: 'coupon', action: 'delete', targetId: req.params.id, appliedMessage: 'Coupon deleted successfully' },
    () => couponService.deleteCoupon(req.params.id),
  );
});
