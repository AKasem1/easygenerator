import { ApiProperty } from '@nestjs/swagger';

export class PublicUserDto {
  @ApiProperty({ example: '6aa4af72dede05f19cb12418' })
  id!: string;

  @ApiProperty({ format: 'email', example: 'ada@example.com' })
  email!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  name!: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-12T01:48:34.737Z' })
  createdAt!: string;
}
