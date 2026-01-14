import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  ValidateNested,
} from 'class-validator';
import { UserStatus } from '@prisma/client';

export class UserStatusUpdateDto {
  @ApiProperty({ description: 'User ID to update' })
  @IsInt()
  id: number;

  @ApiProperty({
    enum: ['pending', 'active', 'blocked'],
    description: 'New status for the user',
  })
  @IsEnum(UserStatus)
  status: UserStatus;
}

export class BulkUpdateStatusesDto {
  @ApiProperty({
    type: [UserStatusUpdateDto],
    description: 'Array of user status updates (max 500)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => UserStatusUpdateDto)
  updates: UserStatusUpdateDto[];
}

export class BulkUpdateResponseDto {
  @ApiProperty({ description: 'Number of users updated' })
  updated: number;
}
