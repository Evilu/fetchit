import { Controller, Get, Patch, Query, Body, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { UserResponseDto } from './dto/user-response.dto';
import {
  BulkUpdateStatusesDto,
  BulkUpdateResponseDto,
} from './dto/bulk-update-statuses.dto';
import {
  CursorPaginationQueryDto,
  CursorPaginatedUsersResponseDto,
} from './dto/cursor-pagination.dto';
import { ErrorResponseDto } from '../common/dto/error-response.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all users with offset pagination' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items (1-100, default: 20)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Number of items to skip (default: 0)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of users',
    type: PaginatedResponseDto<UserResponseDto>,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid pagination parameters',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests',
    type: ErrorResponseDto,
  })
  async findAll(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<UserResponseDto>> {
    return this.usersService.findAll(query);
  }

  @Get('cursor')
  @ApiOperation({ summary: 'Get all users with cursor-based pagination (better for large datasets)' })
  @ApiQuery({ name: 'cursor', required: false, type: Number, description: 'Cursor from previous response' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items (1-100, default: 20)' })
  @ApiResponse({
    status: 200,
    description: 'Cursor-paginated list of users',
    type: CursorPaginatedUsersResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid pagination parameters',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests',
    type: ErrorResponseDto,
  })
  async findAllCursor(
    @Query() query: CursorPaginationQueryDto,
  ): Promise<CursorPaginatedUsersResponseDto> {
    return this.usersService.findAllCursor(query.cursor, query.limit);
  }

  @Patch('statuses')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 5, ttl: 1000 }, long: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Bulk update user statuses (max 500 updates, stricter rate limit)' })
  @ApiResponse({
    status: 200,
    description: 'Users updated successfully',
    type: BulkUpdateResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request body, too many updates, or duplicate IDs',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'One or more users not found',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests (stricter limit: 5/sec, 20/min)',
    type: ErrorResponseDto,
  })
  async bulkUpdateStatuses(
    @Body() dto: BulkUpdateStatusesDto,
  ): Promise<BulkUpdateResponseDto> {
    const updated = await this.usersService.bulkUpdateStatuses(dto);
    return { updated };
  }
}
