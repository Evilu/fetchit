import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../cache/cache.service';
import { CacheKeys, CacheTTL } from '../cache/cache-keys';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { BulkUpdateStatusesDto } from './dto/bulk-update-statuses.dto';
import { UserStatus } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<UserResponseDto>> {
    const { limit, offset } = query;
    const cacheKey = CacheKeys.usersListKey(limit, offset);

    // Try cache first
    const cached = await this.cacheService.get<PaginatedResponseDto<UserResponseDto>>(cacheKey);
    if (cached) {
      return cached;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        take: limit,
        skip: offset,
        orderBy: { id: 'asc' },
        select: {
          id: true,
          username: true,
          status: true,
          groupId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.user.count(),
    ]);

    const result = new PaginatedResponseDto(users, limit, offset, total);

    // Cache the result
    await this.cacheService.set(cacheKey, result, CacheTTL.USERS_LIST);

    return result;
  }

  async findAllCursor(
    cursor?: number,
    limit: number = 20,
  ): Promise<{ data: UserResponseDto[]; meta: { nextCursor: number | null; hasNext: boolean } }> {
    const users = await this.prisma.user.findMany({
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        username: true,
        status: true,
        groupId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const hasNext = users.length > limit;
    const data = hasNext ? users.slice(0, -1) : users;

    return {
      data,
      meta: {
        nextCursor: hasNext ? data[data.length - 1].id : null,
        hasNext,
      },
    };
  }

  async bulkUpdateStatuses(dto: BulkUpdateStatusesDto): Promise<number> {
    const { updates } = dto;

    // Check for duplicate IDs
    const ids = updates.map((u) => u.id);
    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      throw new BadRequestException('Duplicate user IDs in request');
    }

    // Perform atomic transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Verify all users exist
      const existingUsers = await tx.user.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });

      if (existingUsers.length !== ids.length) {
        const existingIds = new Set(existingUsers.map((u) => u.id));
        const missingIds = ids.filter((id) => !existingIds.has(id));
        throw new NotFoundException(
          `Users not found: ${missingIds.join(', ')}`,
        );
      }

      // Group updates by status for efficient batch updates
      const updatesByStatus = new Map<UserStatus, number[]>();
      for (const update of updates) {
        const statusIds = updatesByStatus.get(update.status) || [];
        statusIds.push(update.id);
        updatesByStatus.set(update.status, statusIds);
      }

      // Execute batch updates per status
      for (const [status, userIds] of updatesByStatus) {
        await tx.user.updateMany({
          where: { id: { in: userIds } },
          data: { status },
        });
      }

      return updates.length;
    });

    // Invalidate cache after successful update
    await this.cacheService.invalidateUsersCache();

    return result;
  }
}
