import { Request, Response } from 'express';
import * as paymentService from '../services/payment.service';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendResponse } from '../utils/sendResponse';
import { InitiatePaymentInput, VerifyPaymentInput } from '../validators/payment.validator';

function requireUserId(req: Pick<Request, 'user'>): string {
  if (!req.user) throw new AppError('Authentication required', 401);
  return req.user.id as string;
}

export const initiate = asyncHandler(
  async (req: Request<unknown, unknown, InitiatePaymentInput>, res: Response) => {
    const simulateFailure = req.query.simulateFailure === 'true';
    const result = await paymentService.initiatePayment(requireUserId(req), req.body, simulateFailure);
    sendResponse(res, 201, { data: result });
  },
);

export const verify = asyncHandler(
  async (req: Request<unknown, unknown, VerifyPaymentInput>, res: Response) => {
    const { payment, order, message } = await paymentService.verifyPayment(requireUserId(req), req.body);
    sendResponse(res, 200, {
      data: { payment, orderStatus: order.status, paymentStatus: order.paymentStatus },
      message,
    });
  },
);

export const getById = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const isAdmin = req.user?.role === 'admin';
  const payment = await paymentService.getPayment(requireUserId(req), req.params.id, isAdmin);
  sendResponse(res, 200, { data: payment });
});
