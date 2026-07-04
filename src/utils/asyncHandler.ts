import { NextFunction, Request, Response } from 'express';

type AsyncRouteHandler<
  P = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, string | undefined>,
> = (
  req: Request<P, ResBody, ReqBody, ReqQuery>,
  res: Response<ResBody>,
  next: NextFunction,
) => Promise<unknown>;

/**
 * Wraps an async Express route/middleware handler so that any rejected
 * promise is forwarded to Express's `next()` error pipeline instead of
 * crashing the process or requiring a try/catch in every controller.
 */
export function asyncHandler<
  P = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, string | undefined>,
>(handler: AsyncRouteHandler<P, ResBody, ReqBody, ReqQuery>) {
  return (req: Request<P, ResBody, ReqBody, ReqQuery>, res: Response<ResBody>, next: NextFunction): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export default asyncHandler;
