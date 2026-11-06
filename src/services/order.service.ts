import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';
import { toUsableCoupon, UsableCoupon } from './coupon.service';
import { AppError } from '../utils/AppError';
import { buildPaginationMeta, parsePagination } from '../utils/pagination';
import { toApi } from '../utils/serialize';
import { assertUuid } from '../utils/uuid';
import { CreateOrderInput, ListOrdersQuery } from '../validators/order.validator';

export type OrderStatus =
  | 'pending' | 'confirmed' | 'processing' | 'shipped'
  | 'delivered' | 'cancelled' | 'returned' | 'payment_failed';
export type RefundMethod = 'card' | 'upi' | 'cash';

interface TrackingEvent {
  status: OrderStatus;
  timestamp: Date;
  note?: string;
}

const FREE_SHIPPING_THRESHOLD = 50;
const FLAT_SHIPPING_FEE = 5.99;
const TAX_RATE = 0.08;
const RETURN_WINDOW_DAYS = 7;

const PROGRESS_STAGES: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

const STAGE_NOTES: Partial<Record<OrderStatus, string>> = {
  pending: 'Order placed and awaiting payment confirmation',
  confirmed: 'Payment confirmed, order is being prepared',
  processing: 'Order is being packed',
  shipped: 'Order has been shipped',
  delivered: 'Order delivered',
  cancelled: 'Order cancelled',
  returned: 'Order returned',
  payment_failed: 'Payment failed',
};

