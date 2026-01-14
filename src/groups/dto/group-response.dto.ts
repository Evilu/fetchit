import { ApiProperty } from '@nestjs/swagger';
import { GroupStatus } from '@prisma/client';

export class GroupResponseDto {
  @ApiProperty({ description: 'Group ID' })
  id: number;

  @ApiProperty({ description: 'Group name' })
  name: string;

  @ApiProperty({ enum: ['empty', 'notEmpty'], description: 'Group status' })
  status: GroupStatus;
}
