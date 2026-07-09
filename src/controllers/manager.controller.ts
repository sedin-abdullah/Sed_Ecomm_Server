import { Request, Response } from 'express';
import * as managerService from '../services/manager.service';
import * as approvalService from '../services/approval.service';
import { asyncHandler } from '../utils/asyncHandler';
import { sendResponse } from '../utils/sendResponse';

// ---- Store Owner accounts (role 'admin') — manager+ ----

export const createStoreOwner = asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body as { name?: string };
  const owner = await managerService.createStaff('admin', name);
  sendResponse(res, 201, { data: owner, message: 'Store Owner account created' });
});

export const listStoreOwners = asyncHandler(async (_req: Request, res: Response) => {
  const owners = await managerService.listStaff('admin');
  sendResponse(res, 200, { data: owners });
});

export const setStoreOwnerStatus = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const { isActive } = req.body as { isActive: boolean };
  const owner = await managerService.setStaffStatus('admin', req.params.id, isActive);
  sendResponse(res, 200, { data: owner, message: isActive ? 'Store Owner enabled' : 'Store Owner disabled' });
});

// ---- Manager accounts (role 'manager') — superadmin only ----

export const createManager = asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body as { name?: string };
  const mgr = await managerService.createStaff('manager', name);
  sendResponse(res, 201, { data: mgr, message: 'Manager account created' });
});

export const listManagers = asyncHandler(async (_req: Request, res: Response) => {
  const managers = await managerService.listStaff('manager');
  sendResponse(res, 200, { data: managers });
});

export const setManagerStatus = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const { isActive } = req.body as { isActive: boolean };
  const mgr = await managerService.setStaffStatus('manager', req.params.id, isActive);
  sendResponse(res, 200, { data: mgr, message: isActive ? 'Manager enabled' : 'Manager disabled' });
});

// ---- Activity log (fraud monitoring) — superadmin only ----

export const listActivity = asyncHandler(async (req: Request, res: Response) => {
  const role = typeof req.query.role === 'string' ? req.query.role : undefined;
  const items = await approvalService.listActivity(role);
  sendResponse(res, 200, { data: items });
});
