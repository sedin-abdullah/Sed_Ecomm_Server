import { ChangeRequest, ChangeAction, ChangeModule, ChangeStatus, IChangeRequest } from '../models/ChangeRequest';
import { Product } from '../models/Product';
import { Category } from '../models/Category';
import { Coupon } from '../models/Coupon';
import { Order } from '../models/Order';
import { IUser } from '../models/User';
import { AppError } from '../utils/AppError';
import * as productService from './product.service';
import * as categoryService from './category.service';
import * as couponService from './coupon.service';
import * as orderService from './order.service';

interface EnqueueParams {
  actor: IUser;
  module: ChangeModule;
  action: ChangeAction;
  targetId?: string;
  targetLabel?: string;
  payload?: unknown;
}

/** Snapshot the current entity so the audit trail has an old→new comparison. */
async function loadBefore(module: ChangeModule, targetId?: string): Promise<unknown> {
  if (!targetId) return undefined;
  const doc =
    module === 'product' ? await Product.findById(targetId) :
    module === 'category' ? await Category.findById(targetId) :
    module === 'coupon' ? await Coupon.findById(targetId) :
    module === 'order' ? await Order.findById(targetId) :
    null;
  return doc ? doc.toObject() : undefined;
}

/** Create a pending change request for an admin action. */
export async function enqueue(params: EnqueueParams): Promise<IChangeRequest> {
  const before = params.action === 'create' ? undefined : await loadBefore(params.module, params.targetId);
  return ChangeRequest.create({
    actor: params.actor._id,
    actorName: params.actor.name,
    module: params.module,
    action: params.action,
    targetId: params.targetId,
    targetLabel: params.targetLabel,
    payload: params.payload,
    before,
    status: 'pending',
  });
}

export async function listChangeRequests(status?: ChangeStatus, limit = 200): Promise<IChangeRequest[]> {
  const filter = status ? { status } : {};
  return ChangeRequest.find(filter).sort({ createdAt: -1 }).limit(limit);
}

export async function countPending(): Promise<number> {
  return ChangeRequest.countDocuments({ status: 'pending' });
}

/** Executes the real DB operation captured by a change request. */
async function applyChangeRequest(cr: IChangeRequest): Promise<void> {
  const { module, action, targetId } = cr;
  const payload = cr.payload as never;

  if (module === 'product') {
    if (action === 'create') { await productService.createProduct(payload); return; }
    if (action === 'update' && targetId) { await productService.updateProduct(targetId, payload); return; }
    if (action === 'delete' && targetId) { await productService.deleteProduct(targetId); return; }
  } else if (module === 'category') {
    if (action === 'create') { await categoryService.createCategory(payload); return; }
    if (action === 'update' && targetId) { await categoryService.updateCategory(targetId, payload); return; }
    if (action === 'delete' && targetId) { await categoryService.deleteCategory(targetId); return; }
  } else if (module === 'coupon') {
    if (action === 'create') { await couponService.createCoupon(payload); return; }
    if (action === 'update' && targetId) { await couponService.updateCoupon(targetId, payload); return; }
    if (action === 'delete' && targetId) { await couponService.deleteCoupon(targetId); return; }
  } else if (module === 'order' && action === 'status' && targetId) {
    const p = cr.payload as { status: string; note?: string };
    await orderService.updateOrderStatusAdmin(targetId, p.status as never, p.note);
    return;
  }
  throw new AppError(`Cannot apply change request (${module}/${action})`, 400);
}

/** Approve → apply the change live, then mark approved. */
export async function approveChangeRequest(id: string, manager: IUser): Promise<IChangeRequest> {
  const cr = await ChangeRequest.findById(id);
  if (!cr) throw new AppError('Change request not found', 404);
  if (cr.status !== 'pending') throw new AppError('This request has already been reviewed', 409);

  await applyChangeRequest(cr);

  cr.status = 'approved';
  cr.reviewer = manager._id as never;
  cr.reviewerName = manager.name;
  cr.reviewedAt = new Date();
  await cr.save();
  return cr;
}

/** Reject → discard (nothing is applied). */
export async function rejectChangeRequest(id: string, manager: IUser, note?: string): Promise<IChangeRequest> {
  const cr = await ChangeRequest.findById(id);
  if (!cr) throw new AppError('Change request not found', 404);
  if (cr.status !== 'pending') throw new AppError('This request has already been reviewed', 409);

  cr.status = 'rejected';
  cr.reviewer = manager._id as never;
  cr.reviewerName = manager.name;
  cr.reviewedAt = new Date();
  if (note) cr.note = note;
  await cr.save();
  return cr;
}
