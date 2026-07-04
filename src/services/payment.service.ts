import crypto from 'crypto';
import { Cart } from '../models/Cart';
import { EmailLog } from '../models/EmailLog';
import { IOrder, Order } from '../models/Order';
import { IPayment, Payment } from '../models/Payment';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { detectCardBrand } from '../utils/luhn';
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

async function finalizePaymentSuccess(order: IOrder): Promise<void> {
  order.paymentStatus = 'success';
  order.status = 'confirmed';
  order.trackingTimeline.push({
    status: 'confirmed',
    timestamp: new Date(),
    note: 'Payment confirmed, order is being processed',
  });
  await order.save();

  // Only clear the cart once payment actually succeeds — clearing it at order
  // creation meant a failed/retried payment left the customer with an empty
  // cart and no way to pay for the items they just tried to buy.
  await Cart.updateOne(
    { user: order.user },
    { $pull: { items: { savedForLater: false } }, $unset: { couponCode: 1 } },
  );

  const user = await User.findById(order.user);
  const subject = `Order Confirmed - #${String(order._id).slice(-8).toUpperCase()}`;
  const body = `Hi ${user?.name ?? 'there'}, your order #${String(order._id).slice(-8).toUpperCase()} totaling $${order.total.toFixed(2)} has been confirmed and is now being processed. Thank you for shopping with Sed_Ecomm!`;

  await EmailLog.create({ order: order._id, to: user?.email ?? 'unknown@sedecomm.com', subject, body });
  // eslint-disable-next-line no-console
  console.log(`[EMAIL SIMULATION] To: ${user?.email ?? 'unknown'} | Subject: ${subject} | Body: ${body}`);
}

async function markOrderPaymentFailed(order: IOrder): Promise<void> {
  order.paymentStatus = 'failed';
  order.status = 'payment_failed';
  order.trackingTimeline.push({ status: 'payment_failed', timestamp: new Date(), note: 'Payment failed' });
  await order.save();
}

export async function initiatePayment(userId: string, input: InitiatePaymentInput, simulateFailure: boolean) {
  const order = await Order.findOne({ _id: input.orderId, user: userId });
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
    // This is a dummy gateway — any card number is accepted, valid or not.
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

  const payment = await Payment.create({
    order: order._id,
    user: userId,
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
  });

  if (method === 'cod') {
    if (simulateFailure) {
      payment.status = 'failed';
      await payment.save();
      await markOrderPaymentFailed(order);
    } else {
      payment.status = 'success';
      await payment.save();
      await finalizePaymentSuccess(order);
    }
    return { paymentId: payment.id as string, requiresOtp: false, status: payment.status };
  }

  if (method === 'upi') {
    await new Promise((resolve) => setTimeout(resolve, UPI_SIMULATED_DELAY_MS));
    if (simulateFailure) {
      payment.status = 'failed';
      await payment.save();
      await markOrderPaymentFailed(order);
    } else {
      payment.status = 'success';
      await payment.save();
      await finalizePaymentSuccess(order);
    }
    return { paymentId: payment.id as string, requiresOtp: false, status: payment.status };
  }

  // card_credit / card_debit / netbanking / wallet require a simulated OTP step.
  return { paymentId: payment.id as string, requiresOtp: true, status: payment.status };
}

export async function verifyPayment(userId: string, input: VerifyPaymentInput) {
  const payment = await Payment.findOne({ _id: input.paymentId, user: userId });
  if (!payment) {
    throw new AppError('Payment not found', 404);
  }

  const order = await Order.findById(payment.order);
  if (!order) {
    throw new AppError('The order for this payment no longer exists', 404);
  }

  if (payment.status === 'success') {
    return { payment, order, message: 'Payment already verified' };
  }
  if (payment.status === 'failed') {
    throw new AppError('This payment has already failed. Please initiate a new payment.', 409);
  }
  if (!payment.requiresOtp) {
    // upi/cod resolve at initiate time; nothing left to verify here.
    return { payment, order, message: `Payment is ${payment.status}` };
  }

  if (payment.forcedFailure) {
    payment.status = 'failed';
    payment.otpAttempts += 1;
    await payment.save();
    await markOrderPaymentFailed(order);
    throw new AppError('Payment failed', 400);
  }

  if (input.otp === VALID_OTP) {
    payment.status = 'success';
    await payment.save();
    await finalizePaymentSuccess(order);
    return { payment, order, message: 'Payment verified successfully' };
  }

  payment.otpAttempts += 1;

  if (payment.otpAttempts >= MAX_OTP_ATTEMPTS) {
    payment.status = 'failed';
    await payment.save();
    await markOrderPaymentFailed(order);
    throw new AppError('Incorrect OTP. Payment failed after maximum attempts.', 400);
  }

  await payment.save();
  throw new AppError(`Incorrect OTP. You have ${MAX_OTP_ATTEMPTS - payment.otpAttempts} attempt(s) remaining.`, 400);
}

export async function getPayment(userId: string, id: string, isAdmin = false): Promise<IPayment> {
  const filter = isAdmin ? { _id: id } : { _id: id, user: userId };
  const payment = await Payment.findOne(filter);
  if (!payment) {
    throw new AppError('Payment not found', 404);
  }
  return payment;
}
