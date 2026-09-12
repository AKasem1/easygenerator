import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ulid } from 'ulid';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Runs before the router so unmatched routes get an id too. pino reuses whatever
 * this sets, rather than generating a second one.
 */
export function requestId(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : ulid();

    req.id = id;
    res.setHeader(REQUEST_ID_HEADER, id);
    next();
  };
}

/** `req.id` is typed as pino's ReqId (string | number | object). */
export function readRequestId(req: Request): string | undefined {
  return typeof req.id === 'string' || typeof req.id === 'number' ? String(req.id) : undefined;
}
