import { Controller, Get } from '@nestjs/common';

/**
 * Excluded from the `api/v1` global prefix (see main.ts) so probes can hit a
 * stable, unversioned `/health`. When an auth guard is added globally, this
 * route must be marked public.
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
