import { Request, Response } from 'express';
import { enqueue } from '../services/approval.service';
import { sendResponse } from './sendResponse';
import { ChangeAction, ChangeModule } from '../models/ChangeRequest';

interface GateMeta {
  module: ChangeModule;
  action: ChangeAction;
  targetId?: string;
  targetLabel?: string;
  payload?: unknown;
  appliedStatus?: number; // HTTP status when a manager applies directly
  appliedMessage: string; // success message when applied directly
}

/**
 * Approval gate. A **manager** is the authority, so their action applies
 * immediately (`applyNow`). An **admin's** action is enqueued as a pending
 * ChangeRequest and nothing goes live until the manager approves it.
 */
export async function gate(
  req: Pick<Request, 'user'>,
  res: Response,
  meta: GateMeta,
  applyNow: () => Promise<unknown>,
): Promise<void> {
  if (req.user?.role === 'manager') {
    const result = await applyNow();
    sendResponse(res, meta.appliedStatus ?? 200, { data: result, message: meta.appliedMessage });
    return;
  }
  const cr = await enqueue({
    actor: req.user!,
    module: meta.module,
    action: meta.action,
    targetId: meta.targetId,
    targetLabel: meta.targetLabel,
    payload: meta.payload,
  });
  sendResponse(res, 202, { data: cr, message: 'Submitted for manager approval — pending review.' });
}