// Items + timeline are part of every order response; relations (user/addresses)
// are added per-endpoint to match exactly what the old code populated.
const ITEMS_TRACK = {
  items: true,
  trackingEvents: { orderBy: { timestamp: 'asc' as const } },
};
const WITH_SHIPPING = { ...ITEMS_TRACK, shippingAddress: true };
const WITH_USER_SHIPPING = {
  ...ITEMS_TRACK,
  shippingAddress: true,
  user: { select: { id: true, name: true, email: true } },
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toNum(decimal: unknown): number {
  if (decimal === null || decimal === undefined) return 0;
  return typeof decimal === 'number' ? decimal : Number((decimal as { toString(): string }).toString());
}

function serializeOrderItem(it: Record<string, unknown>): Record<string, unknown> {
  return {
    product: it.productId ?? null,
    name: it.name,
    image: it.image,
    price: it.price,
    qty: it.qty,
    variant: { size: (it.size as string | null) ?? undefined, color: (it.color as string | null) ?? undefined },
  };
}

function serializeTrackingEvent(ev: Record<string, unknown>): TrackingEvent {
  return {
    status: ev.status as OrderStatus,
    timestamp: ev.timestamp as Date,
    note: (ev.note as string | null) ?? undefined,
  };
}

/** Shapes a Prisma order for the API: re-nests item variants, maps the
 *  trackingEvents relation back to `trackingTimeline`, and exposes `user`/
 *  `shippingAddress`/`billingAddress` as the populated object (when included)
 *  or the bare id (matching the old populated-vs-not behaviour per endpoint). */
function serializeOrder(order: Record<string, unknown>): Record<string, unknown> {
  const api = toApi(order) as Record<string, unknown>;
  const {
    userId, shippingAddressId, billingAddressId,
    user, shippingAddress, billingAddress,
    items, trackingEvents,
    ...rest
  } = api;

  const out: Record<string, unknown> = {
    ...rest,
    user: user !== undefined ? user : userId,
    shippingAddress: shippingAddress !== undefined ? shippingAddress : shippingAddressId,
  };

  if (billingAddress !== undefined || billingAddressId) {
    out.billingAddress = billingAddress !== undefined ? billingAddress : billingAddressId;
  }
  if (items !== undefined) {
    out.items = (items as Record<string, unknown>[]).map(serializeOrderItem);
  }
  if (trackingEvents !== undefined) {
    out.trackingTimeline = (trackingEvents as Record<string, unknown>[]).map(serializeTrackingEvent);
  }
  return out;
}

function computeCouponDiscount(coupon: UsableCoupon, subtotal: number): number {
  let discount = coupon.type === 'flat' ? coupon.value : (subtotal * coupon.value) / 100;
  if (coupon.maxDiscount !== undefined) discount = Math.min(discount, coupon.maxDiscount);
  return round2(Math.min(discount, subtotal));
}

async function resolveCoupon(code: string, subtotal: number, itemCount: number): Promise<UsableCoupon> {
  const row = await prisma.coupon.findFirst({ where: { code: code.trim().toUpperCase() } });
  if (!row) throw new AppError('Invalid coupon code', 400);
  const coupon = toUsableCoupon(row);
  if (!coupon.isActive) throw new AppError('This coupon is no longer active', 400);
  if (coupon.expiresAt.getTime() < Date.now()) throw new AppError('This coupon has expired', 400);
  if (coupon.usedCount >= coupon.usageLimit) throw new AppError('This coupon has reached its usage limit', 400);
  if (subtotal < coupon.minOrderValue) {
    throw new AppError(`A minimum order value of ${coupon.minOrderValue} is required for this coupon`, 400);
  }
  if (coupon.minItems > 0 && itemCount < coupon.minItems) {
    throw new AppError(`This coupon requires at least ${coupon.minItems} items in your order`, 400);
  }
  return coupon;
}

interface ResolvedItem {
  product: { id: string; name: string; images: string[]; price: unknown; discountPrice: unknown; stock: number; blockCheckout: boolean };
  qty: number;
  variant?: { size?: string; color?: string };
}

const CHECKOUT_PRODUCT_SELECT = {
  id: true, name: true, images: true, price: true, discountPrice: true, stock: true, blockCheckout: true,
} as const;

/** Resolves the items to check out: explicit `items` from the request, or the user's active cart. */
async function resolveOrderItems(userId: string, input: CreateOrderInput): Promise<ResolvedItem[]> {
  if (input.items && input.items.length > 0) {
    return Promise.all(
      input.items.map(async (item) => {
        const product = await prisma.product.findUnique({ where: { id: item.productId }, select: CHECKOUT_PRODUCT_SELECT });
        if (!product) throw new AppError('One or more products in your order no longer exist', 400);
        return { product, qty: item.qty, variant: item.variant };
      }),
    );
  }

  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: { items: { include: { product: { select: CHECKOUT_PRODUCT_SELECT } } } },
  });
  const activeItems = cart?.items.filter((item) => !item.savedForLater) ?? [];
  if (activeItems.length === 0) {
    throw new AppError('Your cart is empty', 400);
  }

  return activeItems.map((item) => {
    if (!item.product) throw new AppError('One or more products in your cart no longer exist', 400);
    return {
      product: item.product,
      qty: item.qty,
      variant: { size: item.size ?? undefined, color: item.color ?? undefined },
    };
  });
}

