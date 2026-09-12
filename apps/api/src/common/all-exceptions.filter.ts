import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { ExceptionFilter } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

import type { ApiErrorResponse, ErrorCode } from '@shared';
import { AppException } from './app.exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: string }>();
    const response = http.getResponse<Response>();

    const { statusCode, errorCode, message, fields } = this.describe(exception);

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Full detail server-side only; the client gets the flat envelope below.
      this.logger.error({ err: exception, requestId: request.id }, 'Unhandled exception');
    }

    const body: ApiErrorResponse = {
      statusCode,
      errorCode,
      message,
      requestId: request.id ?? 'unknown',
      timestamp: new Date().toISOString(),
      ...(fields ? { fields } : {}),
    };

    response.status(statusCode).json(body);
  }

  private describe(exception: unknown): {
    statusCode: number;
    errorCode: ErrorCode;
    message: string;
    fields?: Record<string, string>;
  } {
    if (exception instanceof AppException) {
      return {
        statusCode: exception.getStatus(),
        errorCode: exception.errorCode,
        message: exception.message,
        fields: exception.fields,
      };
    }

    if (exception instanceof ThrottlerException) {
      return {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        errorCode: 'TOO_MANY_REQUESTS',
        message: 'Too many requests, please try again later',
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();

      if (status === HttpStatus.UNAUTHORIZED) {
        return { statusCode: status, errorCode: 'UNAUTHORIZED', message: 'Unauthorized' };
      }

      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        return {
          statusCode: status,
          errorCode: 'TOO_MANY_REQUESTS',
          message: 'Too many requests, please try again later',
        };
      }

      // Any other HttpException still gets a generic body: Nest's default
      // messages can name classes or echo input back at the caller.
      return {
        statusCode: status,
        errorCode:
          status < HttpStatus.INTERNAL_SERVER_ERROR ? 'VALIDATION_FAILED' : 'INTERNAL_ERROR',
        message:
          status < HttpStatus.INTERNAL_SERVER_ERROR
            ? 'Request could not be processed'
            : 'Internal server error',
      };
    }

    // Unknown throwable: never leak the stack, the driver text or the class name.
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: 'INTERNAL_ERROR',
      message: 'Internal server error',
    };
  }
}
