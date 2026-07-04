import { Document, Model, Schema, Types, model } from 'mongoose';

export interface IEmailLog extends Document {
  order?: Types.ObjectId;
  to: string;
  subject: string;
  body: string;
  createdAt: Date;
}

const emailLogSchema = new Schema<IEmailLog>(
  {
    order: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
    },
    to: {
      type: String,
      required: true,
    },
    subject: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const EmailLog: Model<IEmailLog> = model<IEmailLog>('EmailLog', emailLogSchema);

export default EmailLog;
