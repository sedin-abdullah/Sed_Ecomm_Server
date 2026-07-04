import { Document, Model, Schema, Types, model } from 'mongoose';

export interface ICategory extends Document {
  name: string;
  slug: string;
  parent?: Types.ObjectId;
  image?: string;
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

const categorySchema = new Schema<ICategory>(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      unique: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      index: true,
    },
    parent: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    image: {
      type: String,
    },
  },
  { timestamps: true, toJSON: { virtuals: true } },
);

categorySchema.pre('validate', async function preValidate(next) {
  if (!this.name || (this.slug && !this.isModified('name'))) {
    next();
    return;
  }

  const base = slugify(this.name);
  let candidate = base;
  let suffix = 1;

  const CategoryModel = this.constructor as Model<ICategory>;
  // eslint-disable-next-line no-await-in-loop
  while (await CategoryModel.exists({ slug: candidate, _id: { $ne: this._id } })) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }

  this.slug = candidate;
  next();
});

export const Category: Model<ICategory> = model<ICategory>('Category', categorySchema);

export default Category;
