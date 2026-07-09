import { Address } from '../models/Address';
import { Cart } from '../models/Cart';
import { Coupon, ICoupon } from '../models/Coupon';
import { IOrder, IOrderItem, ITrackingEvent, Order, OrderStatus, RefundMethod } from '../models/Order';
import { Payment } from '../models/Payment';
import { IProduct, Product } from '../models/Product';
import { IUser } from '../models/User';
import { AppError } from '../utils/AppError';
import { buildPaginationMeta, parsePagination } from '../utils/pagination';
import { CreateOrderInput, ListOrdersQuery } from '../validators/order.validator';

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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeCouponDiscount(coupon: ICoupon, subtotal: number): number {
  let discount = coupon.type === 'flat' ? coupon.value : (subtotal * coupon.value) / 100;
  if (coupon.maxDiscount !== undefined) discount = Math.min(discount, coupon.maxDiscount);
  return round2(Math.min(discount, subtotal));
}

async function resolveCoupon(code: string, subtotal: number, itemCount: number): Promise<ICoupon> {
  const coupon = await Coupon.findOne({ code: code.trim().toUpperCase() });
  if (!coupon) throw new AppError('Invalid coupon code', 400);
  if (!coupon.isActive) throw new AppError('This coupon is no longer active', 400);
  if (coupon.expiresAt.getTime() < Date.now()) throw new AppError('This coupon has expired', 400);
  if (coupon.usedCount >= coupon.usageLimit) throw new AppError('This coupon has reached its usage limit', 400);
  if (subtotal < coupon.minOrderValue) {
    throw new AppError(`A minimum order value of ${coupon.minOrderValue} is required for this coupon`, 400);
  }
  if ((coupon.minItems ?? 0) > 0 && itemCount < coupon.minItems) {
    throw new AppError(`This coupon requires at least ${coupon.minItems} items in your order`, 400);
  }
  return coupon;
}

interface ResolvedItem {
  product: IProduct;
  qty: number;
  variant?: { size?: string; color?: string };
}

/** Resolves the items to check out: explicit `items` from the request, or the user's active cart. */
async function resolveOrderItems(userId: string, input: CreateOrderInput): Promise<ResolvedItem[]> {
  if (input.items && input.items.length > 0) {
    return Promise.all(
      input.items.map(async (item) => {
        const product = await Product.findById(item.productId);
        if (!product) throw new AppError('One or more products in your order no longer exist', 400);
        return { product, qty: item.qty, variant: item.variant };
      }),
    );
  }

  const cart = await Cart.findOne({ user: userId });
  const activeItems = cart?.items.filter((item) => !item.savedForLater) ?? [];
  if (activeItems.length === 0) {
    throw new AppError('Your cart is empty', 400);
  }

  return Promise.all(
    activeItems.map(async (item) => {
      const product = await Product.findById(item.product);
      if (!product) throw new AppError('One or more products in your cart no longer exist', 400);
      return { product, qty: item.qty, variant: item.variant };
    }),
  );
}

export async function createOrder(userId: string, input: CreateOrderInput): Promise<IOrder> {
  const address = await Address.findOne({ _id: input.addressId, user: userId });
  if (!address) {
    throw new AppError('Address not found', 400);
  }

  const resolvedItems = await resolveOrderItems(userId, input);

  for (const { product, qty } of resolvedItems) {
    if (product.stock < qty) {
      throw new AppError(`Insufficient stock for "${product.name}"`, 400);
    }
  }

  const orderItems: IOrderItem[] = resolvedItems.map(({ product, qty, variant }) => ({
    product: product._id,
    name: product.name,
    image: product.images[0] ?? '',
    price: product.discountPrice ?? product.price,
    qty,
    variant,
  }));

  const subtotal = round2(orderItems.reduce((sum, item) => sum + item.price * item.qty, 0));

  let discount = 0;
  let coupon: ICoupon | undefined;
  const couponCode = input.couponCode ?? (await Cart.findOne({ user: userId }))?.couponCode;
  if (couponCode) {
    const itemCount = orderItems.reduce((sum, it) => sum + it.qty, 0);
    coupon = await resolveCoupon(couponCode, subtotal, itemCount);
    discount = computeCouponDiscount(coupon, subtotal);
  }

  const shippingFee = subtotal - discount >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_FEE;
  const tax = round2((subtotal - discount) * TAX_RATE);
  const total = round2(subtotal - discount + shippingFee + tax);

  await Promise.all(
    resolvedItems.map(({ product, qty }) => Product.findByIdAndUpdate(product._id, { $inc: { stock: -qty } })),
  );

  if (coupon) {
    await Coupon.findByIdAndUpdate(coupon._id, { $inc: { usedCount: 1 } });
  }

  // The cart is intentionally left untouched here — it's only cleared once
  // payment actually succeeds (see payment.service.ts finalizePaymentSuccess),
  // so a failed or abandoned payment doesn't strand the customer with an
  // empty cart and no way to retry buying the same items.
  const order = await Order.create({
    user: userId,
    items: orderItems,
    shippingAddress: address._id,
    subtotal,
    discount,
    couponCode: coupon?.code,
    shippingFee,
    tax,
    total,
    paymentMethod: input.paymentMethod,
    paymentStatus: 'pending',
    status: 'pending',
    trackingTimeline: [{ status: 'pending', timestamp: new Date(), note: STAGE_NOTES.pending }],
  });

  return order;
}

