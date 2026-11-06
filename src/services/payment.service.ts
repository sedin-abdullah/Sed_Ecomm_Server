import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';
import { detectCardBrand } from '../utils/luhn';
import { toApi } from '../utils/serialize';
import { assertUuid } from '../utils/uuid';
import {
  CardDetails,
  InitiatePaymentInput,
  NetbankingDetails,
  UpiDetails,
  VerifyPaymentInput,
  WalletDetails,
} from '../validators/payment.validator';

const VALID_OTP = '123456';
const MAX_OTP_ATTEMPTS = 2; // initial attempt + one retry
const UPI_SIMULATED_DELAY_MS = 2000;

function generateTransactionRef(): string {
  return `TXN-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function toNum(decimal: unknown): number {
  if (decimal === null || decimal === undefined) return 0;
  return typeof decimal === 'number' ? decimal : Number((decimal as { toString(): string }).toString());
}

/** Shapes a payment for the API: `_id`, Decimal amount → number, and
 *  `order`/`user` exposed as ids (the old doc had `order`/`user` ObjectIds). */
function serializePayment(payment: Record<string, unknown>): Record<string, unknown> {
  const api = toApi(payment) as Record<string, unknown>;
  const { orderId, userId, ...rest } = api;
  return { ...rest, order: orderId, user: userId };
}

interface OrderLite {
  id: string;
  userId: string;
  total: unknown;
  status: string;
  paymentStatus: string;
}

async function finalizePaymentSuccess(order: OrderLite): Promise<void> {
  await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: 'success',
      status: 'confirmed',
      trackingEvents: { create: { status: 'confirmed', timestamp: new Date(), note: 'Payment confirmed, order is being processed' } },
    },
  });

  // Only clear the cart once payment actually succeeds (a failed/retried payment
  // must not strand the customer with an empty cart).
  const cart = await prisma.cart.findUnique({ where: { userId: order.userId }, select: { id: true } });
  if (cart) {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id, savedForLater: false } });
    await prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
  }

  const user = await prisma.user.findUnique({ where: { id: order.userId }, select: { name: true, email: true } });
  const shortId = order.id.slice(-8).toUpperCase();
  const subject = `Order Confirmed - #${shortId}`;
  const body = `Hi ${user?.name ?? 'there'}, your order #${shortId} totaling $${toNum(order.total).toFixed(2)} has been confirmed and is now being processed. Thank you for shopping with Sed_Ecomm!`;

  await prisma.emailLog.create({ data: { orderId: order.id, to: user?.email ?? 'unknown@sedecomm.com', subject, body } });
  // eslint-disable-next-line no-console
  console.log(`[EMAIL SIMULATION] To: ${user?.email ?? 'unknown'} | Subject: ${subject} | Body: ${body}`);
}

async function markOrderPaymentFailed(orderId: string): Promise<void> {
  await prisma.order.update({
    where: { id: orderId },
    data: {
      paymentStatus: 'failed',
      status: 'payment_failed',
      trackingEvents: { create: { status: 'payment_failed', timestamp: new Date(), note: 'Payment failed' } },
    },
  });
}

