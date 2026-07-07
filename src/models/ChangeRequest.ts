import { Document, Model, Schema, Types, model } from 'mongoose';

export type ChangeModule = 'product' | 'category' | 'coupon' | 'order';
export type ChangeAction = 'create' | 'update' | 'delete' | 'status';
export type ChangeStatus = 'pending' | 'approved' | 'rejected';

export interface IChangeRequest extends Document {
  actor: Types.ObjectId; // the admin who requested it
  actorName: string; // snapshot for the audit trail
  module: ChangeModule;
  action: ChangeAction;
  targetId?: string; // affected entity id (update/delete/status)
  targetLabel?: string; // human label, e.g. product name
  payload?: unknown; // resolved input to apply on approval (create/update/status)
  before?: unknown; // snapshot of the entity before the change (audit)
  status: ChangeStatus;
  reviewer?: Types.ObjectId; // manager who approved/rejected
  reviewerName?: string;
  reviewedAt?: Date;
  note?: string; // optional rejection reason
  createdAt: Date;
  updatedAt: Date;
}

const changeRequestSchema = new Schema<IChangeRequest>(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorName: { type: String, required: true },
    module: { type: String, enum: ['product', 'category', 'coupon', 'order'], required: true },
    action: { type: String, enum: ['create', 'update', 'delete', 'status'], required: true },
    targetId: { type: String },
    targetLabel: { type: String },
    payload: { type: Schema.Types.Mixed },
    before: { type: Schema.Types.Mixed },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
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
