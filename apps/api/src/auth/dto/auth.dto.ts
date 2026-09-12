import { ApiProperty } from '@nestjs/swagger';

import { PublicUserDto } from '../../users/dto/user.dto';

/** Documentation only. Bodies are validated by the zod schemas in @shared. */
export class SignUpRequestDto {
  @ApiProperty({ format: 'email', example: 'ada@example.com' })
  email!: string;

  @ApiProperty({ minLength: 3, example: 'Ada Lovelace' })
  name!: string;

  @ApiProperty({
    minLength: 8,
    example: 'sup3r!secret',
    description:
      'At least 8 characters, with at least one letter, one number and one special character.',
  })
  password!: string;
}

export class SignInRequestDto {
  @ApiProperty({ format: 'email', example: 'ada@example.com' })
  email!: string;

  @ApiProperty({ example: 'sup3r!secret', description: 'Only required to be non-empty.' })
  password!: string;
}

export class AuthResponseDto {
  @ApiProperty({ type: PublicUserDto })
  user!: PublicUserDto;

  @ApiProperty({ description: 'JWT, 15 minute lifetime. Never set as a cookie.' })
  accessToken!: string;
}

export class RefreshResponseDto {
  @ApiProperty({ description: 'A fresh 15 minute JWT. The refresh cookie is rotated too.' })
  accessToken!: string;
}
