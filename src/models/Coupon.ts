import { Document, Model, Schema, Types, model } from 'mongoose';

export type CouponType = 'percentage' | 'flat';

export interface ICoupon extends Document {
  code: string;
  type: CouponType;
  value: number;
  minOrderValue: number;
  maxDiscount?: number;
  expiresAt: Date;
  usageLimit: number;
  usedCount: number;
  isActive: boolean;
  // Empty = applies to the whole cart. Otherwise the discount only applies to
  // these products (and the coupon is invalid if none are in the cart).
  applicableProducts: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const couponSchema = new Schema<ICoupon>(
  {
    code: {
      type: String,
      required: [true, 'Coupon code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['percentage', 'flat'],
      required: true,
    },
    value: {
      type: Number,
      required: true,
      min: 0,
    },
    minOrderValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxDiscount: {
      type: Number,
      min: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    usageLimit: {
      type: Number,
      default: 1,
      min: 0,
    },
    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    applicableProducts: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
      default: [],
    },
  },
  { timestamps: true, toJSON: { virtuals: true } },
);

export const Coupon: Model<ICoupon> = model<ICoupon>('Coupon', couponSchema);

export default Coupon;
