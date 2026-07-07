import { Request, Response } from 'express';
import { logActivity, snapshotBefore } from '../services/approval.service';
import { sendResponse } from './sendResponse';
import { ChangeAction, ChangeModule } from '../models/ChangeRequest';

interface GateMeta {
  module: ChangeModule;
  action: ChangeAction;
  targetId?: string;
  targetLabel?: string;
  payload?: unknown;
  appliedStatus?: number;
  appliedMessage: string;
}

/**
 * Monitor-only model: the action is applied IMMEDIATELY (so customers see it
 * right away), then recorded in the activity log so a Manager can review who
 * did what — for fraud detection — after the fact. Applies to admins and
 * managers alike (both are logged; managers can filter to admins).
 */
export async function gate(
  req: Pick<Request, 'user'>,
  res: Response,
  meta: GateMeta,
  applyNow: () => Promise<unknown>,
): Promise<void> {
  // Snapshot the prior state BEFORE applying so the log has an old→new diff.
  const before = meta.action === 'create' ? undefined : await snapshotBefore(meta.module, meta.targetId);

  const result = await applyNow();

  // Best-effort logging — a logging failure must never break the operation.
  try {
    if (req.user) {
      await logActivity({
        actor: req.user,
        module: meta.module,
        action: meta.action,
        targetId: meta.targetId,
        targetLabel: meta.targetLabel,
        payload: meta.payload,
        before,
        result,
      });
    }
  } catch {
    // swallow — the change already applied successfully
  }

  sendResponse(res, meta.appliedStatus ?? 200, { data: result, message: meta.appliedMessage });
}
