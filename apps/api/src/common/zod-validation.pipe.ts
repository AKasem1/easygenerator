import { Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

import { ValidationFailedException } from './app.exception';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const fields: Record<string, string> = {};

      // First message per field: the client attaches one error per input.
      for (const issue of result.error.issues) {
        const path = issue.path.join('.') || '_';
        fields[path] ??= issue.message;
      }

      throw new ValidationFailedException(fields);
    }

    return result.data;
  }
}
