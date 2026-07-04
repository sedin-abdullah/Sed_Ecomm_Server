import { Request, Response } from 'express';
import * as cartService from '../services/cart.service';
import { CartTotals } from '../services/cart.service';
import { ICart } from '../models/Cart';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendResponse } from '../utils/sendResponse';
import { AddCartItemInput, ApplyCouponInput, UpdateCartItemInput } from '../validators/cart.validator';

function requireUserId(req: Pick<Request, 'user'>): string {
  if (!req.user) throw new AppError('Authentication required', 401);
  return req.user.id as string;
}

/** Flattens the {cart, totals} pair into the single object the client's `Cart` type expects. */
function serializeCart(cart: ICart, totals: CartTotals) {
  return {
    id: String(cart._id),
    items: cart.items.map((item) => ({
      id: String(item._id),
      product: item.product,
      variant: item.variant,
      qty: item.qty,
      savedForLater: item.savedForLater,
    })),
    subtotal: totals.subtotal,
    discount: totals.discount,
    shippingFee: totals.shippingFee,
    tax: totals.tax,
    couponCode: totals.couponCode,
    total: totals.total,
    currency: 'USD',
  };
}

export const getCart = asyncHandler(async (req: Request, res: Response) => {
  const { cart, totals } = await cartService.getCart(requireUserId(req));
  sendResponse(res, 200, { data: serializeCart(cart, totals) });
});

export const addItem = asyncHandler(
  async (req: Request<unknown, unknown, AddCartItemInput>, res: Response) => {
    const { cart, totals } = await cartService.addItem(requireUserId(req), req.body);
    sendResponse(res, 201, { data: serializeCart(cart, totals), message: 'Item added to cart' });
  },
);

export const updateItem = asyncHandler(
  async (req: Request<{ itemId: string }, unknown, UpdateCartItemInput>, res: Response) => {
    const { cart, totals } = await cartService.updateItem(requireUserId(req), req.params.itemId, req.body);
    sendResponse(res, 200, { data: serializeCart(cart, totals), message: 'Cart item updated' });
  },
);

export const removeItem = asyncHandler(async (req: Request<{ itemId: string }>, res: Response) => {
  const { cart, totals } = await cartService.removeItem(requireUserId(req), req.params.itemId);
  sendResponse(res, 200, { data: serializeCart(cart, totals), message: 'Item removed from cart' });
});

export const toggleSaveForLater = asyncHandler(async (req: Request<{ itemId: string }>, res: Response) => {
  const { cart, totals } = await cartService.toggleSaveForLater(requireUserId(req), req.params.itemId);
  sendResponse(res, 200, { data: serializeCart(cart, totals) });
});

export const applyCoupon = asyncHandler(
  async (req: Request<unknown, unknown, ApplyCouponInput>, res: Response) => {
    const { cart, totals } = await cartService.applyCoupon(requireUserId(req), req.body.code);
    sendResponse(res, 200, { data: serializeCart(cart, totals), message: 'Coupon applied successfully' });
  },
);

export const removeCoupon = asyncHandler(async (req: Request, res: Response) => {
  const { cart, totals } = await cartService.removeCoupon(requireUserId(req));
  sendResponse(res, 200, { data: serializeCart(cart, totals), message: 'Coupon removed' });
});
