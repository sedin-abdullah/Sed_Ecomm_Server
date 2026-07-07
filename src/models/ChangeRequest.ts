import { Document, Model, Schema, Types, model } from 'mongoose';

export type ChangeModule = 'product' | 'category' | 'coupon' | 'order';
export type ChangeAction = 'create' | 'update' | 'delete' | 'status';
// 'applied' = monitor-only activity (took effect immediately). pending/approved/
// rejected retained for any historical records from the earlier blocking model.
export type ChangeStatus = 'applied' | 'pending' | 'approved' | 'rejected';

export interface FieldChange {
  field: string;
  from?: unknown;
  to?: unknown;
}

export interface IChangeRequest extends Document {
  actor: Types.ObjectId; // the admin/manager who performed the action
  actorName: string; // snapshot for the audit trail
  actorRole?: string; // 'admin' | 'manager' — so fraud review can filter to admins
  module: ChangeModule;
  action: ChangeAction;
  targetId?: string; // affected entity id
  targetLabel?: string; // human label, e.g. coupon code / product name
  summary?: string; // one-line human-readable description of what happened
  changes?: FieldChange[]; // field-level before→after for readability
  payload?: unknown; // the submitted input
  before?: unknown; // snapshot of the entity before the change
  status: ChangeStatus;
  reviewer?: Types.ObjectId;
  reviewerName?: string;
  reviewedAt?: Date;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const changeRequestSchema = new Schema<IChangeRequest>(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorName: { type: String, required: true },
    actorRole: { type: String },
    module: { type: String, enum: ['product', 'category', 'coupon', 'order'], required: true },
    action: { type: String, enum: ['create', 'update', 'delete', 'status'], required: true },
    targetId: { type: String },
    targetLabel: { type: String },
    summary: { type: String },
    changes: { type: [Schema.Types.Mixed], default: [] },
    payload: { type: Schema.Types.Mixed },
    before: { type: Schema.Types.Mixed },
    status: { type: String, enum: ['applied', 'pending', 'approved', 'rejected'], default: 'applied', index: true },
    reviewer: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewerName: { type: String },
    reviewedAt: { type: Date },
    note: { type: String },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  },
);

export const ChangeRequest: Model<IChangeRequest> =
  model<IChangeRequest>('ChangeRequest', changeRequestSchema);
