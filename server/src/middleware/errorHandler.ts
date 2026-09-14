import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let messageText = 'Something went wrong. Please try again.';
  let details: unknown;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    code = err.code;
    messageText = err.message;
    details = err.details;
  } else if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    // Mongoose validation error
    if (e.name === 'ValidationError' && e.errors) {
      statusCode = 400;
      code = 'VALIDATION_ERROR';
      messageText = 'Validation failed';
      details = Object.values(e.errors as Record<string, { message: string }>).map(
        (v) => v.message,
      );
    }
    // Mongo duplicate key
    else if (e.code === 11000) {
      statusCode = 409;
      code = 'DUPLICATE';
      const key = Object.keys((e.keyValue as object) || {})[0] || 'field';
      messageText = `A record with this ${key} already exists`;
    }
    // Invalid ObjectId cast
    else if (e.name === 'CastError') {
      statusCode = 400;
      code = 'INVALID_ID';
      messageText = 'Invalid identifier';
    }
    // Multer file upload errors
    else if (e.name === 'MulterError') {
      statusCode = 400;
      code = (e.code as string) || 'UPLOAD_ERROR';
      if (e.code === 'LIMIT_FILE_SIZE') {
        messageText = 'File is too large. Maximum allowed size is 3MB.';
      } else {
        messageText = (e.message as string) || 'File upload error';
      }
    }
  }

  if (statusCode >= 500) {
    logger.error('Unhandled error', err);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: messageText,
      ...(details ? { details } : {}),
      ...(!env.isProd && statusCode >= 500 && err instanceof Error ? { stack: err.stack } : {}),
    },
  });
}
