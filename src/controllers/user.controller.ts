import { Request, Response } from 'express';
import * as userService from '../services/user.service';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendResponse } from '../utils/sendResponse';
import { CreateAddressInput, UpdateAddressInput, UpdateMeInput } from '../validators/user.validator';

function requireUserId(req: Pick<Request, 'user'>): string {
  if (!req.user) throw new AppError('Authentication required', 401);
  return req.user.id as string;
}

export const me = asyncHandler(async (req: Request, res: Response) => {
  sendResponse(res, 200, { data: { user: req.user } });
});

export const updateMe = asyncHandler(
  async (req: Request<unknown, unknown, UpdateMeInput>, res: Response) => {
    const user = await userService.updateMe(requireUserId(req), req.body);
    sendResponse(res, 200, { data: { user }, message: 'Profile updated successfully' });
  },
);

export const listAddresses = asyncHandler(async (req: Request, res: Response) => {
  const addresses = await userService.listAddresses(requireUserId(req));
  sendResponse(res, 200, { data: addresses });
});

export const createAddress = asyncHandler(
  async (req: Request<unknown, unknown, CreateAddressInput>, res: Response) => {
    const address = await userService.createAddress(requireUserId(req), req.body);
    sendResponse(res, 201, { data: address, message: 'Address added successfully' });
  },
);

export const updateAddress = asyncHandler(
  async (req: Request<{ id: string }, unknown, UpdateAddressInput>, res: Response) => {
    const address = await userService.updateAddress(requireUserId(req), req.params.id, req.body);
    sendResponse(res, 200, { data: address, message: 'Address updated successfully' });
  },
);

export const deleteAddress = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  await userService.deleteAddress(requireUserId(req), req.params.id);
  sendResponse(res, 200, { message: 'Address deleted successfully' });
});
