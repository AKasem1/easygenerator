import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { HealthResponseDto } from './dto/health.dto';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({
    summary: 'Liveness probe',
    description: 'Served at /health, outside the api/v1 prefix.',
  })
  @ApiOkResponse({ type: HealthResponseDto })
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