export async function getMyOrders(userId: string, query: ListOrdersQuery) {
  const { page, limit, skip } = parsePagination(query);
  const filter: Record<string, unknown> = { user: userId };
  if (query.status) filter.status = query.status;

  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('shippingAddress'),
    Order.countDocuments(filter),
  ]);

  return { orders, pagination: buildPaginationMeta(page, limit, total) };
}

async function findOrderOrThrow(id: string, userId?: string): Promise<IOrder> {
  const filter: Record<string, unknown> = { _id: id };
  if (userId) filter.user = userId;

  const order = await Order.findOne(filter).populate('shippingAddress').populate('user', 'name email');
  if (!order) {
    throw new AppError('Order not found', 404);
  }
  return order;
}

export async function getOrderById(userId: string, id: string): Promise<IOrder> {
  return findOrderOrThrow(id, userId);
}

export async function cancelOrder(userId: string, id: string, reason?: string): Promise<IOrder> {
  const order = await findOrderOrThrow(id, userId);

  if (!['pending', 'confirmed'].includes(order.status)) {
    throw new AppError(`Order cannot be cancelled once it is "${order.status}"`, 409);
  }

  await Promise.all(
    order.items.map((item) => Product.findByIdAndUpdate(item.product, { $inc: { stock: item.qty } })),
  );

  order.status = 'cancelled';
  order.cancelledBy = (order.user as unknown as { name?: string })?.name ?? 'Customer';
  if (reason) order.cancellationReason = reason;
  order.trackingTimeline.push({ status: 'cancelled', timestamp: new Date(), note: STAGE_NOTES.cancelled });
  await order.save();
  return order;
}

export async function returnOrder(userId: string, id: string): Promise<IOrder> {
  const order = await findOrderOrThrow(id, userId);

  if (order.status !== 'delivered') {
    throw new AppError('Only delivered orders can be returned', 409);
  }

  const deliveredEvent = [...order.trackingTimeline].reverse().find((e) => e.status === 'delivered');
  const deliveredAt = deliveredEvent?.timestamp ?? order.updatedAt;
  const windowMs = RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  if (Date.now() - deliveredAt.getTime() > windowMs) {
    throw new AppError(`The ${RETURN_WINDOW_DAYS}-day return window for this order has expired`, 400);
  }

  order.status = 'returned';
  order.trackingTimeline.push({ status: 'returned', timestamp: new Date(), note: STAGE_NOTES.returned });
  await order.save();
  return order;
}

export async function getInvoice(userId: string, id: string) {
  const order = await findOrderOrThrow(id, userId);

  return {
    invoiceNumber: `INV-${String(order._id).slice(-8).toUpperCase()}`,
    issuedAt: order.createdAt,
    orderId: order._id,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    shippingAddress: order.shippingAddress,
    items: order.items.map((item) => ({
      name: item.name,
      image: item.image,
      price: item.price,
      qty: item.qty,
      variant: item.variant,
      lineTotal: round2(item.price * item.qty),
    })),
    totals: {
      subtotal: order.subtotal,
      discount: order.discount,
      shippingFee: order.shippingFee,
      tax: order.tax,
      total: order.total,
      couponCode: order.couponCode,
    },
  };
}

