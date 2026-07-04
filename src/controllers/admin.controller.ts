import { Request, Response } from 'express';
import * as adminService from '../services/admin.service';
import { asyncHandler } from '../utils/asyncHandler';
import { sendResponse } from '../utils/sendResponse';
import { ListCustomersQuery, SetCustomerStatusInput } from '../validators/admin.validator';

export const dashboardSummary = asyncHandler(async (_req: Request, res: Response) => {
  const summary = await adminService.getDashboardSummary();
  sendResponse(res, 200, { data: summary });
});

export const bestSellers = asyncHandler(async (req: Request, res: Response) => {
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  const rows = await adminService.getBestSellers(limit);
  sendResponse(res, 200, { data: rows });
});

export const listCustomers = asyncHandler(
  async (req: Request<unknown, unknown, unknown, ListCustomersQuery>, res: Response) => {
    const { customers, pagination } = await adminService.listCustomers(req.query);
    sendResponse(res, 200, { data: customers, pagination });
  },
);

export const getCustomer = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const customer = await adminService.getCustomer(req.params.id);
  sendResponse(res, 200, { data: customer });
});

export const setCustomerStatus = asyncHandler(
  async (req: Request<{ id: string }, unknown, SetCustomerStatusInput>, res: Response) => {
    const customer = await adminService.setCustomerStatus(req.params.id, req.body.isActive);
    sendResponse(res, 200, {
      data: customer,
      message: customer.isActive ? 'Customer enabled' : 'Customer disabled',
    });
  },
);