export async function createOrder(userId: string, input: CreateOrderInput) {
  const address = await prisma.address.findFirst({ where: { id: input.addressId, userId }, select: { id: true } });
  if (!address) {
    throw new AppError('Address not found', 400);
  }

  const resolvedItems = await resolveOrderItems(userId, input);

  // Admin test toggle: block checkout when any item is flagged, before any side effects.
  if (resolvedItems.some(({ product }) => product.blockCheckout)) {
    throw new AppError('Checkout is currently unavailable for one or more items in your cart.', 400);
  }

  for (const { product, qty } of resolvedItems) {
    if (product.stock < qty) {
      throw new AppError(`Insufficient stock for "${product.name}"`, 400);
    }
  }

  const orderItems = resolvedItems.map(({ product, qty, variant }) => ({
    productId: product.id,
    name: product.name,
    image: product.images[0] ?? '',
    price: toNum(product.discountPrice ?? product.price),
    qty,
    size: variant?.size ?? null,
    color: variant?.color ?? null,
  }));

  const subtotal = round2(orderItems.reduce((sum, item) => sum + item.price * item.qty, 0));

  let discount = 0;
  let coupon: UsableCoupon | undefined;
  const cartCoupon = input.couponCode ? undefined : (await prisma.cart.findUnique({ where: { userId }, select: { couponCode: true } }))?.couponCode;
  const couponCode = input.couponCode ?? cartCoupon ?? undefined;
  if (couponCode) {
    const itemCount = orderItems.reduce((sum, it) => sum + it.qty, 0);
    coupon = await resolveCoupon(couponCode, subtotal, itemCount);
    discount = computeCouponDiscount(coupon, subtotal);
  }

  const shippingFee = subtotal - discount >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_FEE;
  const tax = round2((subtotal - discount) * TAX_RATE);
  const total = round2(subtotal - discount + shippingFee + tax);

  await Promise.all(
    resolvedItems.map(({ product, qty }) => prisma.product.update({ where: { id: product.id }, data: { stock: { decrement: qty } } })),
  );

  if (coupon) {
    await prisma.coupon.update({ where: { code: coupon.code }, data: { usedCount: { increment: 1 } } });
  }

  // The cart is intentionally left untouched here — it's only cleared once
  // payment actually succeeds (payment.service finalizePaymentSuccess).
  const order = await prisma.order.create({
    data: {
      userId,
      shippingAddressId: address.id,
      subtotal,
      discount,
      couponCode: coupon?.code,
      shippingFee,
      tax,
      total,
      paymentMethod: input.paymentMethod,
      paymentStatus: 'pending',
      status: 'pending',
      items: { create: orderItems },
      trackingEvents: { create: { status: 'pending', timestamp: new Date(), note: STAGE_NOTES.pending } },
    },
    include: ITEMS_TRACK,
  });

  return serializeOrder(order);
}

export async function getMyOrders(userId: string, query: ListOrdersQuery) {
  const { page, limit, skip } = parsePagination(query);
  const where: Prisma.OrderWhereInput = { userId, ...(query.status ? { status: query.status } : {}) };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit, include: WITH_SHIPPING }),
    prisma.order.count({ where }),
  ]);

  return { orders: orders.map(serializeOrder), pagination: buildPaginationMeta(page, limit, total) };
}

async function findOrderRowOrThrow(id: string, userId?: string) {
  assertUuid(id);
  const order = await prisma.order.findFirst({
    where: { id, ...(userId ? { userId } : {}) },
    include: WITH_USER_SHIPPING,
  });
  if (!order) {
    throw new AppError('Order not found', 404);
  }
  return order;
}

export async function getOrderById(userId: string, id: string) {
  return serializeOrder(await findOrderRowOrThrow(id, userId));
}

export async function cancelOrder(userId: string, id: string, reason?: string) {
  const order = await findOrderRowOrThrow(id, userId);

  if (!['pending', 'confirmed'].includes(order.status)) {
    throw new AppError(`Order cannot be cancelled once it is "${order.status}"`, 409);
  }

  await Promise.all(
    order.items.map((item) =>
      item.productId ? prisma.product.update({ where: { id: item.productId }, data: { stock: { increment: item.qty } } }) : Promise.resolve(),
    ),
  );

  const updated = await prisma.order.update({
    where: { id },
    data: {
      status: 'cancelled',
      cancelledBy: order.user?.name ?? 'Customer',
      ...(reason ? { cancellationReason: reason } : {}),
      trackingEvents: { create: { status: 'cancelled', timestamp: new Date(), note: STAGE_NOTES.cancelled } },
    },
    include: WITH_USER_SHIPPING,
  });
  return serializeOrder(updated);
}

