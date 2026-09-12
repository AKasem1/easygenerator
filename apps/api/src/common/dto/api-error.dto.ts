import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ERROR_CODES } from '@shared';

/** Documentation only. Requests are validated by the zod schemas in @shared. */
export class ApiErrorDto {
  @ApiProperty({ example: 401 })
  statusCode!: number;

  @ApiProperty({ enum: ERROR_CODES, example: 'UNAUTHORIZED' })
  errorCode!: string;

  @ApiProperty({ example: 'Unauthorized' })
  message!: string;

  @ApiProperty({ example: '01M2A5Q1W2JCPRM25AY9WWJ1NN' })
  requestId!: string;

  @ApiProperty({ example: '2026-09-12T02:53:34.602Z' })
  timestamp!: string;

  @ApiPropertyOptional({
    description: 'Present only on VALIDATION_FAILED: field name to its first message.',
    example: { password: 'Password must contain at least one number' },
    additionalProperties: { type: 'string' },
  })
  fields?: Record<string, string>;
}