export async function initiatePayment(userId: string, input: InitiatePaymentInput, simulateFailure: boolean) {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, userId },
    select: { id: true, userId: true, total: true, status: true, paymentStatus: true },
  });
  if (!order) {
    throw new AppError('Order not found', 404);
  }
  if (order.paymentStatus === 'success') {
    throw new AppError('This order has already been paid for', 409);
  }

  const { method } = input;
  let cardLast4: string | undefined;
  let cardBrand: string | undefined;
  let upiVpa: string | undefined;
  let bankCode: string | undefined;
  let walletProvider: string | undefined;

  if (method === 'card_credit' || method === 'card_debit') {
    const details = input.details as CardDetails | undefined;
    if (!details?.cardNumber) throw new AppError('Card details are required', 400);
    cardLast4 = details.cardNumber.replace(/\D/g, '').slice(-4);
    cardBrand = detectCardBrand(details.cardNumber);
  } else if (method === 'upi') {
    const details = input.details as UpiDetails | undefined;
    if (!details?.vpa) throw new AppError('UPI VPA is required', 400);
    upiVpa = details.vpa;
  } else if (method === 'netbanking') {
    const details = input.details as NetbankingDetails | undefined;
    if (!details?.bankCode) throw new AppError('Bank code is required', 400);
    bankCode = details.bankCode;
  } else if (method === 'wallet') {
    const details = input.details as WalletDetails | undefined;
    if (!details?.walletProvider) throw new AppError('Wallet provider is required', 400);
    walletProvider = details.walletProvider;
  }

  const requiresOtp = method === 'card_credit' || method === 'card_debit' || method === 'netbanking' || method === 'wallet';

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      userId,
      method,
      status: 'pending',
      amount: order.total,
      cardLast4,
      cardBrand,
      upiVpa,
      bankCode,
      walletProvider,
      requiresOtp,
      forcedFailure: simulateFailure,
      transactionRef: generateTransactionRef(),
    },
  });

  const resolveNow = async (): Promise<'success' | 'failed'> => {
    if (simulateFailure) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'failed' } });
      await markOrderPaymentFailed(order.id);
      return 'failed';
    }
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'success' } });
    await finalizePaymentSuccess(order);
    return 'success';
  };

  if (method === 'cod') {
    const status = await resolveNow();
    return { paymentId: payment.id, requiresOtp: false, status };
  }

  if (method === 'upi') {
    await new Promise((resolve) => setTimeout(resolve, UPI_SIMULATED_DELAY_MS));
    const status = await resolveNow();
    return { paymentId: payment.id, requiresOtp: false, status };
  }

  // card_credit / card_debit / netbanking / wallet require a simulated OTP step.
  return { paymentId: payment.id, requiresOtp: true, status: payment.status };
}

export async function verifyPayment(userId: string, input: VerifyPaymentInput) {
  assertUuid(input.paymentId);
  const payment = await prisma.payment.findFirst({ where: { id: input.paymentId, userId } });
  if (!payment) {
    throw new AppError('Payment not found', 404);
  }

  const order = await prisma.order.findUnique({
    where: { id: payment.orderId },
    select: { id: true, userId: true, total: true, status: true, paymentStatus: true },
  });
  if (!order) {
    throw new AppError('The order for this payment no longer exists', 404);
  }

  const result = (paymentRow: Record<string, unknown>, o: { status: string; paymentStatus: string }, message: string) => ({
    payment: serializePayment(paymentRow),
    order: o,
    message,
  });

  if (payment.status === 'success') {
    return result(payment, order, 'Payment already verified');
  }
  if (payment.status === 'failed') {
    throw new AppError('This payment has already failed. Please initiate a new payment.', 409);
  }
  if (!payment.requiresOtp) {
    return result(payment, order, `Payment is ${payment.status}`);
  }

  if (payment.forcedFailure) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'failed', otpAttempts: { increment: 1 } } });
    await markOrderPaymentFailed(order.id);
    throw new AppError('Payment failed', 400);
  }

  if (input.otp === VALID_OTP) {
    const updated = await prisma.payment.update({ where: { id: payment.id }, data: { status: 'success' } });
    await finalizePaymentSuccess(order);
    const fresh = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { status: true, paymentStatus: true } });
    return result(updated, fresh, 'Payment verified successfully');
  }

  const attempts = payment.otpAttempts + 1;
  if (attempts >= MAX_OTP_ATTEMPTS) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'failed', otpAttempts: attempts } });
    await markOrderPaymentFailed(order.id);
    throw new AppError('Incorrect OTP. Payment failed after maximum attempts.', 400);
  }

  await prisma.payment.update({ where: { id: payment.id }, data: { otpAttempts: attempts } });
  throw new AppError(`Incorrect OTP. You have ${MAX_OTP_ATTEMPTS - attempts} attempt(s) remaining.`, 400);
}

export async function getPayment(userId: string, id: string, isAdmin = false) {
  assertUuid(id);
  const payment = await prisma.payment.findFirst({ where: isAdmin ? { id } : { id, userId } });
  if (!payment) {
    throw new AppError('Payment not found', 404);
  }
  return serializePayment(payment);
}
