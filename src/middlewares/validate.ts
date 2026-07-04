import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { AppError } from '../utils/AppError';

type RequestPart = 'body' | 'query' | 'params';

/**
 * Generic middleware factory that validates `req[part]` against a zod
 * schema. On failure, forwards a 400 AppError with formatted field messages.
 * On success, replaces `req[part]` with the parsed (and coerced) data.
 */
export function validate(schema: AnyZodObject, part: RequestPart = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);

    if (!result.success) {
      const zodError = result.error as ZodError;
      const errors = zodError.issues.map((issue) => ({
        field: issue.path.join('.') || part,
        message: issue.message,
      }));

      next(new AppError('Validation failed', 400, errors));
      return;
    }

    req[part] = result.data;
    next();
  };
}

export default validate;
