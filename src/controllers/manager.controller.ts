import { Request, Response } from 'express';
import * as managerService from '../services/manager.service';
import * as approvalService from '../services/approval.service';
import { ChangeStatus } from '../models/ChangeRequest';
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

// ---- Approval workflow (change requests / audit trail) ----

export const listChangeRequests = asyncHandler(async (req: Request, res: Response) => {
  const status = req.query.status as ChangeStatus | undefined;
  const items = await approvalService.listChangeRequests(status);
  sendResponse(res, 200, { data: items });
});

export const approveChange = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const cr = await approvalService.approveChangeRequest(req.params.id, req.user!);
  sendResponse(res, 200, { data: cr, message: 'Change approved and applied' });
});

export const rejectChange = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const { note } = req.body as { note?: string };
  const cr = await approvalService.rejectChangeRequest(req.params.id, req.user!, note);
  sendResponse(res, 200, { data: cr, message: 'Change rejected' });
});