export async function returnOrder(userId: string, id: string) {
  const order = await findOrderRowOrThrow(id, userId);

  if (order.status !== 'delivered') {
    throw new AppError('Only delivered orders can be returned', 409);
  }

  const deliveredEvent = [...order.trackingEvents].reverse().find((e) => e.status === 'delivered');
  const deliveredAt = deliveredEvent?.timestamp ?? order.updatedAt;
  const windowMs = RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  if (Date.now() - deliveredAt.getTime() > windowMs) {
    throw new AppError(`The ${RETURN_WINDOW_DAYS}-day return window for this order has expired`, 400);
  }

  const updated = await prisma.order.update({
    where: { id },
    data: { status: 'returned', trackingEvents: { create: { status: 'returned', timestamp: new Date(), note: STAGE_NOTES.returned } } },
    include: WITH_USER_SHIPPING,
  });
  return serializeOrder(updated);
}

export async function getInvoice(userId: string, id: string) {
  const order = await findOrderRowOrThrow(id, userId);

  return {
    invoiceNumber: `INV-${order.id.slice(-8).toUpperCase()}`,
    issuedAt: order.createdAt,
    orderId: order.id,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    shippingAddress: order.shippingAddress ? toApi(order.shippingAddress) : null,
    items: order.items.map((item) => ({
      name: item.name,
      image: item.image,
      price: toNum(item.price),
      qty: item.qty,
      variant: { size: item.size ?? undefined, color: item.color ?? undefined },
      lineTotal: round2(toNum(item.price) * item.qty),
    })),
    totals: {
      subtotal: toNum(order.subtotal),
      discount: toNum(order.discount),
      shippingFee: toNum(order.shippingFee),
      tax: toNum(order.tax),
      total: toNum(order.total),
      couponCode: order.couponCode ?? undefined,
    },
  };
}

function synthesizeTimeline(order: { createdAt: Date; updatedAt: Date; status: OrderStatus }): TrackingEvent[] {
  const base = order.createdAt.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  if (order.status === 'cancelled' || order.status === 'returned' || order.status === 'payment_failed') {
    return [
      { status: 'pending', timestamp: new Date(base), note: STAGE_NOTES.pending },
      { status: order.status, timestamp: order.updatedAt, note: STAGE_NOTES[order.status] },
    ];
  }

  const idx = PROGRESS_STAGES.indexOf(order.status);
  const upto = idx === -1 ? 0 : idx;

  return PROGRESS_STAGES.slice(0, upto + 1).map((status, i) => ({
    status,
    timestamp: new Date(base + i * dayMs),
    note: STAGE_NOTES[status],
  }));
}

export async function getTrackingTimeline(userId: string, id: string): Promise<TrackingEvent[]> {
  const order = await findOrderRowOrThrow(id, userId);
  if (order.trackingEvents.length > 0) {
    return [...order.trackingEvents]
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .map(serializeTrackingEvent);
  }
  return synthesizeTimeline(order);
}

// ---- Admin ----

export async function listOrdersAdmin(query: ListOrdersQuery) {
  const { page, limit, skip } = parsePagination(query);
  const where: Prisma.OrderWhereInput = query.status ? { status: query.status } : {};

  const [orders, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit, include: WITH_USER_SHIPPING }),
    prisma.order.count({ where }),
  ]);

  return { orders: orders.map(serializeOrder), pagination: buildPaginationMeta(page, limit, total) };
}

const RESTOCKED_STATUSES: OrderStatus[] = ['cancelled', 'returned'];

