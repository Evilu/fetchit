import { ApiProperty } from '@nestjs/swagger';

export class PaginationMeta {
  @ApiProperty({ description: 'Number of items per page' })
  limit: number;

  @ApiProperty({ description: 'Number of items skipped' })
  offset: number;

  @ApiProperty({ description: 'Total number of items' })
  total: number;
}

export class PaginatedResponseDto<T> {
  @ApiProperty({ isArray: true })
  data: T[];

  @ApiProperty({ type: PaginationMeta })
  meta: PaginationMeta;

  constructor(data: T[], limit: number, offset: number, total: number) {
    this.data = data;
    this.meta = { limit, offset, total };
  }
}
