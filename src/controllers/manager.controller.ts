import { Request, Response } from 'express';
import * as managerService from '../services/manager.service';
import * as approvalService from '../services/approval.service';
import { asyncHandler } from '../utils/asyncHandler';
import { sendResponse } from '../utils/sendResponse';

export const createAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body as { name?: string };
  const admin = await managerService.createAdmin(name);
  // `password` is returned in plaintext ONCE for the manager to copy/share.
  sendResponse(res, 201, { data: admin, message: 'Admin account created' });
});

export const listAdmins = asyncHandler(async (_req: Request, res: Response) => {
  const admins = await managerService.listAdmins();
  sendResponse(res, 200, { data: admins });
});

export const setAdminStatus = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const { isActive } = req.body as { isActive: boolean };
  const admin = await managerService.setAdminStatus(req.params.id, isActive);
  sendResponse(res, 200, { data: admin, message: isActive ? 'Admin enabled' : 'Admin disabled' });
});

// ---- Activity log (fraud monitoring) ----

export const listActivity = asyncHandler(async (req: Request, res: Response) => {
  // Optional ?role=admin to focus fraud review on admin actions only.
  const role = typeof req.query.role === 'string' ? req.query.role : undefined;
  const items = await approvalService.listActivity(role);
  sendResponse(res, 200, { data: items });
});
