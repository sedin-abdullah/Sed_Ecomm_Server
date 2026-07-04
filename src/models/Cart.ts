import { Document, Model, Schema, Types, model } from 'mongoose';

export interface ICartItem {
  product: Types.ObjectId;
  variant?: {
    size?: string;
    color?: string;
  };
  qty: number;
  savedForLater: boolean;
}

export interface ICart extends Document {
  user: Types.ObjectId;
  items: Types.DocumentArray<ICartItem>;
  couponCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

const cartItemSchema = new Schema<ICartItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variant: {
      size: { type: String },
      color: { type: String },
    },
    qty: { type: Number, required: true, min: 1, default: 1 },
    savedForLater: { type: Boolean, default: false },
  },
  { _id: true },
);

const cartSchema = new Schema<ICart>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
    },
    couponCode: {
      type: String,
      trim: true,
      uppercase: true,
    },
  },
  { timestamps: true },
);

export const Cart: Model<ICart> = model<ICart>('Cart', cartSchema);

export default Cart;
