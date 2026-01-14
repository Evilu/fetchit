import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../cache/cache.service';
import { CacheKeys, CacheTTL } from '../cache/cache-keys';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { GroupResponseDto } from './dto/group-response.dto';
import { GroupStatus } from '@prisma/client';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<GroupResponseDto>> {
    const { limit, offset } = query;
    const cacheKey = CacheKeys.groupsListKey(limit, offset);

    // Try cache first
    const cached = await this.cacheService.get<PaginatedResponseDto<GroupResponseDto>>(cacheKey);
    if (cached) {
      return cached;
    }

    const [groups, total] = await Promise.all([
      this.prisma.group.findMany({
        take: limit,
        skip: offset,
        orderBy: { id: 'asc' },
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.group.count(),
    ]);

    const result = new PaginatedResponseDto(groups, limit, offset, total);

    // Cache the result
    await this.cacheService.set(cacheKey, result, CacheTTL.GROUPS_LIST);

    return result;
  }

  async removeUserFromGroup(groupId: number, userId: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Verify group exists
      const group = await tx.group.findUnique({
        where: { id: groupId },
        select: { id: true },
      });

      if (!group) {
        throw new NotFoundException(`Group with ID ${groupId} not found`);
      }

      // Verify user exists
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, groupId: true },
      });

      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      // Check if user is in the specified group
      if (user.groupId !== groupId) {
        throw new ConflictException(
          `User ${userId} is not a member of group ${groupId}`,
        );
      }

      // Lock the group row to prevent race conditions
      await tx.$queryRaw`SELECT id FROM "groups" WHERE id = ${groupId} FOR UPDATE`;

      // Remove user from group
      await tx.user.update({
        where: { id: userId },
        data: { groupId: null },
      });

      // Check if group is now empty
      const remainingMembers = await tx.user.count({
        where: { groupId: groupId },
      });

      // Update group status to empty if no members remain
      if (remainingMembers === 0) {
        await tx.group.update({
          where: { id: groupId },
          data: { status: GroupStatus.empty },
        });
      }
    });

    // Invalidate both caches after successful removal
    await Promise.all([
      this.cacheService.invalidateUsersCache(),
      this.cacheService.invalidateGroupsCache(),
    ]);
  }
}
