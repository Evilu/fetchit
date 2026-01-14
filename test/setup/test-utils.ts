import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaService } from '../../src/database/prisma.service';
import { DatabaseModule } from '../../src/database/database.module';
import { UsersController } from '../../src/users/users.controller';
import { UsersService } from '../../src/users/users.service';
import { GroupsController } from '../../src/groups/groups.controller';
import { GroupsService } from '../../src/groups/groups.service';
import { HealthController } from '../../src/health/health.controller';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaHealthIndicator } from '../../src/health/prisma-health.indicator';
import { GlobalExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { LoggingInterceptor } from '../../src/common/interceptors/logging.interceptor';
import { CacheService } from '../../src/cache/cache.service';

/**
 * Test application setup utility
 * Creates a fully configured NestJS application for e2e testing
 * Uses in-memory cache instead of Redis
 * Throttler is disabled for most tests (rate-limiting tests handle it separately)
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: '.env',
      }),
      // ThrottlerModule is required but we don't add the guard
      // This allows @Throttle decorators to not throw but doesn't enforce limits
      ThrottlerModule.forRoot([
        {
          name: 'short',
          ttl: 1000,
          limit: 999999,
        },
        {
          name: 'long',
          ttl: 60000,
          limit: 999999,
        },
      ]),
      DatabaseModule,
      // Use in-memory cache for tests (no Redis needed)
      NestCacheModule.register({
        ttl: 30000,
        max: 100,
      }),
      TerminusModule,
    ],
    controllers: [UsersController, GroupsController, HealthController],
    providers: [
      UsersService,
      GroupsService,
      CacheService, // Uses the in-memory NestCacheModule.register()
      PrismaHealthIndicator,
      // NOTE: ThrottlerGuard is NOT added here - no rate limiting in tests
    ],
  }).compile();

  const app = moduleFixture.createNestApplication();

  // Apply same configuration as production
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  await app.init();
  return app;
}

/**
 * Get PrismaService from the application
 */
export function getPrismaService(app: INestApplication): PrismaService {
  return app.get(PrismaService);
}

/**
 * Seed data structure matching init.sql
 */
export const SEED_DATA = {
  groups: [
    { id: 1, name: 'Engineering', status: 'notEmpty' },
    { id: 2, name: 'Marketing', status: 'notEmpty' },
    { id: 3, name: 'Sales', status: 'notEmpty' },
    { id: 4, name: 'HR', status: 'empty' },
    { id: 5, name: 'Finance', status: 'notEmpty' },
  ],
  users: [
    { id: 1, username: 'alice', status: 'active', groupId: 1 },
    { id: 2, username: 'bob', status: 'active', groupId: 1 },
    { id: 3, username: 'charlie', status: 'pending', groupId: 1 },
    { id: 4, username: 'david', status: 'active', groupId: 2 },
    { id: 5, username: 'eve', status: 'blocked', groupId: 2 },
    { id: 6, username: 'frank', status: 'active', groupId: 3 },
    { id: 7, username: 'grace', status: 'pending', groupId: 3 },
    { id: 8, username: 'henry', status: 'active', groupId: 3 },
    { id: 9, username: 'ivy', status: 'active', groupId: 5 },
    { id: 10, username: 'jack', status: 'pending', groupId: null },
    { id: 11, username: 'karen', status: 'active', groupId: null },
    { id: 12, username: 'leo', status: 'blocked', groupId: null },
  ],
} as const;

/**
 * Reset database to initial seed state
 * Useful for test isolation
 */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  // Delete all data
  await prisma.$executeRaw`TRUNCATE TABLE "users" RESTART IDENTITY CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE "groups" RESTART IDENTITY CASCADE`;

  // Re-seed groups
  await prisma.$executeRaw`
    INSERT INTO "groups" (id, name, status, created_at, updated_at) VALUES
      (1, 'Engineering', 'notEmpty', NOW(), NOW()),
      (2, 'Marketing', 'notEmpty', NOW(), NOW()),
      (3, 'Sales', 'notEmpty', NOW(), NOW()),
      (4, 'HR', 'empty', NOW(), NOW()),
      (5, 'Finance', 'notEmpty', NOW(), NOW())
  `;

  // Re-seed users
  await prisma.$executeRaw`
    INSERT INTO "users" (id, username, status, group_id, created_at, updated_at) VALUES
      (1, 'alice', 'active', 1, NOW(), NOW()),
      (2, 'bob', 'active', 1, NOW(), NOW()),
      (3, 'charlie', 'pending', 1, NOW(), NOW()),
      (4, 'david', 'active', 2, NOW(), NOW()),
      (5, 'eve', 'blocked', 2, NOW(), NOW()),
      (6, 'frank', 'active', 3, NOW(), NOW()),
      (7, 'grace', 'pending', 3, NOW(), NOW()),
      (8, 'henry', 'active', 3, NOW(), NOW()),
      (9, 'ivy', 'active', 5, NOW(), NOW()),
      (10, 'jack', 'pending', NULL, NOW(), NOW()),
      (11, 'karen', 'active', NULL, NOW(), NOW()),
      (12, 'leo', 'blocked', NULL, NOW(), NOW())
  `;

  // Reset sequences
  await prisma.$executeRaw`SELECT setval('"groups_id_seq"', 5, true)`;
  await prisma.$executeRaw`SELECT setval('"users_id_seq"', 12, true)`;
}

/**
 * Create additional test users for pagination testing
 */
export async function createManyUsers(
  prisma: PrismaService,
  count: number,
  startId?: number,
): Promise<void> {
  const start = startId ?? 13;
  const values = Array.from({ length: count }, (_, i) => {
    const id = start + i;
    const statuses = ['pending', 'active', 'blocked'] as const;
    const status = statuses[i % 3];
    return `(${id}, 'testuser_${id}', '${status}', NULL, NOW(), NOW())`;
  }).join(',\n');

  await prisma.$executeRawUnsafe(`
    INSERT INTO "users" (id, username, status, group_id, created_at, updated_at) VALUES
    ${values}
  `);

  await prisma.$executeRaw`SELECT setval('"users_id_seq"', ${start + count - 1}, true)`;
}

/**
 * Create a group with a single user (for testing empty status transition)
 */
export async function createGroupWithSingleUser(
  prisma: PrismaService,
): Promise<{ groupId: number; userId: number }> {
  const group = await prisma.group.create({
    data: {
      name: 'SingleMemberGroup',
      status: 'notEmpty',
    },
  });

  const user = await prisma.user.create({
    data: {
      username: 'lonely_user',
      status: 'active',
      groupId: group.id,
    },
  });

  return { groupId: group.id, userId: user.id };
}

/**
 * Cleanup helper - close app gracefully
 */
export async function closeTestApp(app: INestApplication): Promise<void> {
  await app.close();
}

/**
 * Type helpers for test assertions
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface CursorPaginatedResponse<T> {
  data: T[];
  meta: {
    nextCursor: number | null;
    hasNext: boolean;
  };
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Array<{
      field: string;
      reason: string;
    }>;
  };
}

export interface UserResponse {
  id: number;
  username: string;
  status: 'pending' | 'active' | 'blocked';
  groupId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupResponse {
  id: number;
  name: string;
  status: 'empty' | 'notEmpty';
  createdAt: string;
  updatedAt: string;
}
