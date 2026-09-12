import type { Request, RequestHandler, Response } from 'express';

import { buildErrorBody } from './error-response';
import { readRequestId } from './request-id';

/**
 * Registered after the router. Without it an unmatched path falls through to
 * Express's default handler, which answers with HTML and no request id.
 */
export function notFoundHandler(): RequestHandler {
  return (req: Request, res: Response) => {
    res.status(404).json(
      buildErrorBody({
        statusCode: 404,
        errorCode: 'NOT_FOUND',
        message: 'Route not found',
        requestId: readRequestId(req),
      }),
    );
  };
}
