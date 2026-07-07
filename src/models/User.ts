import bcrypt from 'bcrypt';
import { Document, Model, Schema, Types, model } from 'mongoose';

export type UserRole = 'customer' | 'admin' | 'manager';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  phone?: string;
  avatar?: string;
  wishlist?: Types.ObjectId;
  addresses: Types.ObjectId[];
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  isEmailVerified: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const SALT_ROUNDS = 12;

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: ['customer', 'admin', 'manager'],
      default: 'customer',
    },
    phone: {
      type: String,
      trim: true,
    },
    avatar: {
      type: String,
    },
    wishlist: {
      type: Schema.Types.ObjectId,
      ref: 'Wishlist',
    },
    addresses: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Address',
      },
    ],
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true, toJSON: { virtuals: true } },
);

userSchema.pre('save', async function preSave(next) {
  if (!this.isModified('password')) {
    next();
    return;
  }

  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  next();
});

userSchema.methods.comparePassword = async function comparePassword(candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

export const User: Model<IUser> = model<IUser>('User', userSchema);

export default User;