function synthesizeTimeline(order: IOrder): ITrackingEvent[] {
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

export async function getTrackingTimeline(userId: string, id: string): Promise<ITrackingEvent[]> {
  const order = await findOrderOrThrow(id, userId);
  if (order.trackingTimeline.length > 0) {
    return [...order.trackingTimeline].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
  return synthesizeTimeline(order);
}

// ---- Admin ----

export async function listOrdersAdmin(query: ListOrdersQuery) {
  const { page, limit, skip } = parsePagination(query);
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email')
      .populate('shippingAddress'),
    Order.countDocuments(filter),
  ]);

  return { orders, pagination: buildPaginationMeta(page, limit, total) };
}

const RESTOCKED_STATUSES: OrderStatus[] = ['cancelled', 'returned'];

export async function updateOrderStatusAdmin(
  id: string,
  status: OrderStatus,
  note?: string,
  actorName?: string,
): Promise<IOrder> {
  const order = await Order.findById(id);
  if (!order) {
    throw new AppError('Order not found', 404);
  }

  const isNewlyCancelled = RESTOCKED_STATUSES.includes(status) && !RESTOCKED_STATUSES.includes(order.status);

  order.status = status;
  order.trackingTimeline.push({ status, timestamp: new Date(), note: note ?? STAGE_NOTES[status] });

  if (isNewlyCancelled) {
    await Promise.all(
      order.items.map((item) => Product.findByIdAndUpdate(item.product, { $inc: { stock: item.qty } })),
    );
  }

  // Attribute staff cancellations so the Cancelled tab shows who cancelled.
  if (status === 'cancelled' && !order.cancelledBy) {
    order.cancelledBy = actorName ?? 'Staff';
    if (note) order.cancellationReason = note;
  }

  if (status === 'delivered' && order.paymentMethod === 'cod') {
    order.paymentStatus = 'success';
  }

  await order.save();
  return order;
}

// ---- Refund workflow ----

const REFUND_MESSAGES: Record<RefundMethod, string> = {
  card: 'Your refund has been processed successfully and will be credited to your card shortly.',
  upi: 'Your refund has been processed successfully and has been initiated to your UPI account.',
  cash: 'Your refund has been approved. Please collect the refund from the store.',
};

/** Customer: request a refund on a delivered order (from My Orders). */
export async function requestRefund(
  userId: string,
  id: string,
  reason: string,
  comments?: string,
): Promise<IOrder> {
  const order = await findOrderOrThrow(id, userId);

  if (order.status !== 'delivered') {
    throw new AppError('Refunds can only be requested after the order is delivered', 409);
  }
  if (order.refund) {
    throw new AppError('A refund has already been requested for this order', 409);
  }

  order.refund = { status: 'requested', reason, comments, requestedAt: new Date() };
  await order.save();
  return order;
}

/** Staff: all orders with a refund request, newest first, incl. payment info. */
export async function listRefundOrders() {
  const orders = await Order.find({ 'refund.requestedAt': { $exists: true } })
    .sort({ 'refund.requestedAt': -1 })
    .populate('user', 'name email phone')
    .populate('shippingAddress');

  // Attach the payment record (transaction id / status) per order.
  const payments = await Payment.find({ order: { $in: orders.map((o) => o._id) } });
  const byOrder = new Map(payments.map((p) => [String(p.order), p]));
  return orders.map((o) => {
    const json = o.toJSON() as Record<string, unknown>;
    const payment = byOrder.get(String(o._id));
    json.payment = payment
      ? { id: String(payment._id), method: payment.method, status: payment.status, amount: payment.amount }
      : undefined;
    return json;
  });
}

/** Staff: process a requested refund with the chosen method (card/upi/cash). */
export async function processRefund(id: string, method: RefundMethod, staff: IUser): Promise<IOrder> {
  const order = await Order.findById(id);
  if (!order) throw new AppError('Order not found', 404);
  if (!order.refund || order.refund.status !== 'requested') {
    throw new AppError('This order has no pending refund request', 409);
  }

  order.refund.status = 'processed';
  order.refund.method = method;
  order.refund.processedAt = new Date();
  order.refund.processedBy = staff.name;
  order.refund.message = REFUND_MESSAGES[method];
  order.paymentStatus = 'refunded';
  order.markModified('refund');
  await order.save();
  return order;
}
