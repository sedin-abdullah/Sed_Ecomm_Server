import { Cart, ICart } from '../models/Cart';
import { Coupon, ICoupon } from '../models/Coupon';
import { IProduct, Product } from '../models/Product';
import { AppError } from '../utils/AppError';
import { AddCartItemInput, UpdateCartItemInput } from '../validators/cart.validator';

export interface CartTotals {
  subtotal: number;
  discount: number;
  shippingFee: number;
  tax: number;
  total: number;
  couponCode?: string;
}

const CART_ITEM_POPULATE = 'name slug images price discountPrice stock rating numReviews';

// Kept in sync with order.service.ts so the cart's estimated totals match what
// the customer is actually charged at checkout.
const FREE_SHIPPING_THRESHOLD = 50;
const FLAT_SHIPPING_FEE = 5.99;
const TAX_RATE = 0.08;

async function getOrCreateCart(userId: string): Promise<ICart> {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = await Cart.create({ user: userId, items: [] });
  }
  return cart;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Total quantity of the currently-active (not saved-for-later) cart items. */
function activeItemCount(cart: ICart): number {
  return cart.items.filter((item) => !item.savedForLater).reduce((sum, item) => sum + item.qty, 0);
}

/** Discount always applies to the whole cart value (value-based coupons). */
function computeDiscount(coupon: ICoupon, subtotal: number): number {
  let discount = coupon.type === 'flat' ? coupon.value : (subtotal * coupon.value) / 100;
  if (coupon.maxDiscount !== undefined) discount = Math.min(discount, coupon.maxDiscount);
  return round2(Math.min(discount, subtotal));
}

/** Validates a coupon is currently usable; throws AppError describing why not. */
export function assertCouponUsable(
  coupon: ICoupon | null,
  subtotal: number,
  itemCount: number,
): asserts coupon is ICoupon {
  if (!coupon) {
    throw new AppError('Invalid coupon code', 404);
  }
  if (!coupon.isActive) {
    throw new AppError('This coupon is no longer active', 400);
  }
  if (coupon.expiresAt.getTime() < Date.now()) {
    throw new AppError('This coupon has expired', 400);
  }
  if (coupon.usedCount >= coupon.usageLimit) {
    throw new AppError('This coupon has reached its usage limit', 400);
  }
  if (subtotal < coupon.minOrderValue) {
    throw new AppError(`A minimum order value of ${coupon.minOrderValue} is required for this coupon`, 400);
  }
  if ((coupon.minItems ?? 0) > 0 && itemCount < coupon.minItems) {
    throw new AppError(`This coupon requires at least ${coupon.minItems} items in your cart`, 400);
  }
}

async function computeTotals(cart: ICart): Promise<CartTotals> {
  const activeItems = cart.items.filter((item) => !item.savedForLater);
  const subtotal = round2(
    activeItems.reduce((sum, item) => {
      const product = item.product as unknown as IProduct;
      const price = product?.discountPrice ?? product?.price ?? 0;
      return sum + price * item.qty;
    }, 0),
  );

  let discount = 0;
  let couponCode: string | undefined;

  if (cart.couponCode) {
    const coupon = await Coupon.findOne({ code: cart.couponCode });
    try {
      assertCouponUsable(coupon, subtotal, activeItemCount(cart));
      discount = computeDiscount(coupon as ICoupon, subtotal);
      couponCode = cart.couponCode;
    } catch {
      // Coupon is no longer valid (expired/deactivated/subtotal dropped below minimum) — silently drop it.
      cart.couponCode = undefined;
      await cart.save();
    }
  }

  const discountedSubtotal = Math.max(0, subtotal - discount);
  const shippingFee = activeItems.length === 0 || discountedSubtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_FEE;
  const tax = round2(discountedSubtotal * TAX_RATE);
  const total = round2(discountedSubtotal + shippingFee + tax);

  return { subtotal, discount, shippingFee, tax, total, couponCode };
}

async function populateCart(cart: ICart): Promise<ICart> {
  return cart.populate('items.product', CART_ITEM_POPULATE);
}

export async function getCart(userId: string): Promise<{ cart: ICart; totals: CartTotals }> {
  const cart = await populateCart(await getOrCreateCart(userId));
  const totals = await computeTotals(cart);
  return { cart, totals };
}

export async function addItem(userId: string, input: AddCartItemInput) {
  const product = await Product.findById(input.productId);
  if (!product) {
    throw new AppError('Product not found', 404);
  }
  if (product.stock < input.qty) {
    throw new AppError('Insufficient stock for this product', 400);
  }

  const cart = await getOrCreateCart(userId);
  const existing = cart.items.find(
    (item) =>
      String(item.product) === input.productId &&
      !item.savedForLater &&
      item.variant?.size === input.variant?.size &&
      item.variant?.color === input.variant?.color,
  );

  if (existing) {
    existing.qty += input.qty;
  } else {
    cart.items.push({
      product: product._id,
      variant: input.variant,
      qty: input.qty,
      savedForLater: false,
    });
  }

  await cart.save();
  return getCart(userId);
}

export async function updateItem(userId: string, itemId: string, input: UpdateCartItemInput) {
  const cart = await getOrCreateCart(userId);
  const item = cart.items.id(itemId);
  if (!item) {
    throw new AppError('Cart item not found', 404);
  }

  const product = await Product.findById(item.product);
  if (product && product.stock < input.qty) {
    throw new AppError('Insufficient stock for this product', 400);
  }

  item.qty = input.qty;
  await cart.save();
  return getCart(userId);
}

export async function removeItem(userId: string, itemId: string) {
  const cart = await getOrCreateCart(userId);
  const item = cart.items.id(itemId);
  if (!item) {
    throw new AppError('Cart item not found', 404);
  }
  cart.items.pull({ _id: itemId });
  await cart.save();
  return getCart(userId);
}

export async function toggleSaveForLater(userId: string, itemId: string) {
  const cart = await getOrCreateCart(userId);
  const item = cart.items.id(itemId);
  if (!item) {
    throw new AppError('Cart item not found', 404);
  }
  item.savedForLater = !item.savedForLater;
  await cart.save();
  return getCart(userId);
}

export async function applyCoupon(userId: string, code: string) {
  const cart = await getOrCreateCart(userId);
  const populated = await populateCart(cart);
  const { subtotal } = await computeTotals(populated);

  const coupon = await Coupon.findOne({ code: code.trim().toUpperCase() });
  assertCouponUsable(coupon, subtotal, activeItemCount(populated));

  cart.couponCode = coupon.code;
  await cart.save();
  return getCart(userId);
}

export async function removeCoupon(userId: string) {
  const cart = await getOrCreateCart(userId);
  cart.couponCode = undefined;
  await cart.save();
  return getCart(userId);
}
