import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { UserResponseDto } from './user-response.dto';

export class CursorPaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Cursor (ID of the last item from previous page)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cursor?: number;

  @ApiPropertyOptional({
    description: 'Number of items to return',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export class CursorPaginationMeta {
  @ApiProperty({ description: 'Cursor for next page', nullable: true })
  nextCursor: number | null;

  @ApiProperty({ description: 'Whether there are more items' })
  hasNext: boolean;
}

export class CursorPaginatedUsersResponseDto {
  @ApiProperty({ type: [UserResponseDto] })
  data: UserResponseDto[];

  @ApiProperty({ type: CursorPaginationMeta })
  meta: CursorPaginationMeta;
}
