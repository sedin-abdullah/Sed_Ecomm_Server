import { Document, Model, Schema, Types, model } from 'mongoose';

export type PaymentMethod = 'card_credit' | 'card_debit' | 'upi' | 'netbanking' | 'wallet' | 'cod';
export type PaymentStatusType = 'pending' | 'success' | 'failed';

export interface IPayment extends Document {
  order: Types.ObjectId;
  user: Types.ObjectId;
  method: PaymentMethod;
  status: PaymentStatusType;
  amount: number;
  cardLast4?: string;
  cardBrand?: string;
  upiVpa?: string;
  bankCode?: string;
  walletProvider?: string;
  requiresOtp: boolean;
  otpAttempts: number;
  forcedFailure: boolean;
  transactionRef: string;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    order: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    method: {
      type: String,
      enum: ['card_credit', 'card_debit', 'upi', 'netbanking', 'wallet', 'cod'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed'],
      default: 'pending',
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    cardLast4: {
      type: String,
      maxlength: 4,
    },
    cardBrand: {
      type: String,
    },
    upiVpa: {
      type: String,
    },
    bankCode: {
      type: String,
    },
    walletProvider: {
      type: String,
    },
    requiresOtp: {
      type: Boolean,
      default: false,
    },
    otpAttempts: {
      type: Number,
      default: 0,
    },
    forcedFailure: {
      type: Boolean,
      default: false,
    },
    transactionRef: {
      type: String,
      required: true,
      unique: true,
    },
  },
  { timestamps: true },
);

export const Payment: Model<IPayment> = model<IPayment>('Payment', paymentSchema);

export default Payment;
