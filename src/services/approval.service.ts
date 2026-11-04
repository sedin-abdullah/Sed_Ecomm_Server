import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';
import type { ChangeAction, ChangeModule, ChangeStatus } from '../generated/prisma/client';
import { toApi } from '../utils/serialize';
import { isUuid } from '../utils/uuid';

/** A single old→new field diff in an activity-log entry (ported from the Mongoose model). */
interface FieldChange {
  field: string;
  from?: unknown;
  to?: unknown;
}

/** Shapes a change-request row: `_id`, and `actor`/`reviewer` ids (old doc used `actor`/`reviewer` ObjectIds). */
function serializeChangeRequest(row: Record<string, unknown>): Record<string, unknown> {
  const api = toApi(row) as Record<string, unknown>;
  const { actorId, reviewerId, ...rest } = api;
  return { ...rest, actor: actorId, reviewer: reviewerId ?? undefined };
}

// Fields that are noise in an activity diff.
const IGNORED_FIELDS = new Set(['_id', '__v', 'createdAt', 'updatedAt', 'id', 'images', 'password']);

/** Snapshot the current entity BEFORE a change so the log has an old→new view. */
export async function snapshotBefore(module: ChangeModule, targetId?: string): Promise<Record<string, unknown> | undefined> {
  if (!targetId || !isUuid(targetId)) return undefined;
  const doc =
    module === 'product' ? await prisma.product.findUnique({ where: { id: targetId } }) :
    module === 'category' ? await prisma.category.findUnique({ where: { id: targetId } }) :
    module === 'coupon' ? await prisma.coupon.findUnique({ where: { id: targetId } }) :
    module === 'order' ? await prisma.order.findUnique({ where: { id: targetId } }) :
    null;
  // toApi normalises Decimal → number so the before/after diff compares cleanly.
  return doc ? (toApi(doc) as Record<string, unknown>) : undefined;
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

/**
 * Minimal shape of the acting user. Accepts both the new Prisma `PublicUser`
 * (has `_id`/`id`) and, during the migration, the old Mongoose `IUser`.
 */
interface LogActor {
  _id?: unknown;
  id?: string;
  name: string;
  role: string;
}

interface LogParams {
  actor: LogActor;
  module: ChangeModule;
  action: ChangeAction;
  targetId?: string;
  targetLabel?: string;
  payload?: unknown;
  before?: unknown;
  result?: unknown; // the applied entity (used to backfill id/label on create)
}

/** Records an admin/manager action that has already been applied (monitor-only). */
export async function logActivity(params: LogParams): Promise<void> {
  const changes = params.action === 'create' || params.action === 'delete' ? [] : computeChanges(params.before, params.payload);
  const resultObj = (params.result ?? {}) as Record<string, unknown>;
  const label = params.targetLabel || (resultObj.name as string) || (resultObj.code as string) || '';
  const actorId = String(params.actor._id ?? params.actor.id ?? '');
  const targetId =
    params.targetId ||
    (resultObj._id ? String(resultObj._id) : resultObj.id ? String(resultObj.id) : undefined);

  await prisma.changeRequest.create({
    data: {
      actorId,
      actorName: params.actor.name,
      actorRole: params.actor.role,
      module: params.module,
      action: params.action,
      targetId,
      targetLabel: label,
      summary: summarize(params.module, params.action, label, changes, params.payload),
      changes: changes as unknown as Prisma.InputJsonValue,
      payload: params.payload === undefined ? undefined : (params.payload as Prisma.InputJsonValue),
      before: params.before === undefined ? undefined : (params.before as Prisma.InputJsonValue),
      status: 'applied',
    },
  });
}

export async function listActivity(actorRole?: string, limit = 300) {
  const rows = await prisma.changeRequest.findMany({
    where: actorRole ? { actorRole } : {},
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map(serializeChangeRequest);
}

/** Backwards-compat alias used by the manager controller. */
export async function listChangeRequests(status?: ChangeStatus, limit = 300) {
  const rows = await prisma.changeRequest.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map(serializeChangeRequest);
}
