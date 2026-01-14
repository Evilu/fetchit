import {
  Controller,
  Get,
  Delete,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { GroupsService } from './groups.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { GroupResponseDto } from './dto/group-response.dto';
import { ErrorResponseDto } from '../common/dto/error-response.dto';

@ApiTags('groups')
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all groups with pagination' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items (1-100, default: 20)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Number of items to skip (default: 0)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of groups',
    type: PaginatedResponseDto<GroupResponseDto>,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid pagination parameters',
    type: ErrorResponseDto,
  })
  async findAll(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<GroupResponseDto>> {
    return this.groupsService.findAll(query);
  }

  @Delete(':groupId/users/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a user from a group' })
  @ApiParam({ name: 'groupId', type: Number, description: 'Group ID' })
  @ApiParam({ name: 'userId', type: Number, description: 'User ID' })
  @ApiResponse({
    status: 204,
    description: 'User removed from group successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'User or group not found',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'User is not a member of the specified group',
    type: ErrorResponseDto,
  })
  async removeUserFromGroup(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<void> {
    await this.groupsService.removeUserFromGroup(groupId, userId);
  }
}
