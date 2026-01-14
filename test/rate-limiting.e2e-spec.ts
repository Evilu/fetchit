import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { TerminusModule } from '@nestjs/terminus';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
import { DatabaseModule } from '../src/database/database.module';
import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';
import { GroupsController } from '../src/groups/groups.controller';
import { GroupsService } from '../src/groups/groups.service';
import { HealthController } from '../src/health/health.controller';
import { PrismaHealthIndicator } from '../src/health/prisma-health.indicator';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';
import { CacheService } from '../src/cache/cache.service';
import { resetDatabase } from './setup/test-utils';

/**
 * Create test app WITH rate limiting enabled for rate limit testing
 */
async function createRateLimitedTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: '.env',
      }),
      ThrottlerModule.forRoot([
        {
          name: 'short',
          ttl: 1000,
          limit: 10, // Normal rate limits for testing
        },
        {
          name: 'long',
          ttl: 60000,
          limit: 100,
        },
      ]),
      DatabaseModule,
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
      CacheService,
      PrismaHealthIndicator,
      {
        provide: APP_GUARD,
        useClass: ThrottlerGuard,
      },
    ],
  }).compile();

  const app = moduleFixture.createNestApplication();
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
  await app.init();
  return app;
}

describe('Rate Limiting (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createRateLimitedTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    // Wait a bit between tests to reset rate limit windows
    await new Promise((resolve) => setTimeout(resolve, 1100));
  });

  // ============================================================================
  // Rate Limiting - General Endpoints
  // ============================================================================
  describe('General Rate Limiting', () => {
    it('should allow requests within rate limit', async () => {
      // Make several requests within the limit
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .get('/api/v1/users')
          .expect(200);
      }
    });

    it('should include rate limit headers in response', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users')
        .expect(200);

      // Throttler typically adds these headers
      // Note: Header names may vary based on configuration
      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
    });

    it('should return 429 when rate limit exceeded', async () => {
      // This test depends on your rate limit configuration
      // Default is 10 requests per second
      const requests = Array.from({ length: 15 }, () =>
        request(app.getHttpServer()).get('/api/v1/users'),
      );

      const responses = await Promise.all(requests);
      const tooManyRequests = responses.filter((r) => r.status === 429);

      // Some requests should be rate limited
      expect(tooManyRequests.length).toBeGreaterThan(0);
    });

    it('should include Retry-After header when rate limited', async () => {
      // Exhaust the rate limit
      const requests = Array.from({ length: 20 }, () =>
        request(app.getHttpServer()).get('/api/v1/users'),
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.find((r) => r.status === 429);

      if (rateLimited) {
        expect(rateLimited.headers).toHaveProperty('retry-after');
      }
    });
  });

  // ============================================================================
  // Rate Limiting - Bulk Status Update (Stricter Limits)
  // ============================================================================
  describe('Bulk Status Update Rate Limiting', () => {
    it('should have stricter rate limits for bulk operations', async () => {
      // Bulk update endpoint has stricter limits (5/sec, 20/min)
      const requests = Array.from({ length: 10 }, () =>
        request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({ updates: [{ id: 1, status: 'active' }] }),
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter((r) => r.status === 429);

      // Should hit rate limit sooner than general endpoints
      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should allow bulk updates within stricter limit', async () => {
      // 5 requests should be within the 5/sec limit
      for (let i = 0; i < 3; i++) {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({ updates: [{ id: 1, status: 'active' }] });

        expect(response.status).toBe(200);
        // Small delay between requests
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    });
  });

  // ============================================================================
  // Rate Limiting - Different Endpoints Independence
  // ============================================================================
  describe('Rate Limit Independence', () => {
    it('should track rate limits independently per endpoint', async () => {
      // Hit users endpoint multiple times
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .get('/api/v1/users')
          .expect(200);
      }

      // Groups endpoint should still work
      const groupsResponse = await request(app.getHttpServer())
        .get('/api/v1/groups')
        .expect(200);

      expect(groupsResponse.body.data).toBeDefined();
    });

    it('should not rate limit health endpoint as strictly', async () => {
      // Health checks should have higher limits or no limits
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .get('/api/v1/health')
          .expect(200);
      }
    });
  });

  // ============================================================================
  // Rate Limiting - Recovery
  // ============================================================================
  describe('Rate Limit Recovery', () => {
    it('should recover after rate limit window expires', async () => {
      // Exhaust rate limit
      const requests = Array.from({ length: 15 }, () =>
        request(app.getHttpServer()).get('/api/v1/users'),
      );
      await Promise.all(requests);

      // Wait for window to expire (1 second for short window)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should work again
      const response = await request(app.getHttpServer())
        .get('/api/v1/users')
        .expect(200);

      expect(response.body.data).toBeDefined();
    });
  });

  // ============================================================================
  // Rate Limiting - Error Response Format
  // ============================================================================
  describe('Rate Limit Error Format', () => {
    it('should return proper error format when rate limited', async () => {
      // Exhaust rate limit
      const requests = Array.from({ length: 20 }, () =>
        request(app.getHttpServer()).get('/api/v1/users'),
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.find((r) => r.status === 429);

      if (rateLimited) {
        expect(rateLimited.body).toHaveProperty('message');
        expect(rateLimited.body.message).toMatch(/too many requests/i);
      }
    });
  });
});
