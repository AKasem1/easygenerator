import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { PublicUserDto } from './dto/user.dto';
import type { PublicUser } from './user.public';

@ApiTags('users')
@Controller('users')
export class UsersController {
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'The signed-in user',
    description: 'Covered by the global 100 requests per minute limit.',
  })
  @ApiOkResponse({ type: PublicUserDto })
  @ApiResponse({
    status: 401,
    description: 'UNAUTHORIZED — missing, expired or invalid access token',
    type: ApiErrorDto,
  })
  @ApiResponse({ status: 429, description: 'TOO_MANY_REQUESTS', type: ApiErrorDto })
  @ApiResponse({ status: 500, description: 'INTERNAL_ERROR', type: ApiErrorDto })
  me(@CurrentUser() user: PublicUser): PublicUser {
    return user;
  }
}
