import { prisma } from '../config/prisma';
import { toUsableCoupon, UsableCoupon } from './coupon.service';
import { AppError } from '../utils/AppError';
import { serializeProductSummary } from '../utils/serializeProduct';
import { isUuid } from '../utils/uuid';
import { AddCartItemInput, UpdateCartItemInput } from '../validators/cart.validator';

export interface CartTotals {
  subtotal: number;
  discount: number;
  shippingFee: number;
  tax: number;
  total: number;
  couponCode?: string;
}

export interface CartItemView {
  _id: string;
  id: string;
  product: Record<string, unknown> | null;
  variant: { size?: string; color?: string };
  qty: number;
  savedForLater: boolean;
}

export interface CartView {
  _id: string;
  id: string;
  items: CartItemView[];
  couponCode?: string;
}

// Product fields needed to price the cart + render each line (was CART_ITEM_POPULATE).
const PRODUCT_SELECT = {
  select: {
    id: true, name: true, slug: true, images: true, price: true, discountPrice: true,
    stock: true, rating: true, numReviews: true, blockCheckout: true,
  },
} as const;

const CART_INCLUDE = { items: { include: { product: PRODUCT_SELECT } } };

// Kept in sync with order.service.ts so the cart's estimated totals match what
// the customer is actually charged at checkout.
const FREE_SHIPPING_THRESHOLD = 50;
const FLAT_SHIPPING_FEE = 5.99;
const TAX_RATE = 0.08;

interface CartItemRow {
  id: string;
  productId: string;
  size: string | null;
  color: string | null;
  qty: number;
  savedForLater: boolean;
  product: { price: unknown; discountPrice: unknown } & Record<string, unknown>;
}