export async function updateOrderStatusAdmin(
  id: string,
  status: OrderStatus,
  note?: string,
  actorName?: string,
) {
  assertUuid(id);
  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) {
    throw new AppError('Order not found', 404);
  }

  const isNewlyCancelled = RESTOCKED_STATUSES.includes(status) && !RESTOCKED_STATUSES.includes(order.status as OrderStatus);

  if (isNewlyCancelled) {
    await Promise.all(
      order.items.map((item) =>
        item.productId ? prisma.product.update({ where: { id: item.productId }, data: { stock: { increment: item.qty } } }) : Promise.resolve(),
      ),
    );
  }

  const data: Prisma.OrderUpdateInput = {
    status,
    trackingEvents: { create: { status, timestamp: new Date(), note: note ?? STAGE_NOTES[status] } },
  };

  // Attribute staff cancellations so the Cancelled tab shows who cancelled.
  if (status === 'cancelled' && !order.cancelledBy) {
    data.cancelledBy = actorName ?? 'Staff';
    if (note) data.cancellationReason = note;
  }
  if (status === 'delivered' && order.paymentMethod === 'cod') {
    data.paymentStatus = 'success';
  }

  const updated = await prisma.order.update({ where: { id }, data, include: ITEMS_TRACK });
  return serializeOrder(updated);
}

// ---- Refund workflow ----

interface RefundInfo {
  status: 'requested' | 'processed';
  reason: string;
  comments?: string;
  requestedAt: Date | string;
  method?: RefundMethod;
  processedAt?: Date | string;
  processedBy?: string;
  message?: string;
}

const REFUND_MESSAGES: Record<RefundMethod, string> = {
  card: 'Your refund has been processed successfully and will be credited to your card shortly.',
  upi: 'Your refund has been processed successfully and has been initiated to your UPI account.',
  cash: 'Your refund has been approved. Please collect the refund from the store.',
};

/** Customer: request a refund on a delivered order (from My Orders). */
export async function requestRefund(userId: string, id: string, reason: string, comments?: string) {
  const order = await findOrderRowOrThrow(id, userId);

  if (order.status !== 'delivered') {
    throw new AppError('Refunds can only be requested after the order is delivered', 409);
  }
  if (order.refund) {
    throw new AppError('A refund has already been requested for this order', 409);
  }

  const refund: RefundInfo = { status: 'requested', reason, comments, requestedAt: new Date() };
  const updated = await prisma.order.update({
    where: { id },
    data: { refund: refund as unknown as Prisma.InputJsonValue },
    include: WITH_USER_SHIPPING,
  });
  return serializeOrder(updated);
}

/** Staff: all orders with a refund request, newest first, incl. payment info. */
export async function listRefundOrders() {
  const orders = await prisma.order.findMany({
    where: { refund: { not: Prisma.DbNull } },
    include: {
      ...ITEMS_TRACK,
      shippingAddress: true,
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  });

  const refundAt = (o: { refund: unknown }) => new Date((o.refund as RefundInfo).requestedAt).getTime();
  orders.sort((a, b) => refundAt(b) - refundAt(a));

  const payments = await prisma.payment.findMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
  const byOrder = new Map(payments.map((p) => [p.orderId, p]));

  return orders.map((o) => {
    const json = serializeOrder(o);
    const payment = byOrder.get(o.id);
    json.payment = payment
      ? { id: payment.id, method: payment.method, status: payment.status, amount: toNum(payment.amount) }
      : undefined;
    return json;
  });
}

/** Staff: process a requested refund with the chosen method (card/upi/cash). */
export async function processRefund(id: string, method: RefundMethod, staff: { name: string }) {
  assertUuid(id);
  const order = await prisma.order.findUnique({ where: { id }, select: { id: true, refund: true } });
  if (!order) throw new AppError('Order not found', 404);

  const refund = order.refund as RefundInfo | null;
  if (!refund || refund.status !== 'requested') {
    throw new AppError('This order has no pending refund request', 409);
  }

  const updatedRefund: RefundInfo = {
    ...refund,
    status: 'processed',
    method,
    processedAt: new Date(),
    processedBy: staff.name,
    message: REFUND_MESSAGES[method],
  };

  const updated = await prisma.order.update({
    where: { id },
    data: { refund: updatedRefund as unknown as Prisma.InputJsonValue, paymentStatus: 'refunded' },
    include: ITEMS_TRACK,
  });
  return serializeOrder(updated);
}
