import { Request, Response } from 'express';
import * as orderService from '../services/order.service';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendResponse } from '../utils/sendResponse';
import { gate } from '../utils/approvalGate';
import { logActivity } from '../services/approval.service';
import {
  CreateOrderInput,
  ListOrdersQuery,
  ProcessRefundInput,
  RequestRefundInput,
  UpdateOrderStatusInput,
} from '../validators/order.validator';

function requireUserId(req: Pick<Request, 'user'>): string {
  if (!req.user) throw new AppError('Authentication required', 401);
  return req.user.id as string;
}

export const create = asyncHandler(
  async (req: Request<unknown, unknown, CreateOrderInput>, res: Response) => {
    const order = await orderService.createOrder(requireUserId(req), req.body);
    sendResponse(res, 201, { data: order, message: 'Order placed successfully' });
  },
);

export const myOrders = asyncHandler(
  async (req: Request<unknown, unknown, unknown, ListOrdersQuery>, res: Response) => {
    const { orders, pagination } = await orderService.getMyOrders(requireUserId(req), req.query);
    sendResponse(res, 200, { data: orders, pagination });
  },
);

export const getById = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const order = await orderService.getOrderById(requireUserId(req), req.params.id);
  sendResponse(res, 200, { data: order });
});

export const cancel = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const reason = typeof (req.body as { reason?: string })?.reason === 'string' ? (req.body as { reason?: string }).reason : undefined;
  const order = await orderService.cancelOrder(requireUserId(req), req.params.id, reason);
  sendResponse(res, 200, { data: order, message: 'Order cancelled successfully' });
});

export const requestRefund = asyncHandler(
  async (req: Request<{ id: string }, unknown, RequestRefundInput>, res: Response) => {
    const order = await orderService.requestRefund(
      requireUserId(req),
      req.params.id,
      req.body.reason,
      req.body.comments,
    );
    // Record the customer's request in the activity log (best-effort).
    try {
      if (req.user) {
        await logActivity({
          actor: req.user,
          module: 'order',
          action: 'refund',
          targetId: req.params.id,
          targetLabel: `#${req.params.id.slice(-8).toUpperCase()}`,
          payload: { reason: req.body.reason, comments: req.body.comments },
        });
      }
    } catch {
      // never fail the request because of logging
    }
    sendResponse(res, 200, { data: order, message: 'Refund request submitted' });
  },
);

export const returnOrder = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const order = await orderService.returnOrder(requireUserId(req), req.params.id);
  sendResponse(res, 200, { data: order, message: 'Return request accepted' });
});

export const invoice = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const invoiceData = await orderService.getInvoice(requireUserId(req), req.params.id);
  sendResponse(res, 200, { data: invoiceData });
});

export const track = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const timeline = await orderService.getTrackingTimeline(requireUserId(req), req.params.id);
  sendResponse(res, 200, { data: timeline });
});

// ---- Admin ----

export const listAllOrders = asyncHandler(
  async (req: Request<unknown, unknown, unknown, ListOrdersQuery>, res: Response) => {
    const { orders, pagination } = await orderService.listOrdersAdmin(req.query);
    sendResponse(res, 200, { data: orders, pagination });
  },
);

export const updateStatus = asyncHandler(
  async (req: Request<{ id: string }, unknown, UpdateOrderStatusInput>, res: Response) => {
    await gate(
      req,
      res,
      {
        module: 'order',
        action: 'status',
        targetId: req.params.id,
        targetLabel: `#${req.params.id.slice(-8).toUpperCase()}`,
        payload: { status: req.body.status, note: req.body.note },
        appliedMessage: 'Order status updated',
      },
      () => orderService.updateOrderStatusAdmin(req.params.id, req.body.status, req.body.note, req.user?.name),
    );
  },
);

export const listRefunds = asyncHandler(async (_req: Request, res: Response) => {
  const orders = await orderService.listRefundOrders();
  sendResponse(res, 200, { data: orders });
});

export const processRefund = asyncHandler(
  async (req: Request<{ id: string }, unknown, ProcessRefundInput>, res: Response) => {
    await gate(
      req,
      res,
      {
        module: 'order',
        action: 'refund',
        targetId: req.params.id,
        targetLabel: `#${req.params.id.slice(-8).toUpperCase()}`,
        payload: { refundMethod: req.body.method, refundStatus: 'processed' },
        appliedMessage: 'Refund processed',
      },
      () => orderService.processRefund(req.params.id, req.body.method, req.user!),
    );
  },
);