interface CartRow {
  id: string;
  userId: string;
  couponCode: string | null;
  items: CartItemRow[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toNum(decimal: unknown): number {
  if (decimal === null || decimal === undefined) return 0;
  return typeof decimal === 'number' ? decimal : Number((decimal as { toString(): string }).toString());
}

/** Total quantity of the currently-active (not saved-for-later) cart items. */
function activeItemCount(cart: CartRow): number {
  return cart.items.filter((item) => !item.savedForLater).reduce((sum, item) => sum + item.qty, 0);
}

/** Discount always applies to the whole cart value (value-based coupons). */
function computeDiscount(coupon: UsableCoupon, subtotal: number): number {
  let discount = coupon.type === 'flat' ? coupon.value : (subtotal * coupon.value) / 100;
  if (coupon.maxDiscount !== undefined) discount = Math.min(discount, coupon.maxDiscount);
  return round2(Math.min(discount, subtotal));
}

/** Validates a coupon is currently usable; throws AppError describing why not. */
export function assertCouponUsable(
  coupon: UsableCoupon | null,
  subtotal: number,
  itemCount: number,
): asserts coupon is UsableCoupon {
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
  if (coupon.minItems > 0 && itemCount < coupon.minItems) {
    throw new AppError(`This coupon requires at least ${coupon.minItems} items in your cart`, 400);
  }
}

async function getCartRow(userId: string): Promise<CartRow> {
  const existing = await prisma.cart.findUnique({ where: { userId }, include: CART_INCLUDE });
  if (existing) return existing as unknown as CartRow;
  return (await prisma.cart.create({ data: { userId }, include: CART_INCLUDE })) as unknown as CartRow;
}

async function computeTotals(cart: CartRow): Promise<CartTotals> {
  const activeItems = cart.items.filter((item) => !item.savedForLater);
  const subtotal = round2(
    activeItems.reduce((sum, item) => {
      const price = toNum(item.product.discountPrice ?? item.product.price);
      return sum + price * item.qty;
    }, 0),
  );

  let discount = 0;
  let couponCode: string | undefined;

  if (cart.couponCode) {
    const row = await prisma.coupon.findFirst({ where: { code: cart.couponCode } });
    try {
      const coupon = row ? toUsableCoupon(row) : null;
      assertCouponUsable(coupon, subtotal, activeItemCount(cart));
      discount = computeDiscount(coupon, subtotal);
      couponCode = cart.couponCode;
    } catch {
      // Coupon no longer valid (expired/deactivated/subtotal dropped) — silently drop it.
      await prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
    }
  }

  const discountedSubtotal = Math.max(0, subtotal - discount);
  const shippingFee = activeItems.length === 0 || discountedSubtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_FEE;
  const tax = round2(discountedSubtotal * TAX_RATE);
  const total = round2(discountedSubtotal + shippingFee + tax);

  return { subtotal, discount, shippingFee, tax, total, couponCode };
}

function toCartView(cart: CartRow): CartView {
  return {
    _id: cart.id,
    id: cart.id,
    items: cart.items.map((item) => ({
      _id: item.id,
      id: item.id,
      product: serializeProductSummary(item.product),
      variant: { size: item.size ?? undefined, color: item.color ?? undefined },
      qty: item.qty,
      savedForLater: item.savedForLater,
    })),
    couponCode: cart.couponCode ?? undefined,
  };
}

export async function getCart(userId: string): Promise<{ cart: CartView; totals: CartTotals }> {
  const cart = await getCartRow(userId);
  const totals = await computeTotals(cart);
  return { cart: toCartView(cart), totals };
}

export async function addItem(userId: string, input: AddCartItemInput) {
  const product = await prisma.product.findUnique({ where: { id: input.productId }, select: { stock: true } });
  if (!product) {
    throw new AppError('Product not found', 404);
  }
  if (product.stock < input.qty) {
    throw new AppError('Insufficient stock for this product', 400);
  }

  const cart = await prisma.cart.upsert({ where: { userId }, create: { userId }, update: {}, select: { id: true } });
  const size = input.variant?.size ?? null;
  const color = input.variant?.color ?? null;

  const existing = await prisma.cartItem.findFirst({
    where: { cartId: cart.id, productId: input.productId, savedForLater: false, size, color },
  });

  if (existing) {
    await prisma.cartItem.update({ where: { id: existing.id }, data: { qty: existing.qty + input.qty } });
  } else {
    await prisma.cartItem.create({
      data: { cartId: cart.id, productId: input.productId, size, color, qty: input.qty, savedForLater: false },
    });
  }

  return getCart(userId);
}

/** Finds a cart item that belongs to the user; malformed/absent id → 404 (matched old `.id()`). */
async function findOwnedItem(userId: string, itemId: string) {
  if (!isUuid(itemId)) {
    throw new AppError('Cart item not found', 404);
  }
  const item = await prisma.cartItem.findFirst({ where: { id: itemId, cart: { userId } } });
  if (!item) {
    throw new AppError('Cart item not found', 404);
  }
  return item;
}

export async function updateItem(userId: string, itemId: string, input: UpdateCartItemInput) {
  const item = await findOwnedItem(userId, itemId);

  const product = await prisma.product.findUnique({ where: { id: item.productId }, select: { stock: true } });
  if (product && product.stock < input.qty) {
    throw new AppError('Insufficient stock for this product', 400);
  }

  await prisma.cartItem.update({ where: { id: item.id }, data: { qty: input.qty } });
  return getCart(userId);
}

export async function removeItem(userId: string, itemId: string) {
  const item = await findOwnedItem(userId, itemId);
  await prisma.cartItem.delete({ where: { id: item.id } });
  return getCart(userId);
}

export async function toggleSaveForLater(userId: string, itemId: string) {
  const item = await findOwnedItem(userId, itemId);
  await prisma.cartItem.update({ where: { id: item.id }, data: { savedForLater: !item.savedForLater } });
  return getCart(userId);
}

export async function applyCoupon(userId: string, code: string) {
  const cart = await getCartRow(userId);
  const { subtotal } = await computeTotals(cart);

  const row = await prisma.coupon.findFirst({ where: { code: code.trim().toUpperCase() } });
  const coupon = row ? toUsableCoupon(row) : null;
  assertCouponUsable(coupon, subtotal, activeItemCount(cart));

  await prisma.cart.update({ where: { id: cart.id }, data: { couponCode: coupon.code } });
  return getCart(userId);
}

export async function removeCoupon(userId: string) {
  const cart = await prisma.cart.upsert({ where: { userId }, create: { userId }, update: {}, select: { id: true } });
  await prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
  return getCart(userId);
}
