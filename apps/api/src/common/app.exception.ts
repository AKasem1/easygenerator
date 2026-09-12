import { HttpException, HttpStatus } from '@nestjs/common';

import type { ErrorCode } from '@shared';

/**
 * Carries a stable errorCode alongside the status, so the filter never has to
 * infer a code by matching on message text.
 */
export class AppException extends HttpException {
  constructor(
    override readonly errorCode: ErrorCode,
    status: HttpStatus,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message, status);
  }
}

export class EmailAlreadyExistsException extends AppException {
  constructor() {
    super('EMAIL_ALREADY_EXISTS', HttpStatus.CONFLICT, 'Email already registered');
  }
}

export class InvalidCredentialsException extends AppException {
  constructor() {
    super('INVALID_CREDENTIALS', HttpStatus.UNAUTHORIZED, 'Invalid email or password');
  }
}

export class InvalidRefreshTokenException extends AppException {
  constructor() {
    super('INVALID_REFRESH_TOKEN', HttpStatus.UNAUTHORIZED, 'Invalid refresh token');
  }
}

export class ValidationFailedException extends AppException {
  constructor(fields: Record<string, string>) {
    super('VALIDATION_FAILED', HttpStatus.UNPROCESSABLE_ENTITY, 'Validation failed', fields);
  }
}
