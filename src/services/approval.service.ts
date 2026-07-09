import { ChangeRequest, ChangeAction, ChangeModule, ChangeStatus, FieldChange, IChangeRequest } from '../models/ChangeRequest';
import { Product } from '../models/Product';
import { Category } from '../models/Category';
import { Coupon } from '../models/Coupon';
import { Order } from '../models/Order';
import { IUser } from '../models/User';

// Fields that are noise in an activity diff.
const IGNORED_FIELDS = new Set(['_id', '__v', 'createdAt', 'updatedAt', 'id', 'images', 'password']);

/** Snapshot the current entity BEFORE a change so the log has an old→new view. */
export async function snapshotBefore(module: ChangeModule, targetId?: string): Promise<Record<string, unknown> | undefined> {
  if (!targetId) return undefined;
  const doc =
    module === 'product' ? await Product.findById(targetId) :
    module === 'category' ? await Category.findById(targetId) :
    module === 'coupon' ? await Coupon.findById(targetId) :
    module === 'order' ? await Order.findById(targetId) :
    null;
  return doc ? (doc.toObject() as unknown as Record<string, unknown>) : undefined;
}

/** Field-level before→after diff of the submitted payload vs the prior state. */
function computeChanges(before: unknown, payload: unknown): FieldChange[] {
  if (!payload || typeof payload !== 'object') return [];
  const b = (before ?? {}) as Record<string, unknown>;
  const changes: FieldChange[] = [];
  for (const [field, to] of Object.entries(payload as Record<string, unknown>)) {
    if (IGNORED_FIELDS.has(field)) continue;
    const from = b[field];
    if (JSON.stringify(from) !== JSON.stringify(to)) changes.push({ field, from, to });
  }
  return changes;
}

/** One-line, human-readable description of what the actor did. */
function summarize(
  module: ChangeModule,
  action: ChangeAction,
  label: string,
  changes: FieldChange[],
  payload?: unknown,
): string {
  const name = label || module;
  if (action === 'create') return `Created ${module} “${name}”`;
  if (action === 'delete') return `Deleted ${module} “${name}”`;
  if (action === 'refund') {
    const p = (payload ?? {}) as { refundMethod?: string; reason?: string };
    return p.refundMethod
      ? `Processed refund (${p.refundMethod}) for order ${name}`
      : `Requested refund for order ${name}${p.reason ? ` — ${p.reason}` : ''}`;
  }
  if (action === 'status') {
    const s = changes.find((c) => c.field === 'status');
    return `Changed ${module} ${name} status to “${String(s?.to ?? '')}”`;
  }
  // Highlight the common "enable/disable discount" case explicitly.
  const active = changes.find((c) => c.field === 'isActive');
  if (active) return `${active.to ? 'Enabled' : 'Disabled'} ${module} “${name}”`;
  const fields = changes.map((c) => c.field).join(', ');
  return `Updated ${module} “${name}”${fields ? ` — ${fields}` : ''}`;
}

interface LogParams {
  actor: IUser;
  module: ChangeModule;
  action: ChangeAction;
  targetId?: string;
  targetLabel?: string;
  payload?: unknown;
  before?: unknown;
  result?: unknown; // the applied entity (used to backfill id/label on create)
}

/** Records an admin/manager action that has already been applied (monitor-only). */
export async function logActivity(params: LogParams): Promise<IChangeRequest> {
  const changes = params.action === 'create' || params.action === 'delete' ? [] : computeChanges(params.before, params.payload);
  const resultObj = (params.result ?? {}) as Record<string, unknown>;
  const label = params.targetLabel || (resultObj.name as string) || (resultObj.code as string) || '';
  const targetId = params.targetId || (resultObj._id ? String(resultObj._id) : undefined);

  return ChangeRequest.create({
    actor: params.actor._id,
    actorName: params.actor.name,
    actorRole: params.actor.role,
    module: params.module,
    action: params.action,
    targetId,
    targetLabel: label,
    summary: summarize(params.module, params.action, label, changes, params.payload),
    changes,
    payload: params.payload,
    before: params.before,
    status: 'applied',
  });
}

export async function listActivity(actorRole?: string, limit = 300): Promise<IChangeRequest[]> {
  const filter = actorRole ? { actorRole } : {};
  return ChangeRequest.find(filter).sort({ createdAt: -1 }).limit(limit);
}

/** Backwards-compat alias used by the manager controller. */
export const listChangeRequests = (status?: ChangeStatus, limit = 300) =>
  ChangeRequest.find(status ? { status } : {}).sort({ createdAt: -1 }).limit(limit);
