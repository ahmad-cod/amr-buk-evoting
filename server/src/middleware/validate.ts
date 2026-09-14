import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { ApiError } from '../utils/ApiError';

type Source = 'body' | 'query' | 'params';

/** Validates and replaces req[source] with the parsed, typed value. */
export const validate =
  (schema: ZodSchema, source: Source = 'body') =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      throw ApiError.badRequest('Validation failed', details);
    }
    // Overwrite with sanitized/parsed data.
    (req as unknown as Record<string, unknown>)[source] = result.data;
    next();
  };
