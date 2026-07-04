import { Types } from 'mongoose';
import { z } from 'zod';

const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), 'Invalid id');

// This is a dummy payment gateway — no real card/bank is ever charged, so
// details only need to be present, not realistic or checksum-valid.
const cardDetails = z.object({
  cardNumber: z.string().min(1),
  expiry: z.string(),
  cvv: z.string().min(1),
  name: z.string(),
});

const upiDetails = z.object({
  vpa: z.string().min(1),
});

const netbankingDetails = z.object({
  bankCode: z.string().min(1),
});

const walletDetails = z.object({
  walletProvider: z.string().min(1),
});

export const initiatePaymentSchema = z.object({
  orderId: objectId,
  method: z.enum(['card_credit', 'card_debit', 'upi', 'netbanking', 'wallet', 'cod'], {
    required_error: 'Payment method is required',
  }),
  details: z.union([cardDetails, upiDetails, netbankingDetails, walletDetails]).optional(),
});

export const verifyPaymentSchema = z.object({
  paymentId: objectId,
  otp: z.string().optional(),
});

export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
export type CardDetails = z.infer<typeof cardDetails>;
export type UpiDetails = z.infer<typeof upiDetails>;
export type NetbankingDetails = z.infer<typeof netbankingDetails>;
export type WalletDetails = z.infer<typeof walletDetails>;
