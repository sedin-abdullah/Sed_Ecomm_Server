import { Document, Model, Schema, Types, model } from 'mongoose';
import { env } from '../config/env';

export interface IProductVariants {
  sizes: string[];
  colors: string[];
}

export interface ClientProductImage {
  id: string;
  url: string;
}

/**
 * The client expects images as `{id, url}` objects; they're stored as plain
 * URL strings. Locally-uploaded images are stored as a server-relative path
 * (e.g. `/uploads/products/x.png`) — those need the server's own origin
 * prefixed, or the browser resolves them against the client's origin
 * instead. Seeded/external image URLs are already absolute and pass through.
 */
export function toClientImages(images: string[]): ClientProductImage[] {
  return images.map((url, index) => ({
    id: String(index),
    url: url.startsWith('/') ? `${env.PUBLIC_URL}${url}` : url,
  }));
}

export interface IProduct extends Document {
  name: string;
  slug: string;
  description: string;
  category: Types.ObjectId;
  brand?: string;
  price: number;
  discountPrice?: number;
  images: string[];
  variants: IProductVariants;
  stock: number;
  rating: number;
  numReviews: number;
  tags: string[];
  isFeatured: boolean;
  isFlashSale: boolean;
  flashSaleEndsAt?: Date;
  isNewArrival: boolean;
  isBestSeller: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

const productSchema = new Schema<IProduct>(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      index: true,
    },
    description: {
      type: String,
      required: [true, 'Product description is required'],
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Product category is required'],
    },
    brand: {
      type: String,
      trim: true,
    },
    price: {
      type: Number,
      required: [true, 'Product price is required'],
      min: [0, 'Price cannot be negative'],
    },
    discountPrice: {
      type: Number,
      min: [0, 'Discount price cannot be negative'],
    },
    images: {
      type: [String],
      default: [],
    },
    variants: {
      sizes: { type: [String], default: [] },
      colors: { type: [String], default: [] },
    },
    stock: {
      type: Number,
      required: [true, 'Product stock is required'],
      min: [0, 'Stock cannot be negative'],
      default: 0,
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    numReviews: {
      type: Number,
      default: 0,
      min: 0,
    },
    tags: {
      type: [String],
      default: [],
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    isFlashSale: {
      type: Boolean,
      default: false,
    },
    flashSaleEndsAt: {
      type: Date,
    },
    isNewArrival: {
      type: Boolean,
      default: false,
    },
    isBestSeller: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        ret.images = toClientImages((ret.images as string[]) ?? []);
        return ret;
      },
    },
  },
);

productSchema.pre('validate', async function preValidate(next) {
  if (!this.name || (this.slug && !this.isModified('name'))) {
    next();
    return;
  }

  const base = slugify(this.name);
  let candidate = base;
  let suffix = 1;

  const ProductModel = this.constructor as Model<IProduct>;
  // eslint-disable-next-line no-await-in-loop
  while (await ProductModel.exists({ slug: candidate, _id: { $ne: this._id } })) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }

  this.slug = candidate;
  next();
});

productSchema.index({ name: 'text', description: 'text', brand: 'text', tags: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ price: 1 });

export const Product: Model<IProduct> = model<IProduct>('Product', productSchema);

export default Product;
