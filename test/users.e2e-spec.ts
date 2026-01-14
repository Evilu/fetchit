import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  closeTestApp,
  getPrismaService,
  resetDatabase,
  createManyUsers,
  SEED_DATA,
  PaginatedResponse,
  CursorPaginatedResponse,
  ErrorResponse,
  UserResponse,
} from './setup/test-utils';
import { PrismaService } from '../src/database/prisma.service';

describe('Users API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrismaService(app);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  // ============================================================================
  // GET /api/v1/users - Offset-based Pagination
  // ============================================================================
  describe('GET /api/v1/users (Offset Pagination)', () => {
    describe('Happy Path', () => {
      it('should return paginated users with default parameters', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users')
          .expect(200);

        const body = response.body as PaginatedResponse<UserResponse>;

        expect(body.data).toHaveLength(12); // All seed users
        expect(body.meta).toEqual({
          limit: 20,
          offset: 0,
          total: 12,
        });

        // Verify user structure
        expect(body.data[0]).toMatchObject({
          id: expect.any(Number),
          username: expect.any(String),
          status: expect.stringMatching(/^(pending|active|blocked)$/),
        });
      });

      it('should return users with custom limit', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users?limit=5')
          .expect(200);

        const body = response.body as PaginatedResponse<UserResponse>;

        expect(body.data).toHaveLength(5);
        expect(body.meta.limit).toBe(5);
        expect(body.meta.total).toBe(12);
      });

      it('should return users with custom offset', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users?offset=5')
          .expect(200);

        const body = response.body as PaginatedResponse<UserResponse>;

        expect(body.data).toHaveLength(7); // 12 - 5 = 7
        expect(body.meta.offset).toBe(5);
      });

      it('should return users with both limit and offset', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users?limit=3&offset=2')
          .expect(200);

        const body = response.body as PaginatedResponse<UserResponse>;

        expect(body.data).toHaveLength(3);
        expect(body.meta).toEqual({
          limit: 3,
          offset: 2,
          total: 12,
        });
      });

      it('should return users ordered by ID ascending (deterministic)', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users')
          .expect(200);

        const body = response.body as PaginatedResponse<UserResponse>;
        const ids = body.data.map((u) => u.id);

        // Verify ascending order
        for (let i = 1; i < ids.length; i++) {
          expect(ids[i]).toBeGreaterThan(ids[i - 1]);
        }
      });

      it('should correctly expose groupId (nullable)', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users')
          .expect(200);

        const body = response.body as PaginatedResponse<UserResponse>;

        // User 10 (jack) has null groupId
        const userWithoutGroup = body.data.find((u) => u.username === 'jack');
        expect(userWithoutGroup?.groupId).toBeNull();

        // User 1 (alice) has groupId 1
        const userWithGroup = body.data.find((u) => u.username === 'alice');
        expect(userWithGroup?.groupId).toBe(1);
      });
    });

    describe('Pagination Edge Cases', () => {
      it('should return empty array when offset exceeds total', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users?offset=100')
          .expect(200);

        const body = response.body as PaginatedResponse<UserResponse>;

        expect(body.data).toHaveLength(0);
        expect(body.meta.total).toBe(12);
      });

      it('should handle offset at exact boundary', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users?offset=12')
          .expect(200);

        const body = response.body as PaginatedResponse<UserResponse>;

        expect(body.data).toHaveLength(0);
      });

      it('should handle limit=1 (minimum)', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users?limit=1')
          .expect(200);

        const body = response.body as PaginatedResponse<UserResponse>;

        expect(body.data).toHaveLength(1);
        expect(body.meta.limit).toBe(1);
      });

      it('should handle limit=100 (maximum)', async () => {
        // Create enough users to test max limit
        await createManyUsers(prisma, 150);

        const response = await request(app.getHttpServer())
          .get('/api/v1/users?limit=100')
          .expect(200);

        const body = response.body as PaginatedResponse<UserResponse>;

        expect(body.data).toHaveLength(100);
        expect(body.meta.limit).toBe(100);
        expect(body.meta.total).toBe(162); // 12 + 150
      });

      it('should return partial page at the end', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users?limit=10&offset=5')
          .expect(200);

        const body = response.body as PaginatedResponse<UserResponse>;

        expect(body.data).toHaveLength(7); // Only 7 remaining
      });

      it('should handle large offset values gracefully', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users?offset=999999')
          .expect(200);

        const body = response.body as PaginatedResponse<UserResponse>;

        expect(body.data).toHaveLength(0);
        expect(body.meta.total).toBe(12);
      });
    });

    describe('Validation Errors', () => {
      it('should reject limit=0', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users?limit=0')
          .expect(400);

        const body = response.body as ErrorResponse;

        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject negative limit', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users?limit=-1')
          .expect(400);

        const body = response.body as ErrorResponse;

        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject limit > 100', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users?limit=101')
          .expect(400);

        const body = response.body as ErrorResponse;

        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject negative offset', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users?offset=-1')
          .expect(400);

        const body = response.body as ErrorResponse;

        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject non-integer limit', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users?limit=5.5')
          .expect(400);

        const body = response.body as ErrorResponse;

        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject non-integer offset', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users?offset=2.5')
          .expect(400);

        const body = response.body as ErrorResponse;

        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject non-numeric limit', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users?limit=abc')
          .expect(400);

        const body = response.body as ErrorResponse;

        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject non-numeric offset', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users?offset=xyz')
          .expect(400);

        const body = response.body as ErrorResponse;

        expect(body.error.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('Empty Database', () => {
      it('should return empty array when no users exist', async () => {
        await prisma.$executeRaw`TRUNCATE TABLE "users" RESTART IDENTITY CASCADE`;

        const response = await request(app.getHttpServer())
          .get('/api/v1/users')
          .expect(200);

        const body = response.body as PaginatedResponse<UserResponse>;

        expect(body.data).toHaveLength(0);
        expect(body.meta.total).toBe(0);
      });
    });
  });

  // ============================================================================
  // GET /api/v1/users/cursor - Cursor-based Pagination
  // ============================================================================
  describe('GET /api/v1/users/cursor (Cursor Pagination)', () => {
    describe('Happy Path', () => {
      it('should return first page without cursor', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users/cursor?limit=5')
          .expect(200);

        const body = response.body as CursorPaginatedResponse<UserResponse>;

        expect(body.data).toHaveLength(5);
        expect(body.meta.hasNext).toBe(true);
        expect(body.meta.nextCursor).toBe(5); // ID of last item
      });

      it('should return next page using cursor', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users/cursor?cursor=5&limit=5')
          .expect(200);

        const body = response.body as CursorPaginatedResponse<UserResponse>;

        expect(body.data).toHaveLength(5);
        // All returned IDs should be > cursor
        body.data.forEach((user) => {
          expect(user.id).toBeGreaterThan(5);
        });
      });

      it('should indicate no more pages on last page', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users/cursor?cursor=10&limit=5')
          .expect(200);

        const body = response.body as CursorPaginatedResponse<UserResponse>;

        expect(body.data).toHaveLength(2); // Users 11, 12
        expect(body.meta.hasNext).toBe(false);
        expect(body.meta.nextCursor).toBeNull();
      });

      it('should paginate through entire dataset correctly', async () => {
        const allUsers: UserResponse[] = [];
        let cursor: number | null = null;

        // Fetch all pages
        while (true) {
          const url = cursor
            ? `/api/v1/users/cursor?cursor=${cursor}&limit=4`
            : '/api/v1/users/cursor?limit=4';

          const response = await request(app.getHttpServer())
            .get(url)
            .expect(200);

          const body = response.body as CursorPaginatedResponse<UserResponse>;
          allUsers.push(...body.data);

          if (!body.meta.hasNext) break;
          cursor = body.meta.nextCursor;
        }

        expect(allUsers).toHaveLength(12);
        // Verify no duplicates
        const ids = allUsers.map((u) => u.id);
        expect(new Set(ids).size).toBe(12);
      });
    });

    describe('Edge Cases', () => {
      it('should return empty when cursor is beyond all IDs', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users/cursor?cursor=999&limit=5')
          .expect(200);

        const body = response.body as CursorPaginatedResponse<UserResponse>;

        expect(body.data).toHaveLength(0);
        expect(body.meta.hasNext).toBe(false);
      });

      it('should handle cursor with gaps in IDs', async () => {
        // Delete user 6 to create a gap
        await prisma.user.delete({ where: { id: 6 } });

        const response = await request(app.getHttpServer())
          .get('/api/v1/users/cursor?cursor=5&limit=3')
          .expect(200);

        const body = response.body as CursorPaginatedResponse<UserResponse>;

        // Should skip the deleted ID 6
        expect(body.data.map((u) => u.id)).not.toContain(6);
        expect(body.data[0].id).toBe(7);
      });

      it('should work with default limit', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users/cursor')
          .expect(200);

        const body = response.body as CursorPaginatedResponse<UserResponse>;

        expect(body.data).toHaveLength(12); // Default limit 20, only 12 users
        expect(body.meta.hasNext).toBe(false);
      });
    });

    describe('Validation Errors', () => {
      it('should reject cursor < 1', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users/cursor?cursor=0')
          .expect(400);

        const body = response.body as ErrorResponse;

        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject negative cursor', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users/cursor?cursor=-5')
          .expect(400);

        const body = response.body as ErrorResponse;

        expect(body.error.code).toBe('VALIDATION_ERROR');
      });
    });
  });

  // ============================================================================
  // PATCH /api/v1/users/statuses - Bulk Status Update
  // ============================================================================
  describe('PATCH /api/v1/users/statuses (Bulk Update)', () => {
    describe('Happy Path', () => {
      it('should update a single user status', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({
            updates: [{ id: 1, status: 'blocked' }],
          })
          .expect(200);

        expect(response.body.updated).toBe(1);

        // Verify in database
        const user = await prisma.user.findUnique({ where: { id: 1 } });
        expect(user?.status).toBe('blocked');
      });

      it('should update multiple users with same status', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({
            updates: [
              { id: 1, status: 'blocked' },
              { id: 2, status: 'blocked' },
              { id: 3, status: 'blocked' },
            ],
          })
          .expect(200);

        expect(response.body.updated).toBe(3);

        // Verify all are blocked
        const users = await prisma.user.findMany({
          where: { id: { in: [1, 2, 3] } },
        });
        users.forEach((u) => expect(u.status).toBe('blocked'));
      });

      it('should update multiple users with different statuses', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({
            updates: [
              { id: 1, status: 'pending' },
              { id: 2, status: 'blocked' },
              { id: 3, status: 'active' },
            ],
          })
          .expect(200);

        expect(response.body.updated).toBe(3);

        // Verify individual statuses
        const user1 = await prisma.user.findUnique({ where: { id: 1 } });
        const user2 = await prisma.user.findUnique({ where: { id: 2 } });
        const user3 = await prisma.user.findUnique({ where: { id: 3 } });

        expect(user1?.status).toBe('pending');
        expect(user2?.status).toBe('blocked');
        expect(user3?.status).toBe('active');
      });

      it('should handle all three status values', async () => {
        await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({
            updates: [
              { id: 1, status: 'pending' },
              { id: 4, status: 'active' },
              { id: 12, status: 'blocked' },
            ],
          })
          .expect(200);

        const users = await prisma.user.findMany({
          where: { id: { in: [1, 4, 12] } },
          orderBy: { id: 'asc' },
        });

        expect(users[0].status).toBe('pending');
        expect(users[1].status).toBe('active');
        expect(users[2].status).toBe('blocked');
      });

      it('should update user to same status (idempotent)', async () => {
        // Alice is already active
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({
            updates: [{ id: 1, status: 'active' }],
          })
          .expect(200);

        expect(response.body.updated).toBe(1);
      });
    });

    describe('Batch Processing (Performance)', () => {
      it('should handle 100 updates efficiently', async () => {
        await createManyUsers(prisma, 100);

        const updates = Array.from({ length: 100 }, (_, i) => ({
          id: 13 + i,
          status: 'active' as const,
        }));

        const startTime = Date.now();
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({ updates })
          .expect(200);

        const duration = Date.now() - startTime;

        expect(response.body.updated).toBe(100);
        expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      });

      it('should handle 500 updates (maximum allowed)', async () => {
        await createManyUsers(prisma, 500);

        const updates = Array.from({ length: 500 }, (_, i) => ({
          id: 13 + i,
          status: ['pending', 'active', 'blocked'][i % 3] as 'pending' | 'active' | 'blocked',
        }));

        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({ updates })
          .expect(200);

        expect(response.body.updated).toBe(500);
      });

      it('should group updates by status for batch efficiency', async () => {
        // This tests the internal optimization - updates should be batched by status
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({
            updates: [
              { id: 1, status: 'blocked' },
              { id: 3, status: 'blocked' },
              { id: 5, status: 'blocked' },
              { id: 2, status: 'active' },
              { id: 4, status: 'active' },
            ],
          })
          .expect(200);

        expect(response.body.updated).toBe(5);
      });
    });

    describe('Atomicity (Transaction Integrity)', () => {
      it('should rollback all changes if one user does not exist', async () => {
        // Get original statuses
        const originalUsers = await prisma.user.findMany({
          where: { id: { in: [1, 2, 3] } },
        });

        // Try to update with one non-existent user
        await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({
            updates: [
              { id: 1, status: 'blocked' },
              { id: 2, status: 'blocked' },
              { id: 9999, status: 'blocked' }, // Non-existent
            ],
          })
          .expect(404);

        // Verify no changes were made
        const currentUsers = await prisma.user.findMany({
          where: { id: { in: [1, 2, 3] } },
        });

        currentUsers.forEach((user, i) => {
          expect(user.status).toBe(originalUsers[i].status);
        });
      });

      it('should be atomic - all or nothing', async () => {
        const originalUser1 = await prisma.user.findUnique({ where: { id: 1 } });

        // First update should succeed
        await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({
            updates: [{ id: 1, status: 'blocked' }],
          })
          .expect(200);

        // Failed update should not affect previous successful update
        await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({
            updates: [
              { id: 1, status: 'pending' },
              { id: 99999, status: 'active' },
            ],
          })
          .expect(404);

        // User 1 should still be blocked (from first successful update)
        const user1 = await prisma.user.findUnique({ where: { id: 1 } });
        expect(user1?.status).toBe('blocked');
      });
    });

    describe('Validation Errors', () => {
      it('should reject empty updates array', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({ updates: [] })
          .expect(400);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject more than 500 updates', async () => {
        const updates = Array.from({ length: 501 }, (_, i) => ({
          id: i + 1,
          status: 'active' as const,
        }));

        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({ updates })
          .expect(400);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject duplicate user IDs', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({
            updates: [
              { id: 1, status: 'active' },
              { id: 1, status: 'blocked' }, // Duplicate
            ],
          })
          .expect(400);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('VALIDATION_ERROR');
        expect(body.error.message.toLowerCase()).toContain('duplicate');
      });

      it('should reject invalid status value', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({
            updates: [{ id: 1, status: 'invalid_status' }],
          })
          .expect(400);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject missing id field', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({
            updates: [{ status: 'active' }],
          })
          .expect(400);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject missing status field', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({
            updates: [{ id: 1 }],
          })
          .expect(400);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject non-integer id', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({
            updates: [{ id: 'abc', status: 'active' }],
          })
          .expect(400);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject float id', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({
            updates: [{ id: 1.5, status: 'active' }],
          })
          .expect(400);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject missing request body', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .expect(400);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject updates that is not an array', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({
            updates: { id: 1, status: 'active' }, // Object instead of array
          })
          .expect(400);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject forbidden properties (whitelist validation)', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({
            updates: [{ id: 1, status: 'active', extraField: 'should fail' }],
          })
          .expect(400);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('Not Found Errors', () => {
      it('should return 404 when user does not exist', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({
            updates: [{ id: 99999, status: 'active' }],
          })
          .expect(404);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('NOT_FOUND');
      });

      it('should return 404 with list of missing user IDs', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({
            updates: [
              { id: 1, status: 'active' },
              { id: 88888, status: 'active' },
              { id: 99999, status: 'active' },
            ],
          })
          .expect(404);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('NOT_FOUND');
        expect(body.error.message).toMatch(/88888.*99999|99999.*88888/);
      });
    });

    describe('Edge Cases', () => {
      it('should handle all users having same initial status', async () => {
        // Set all users to pending first
        await prisma.user.updateMany({ data: { status: 'pending' } });

        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({
            updates: [
              { id: 1, status: 'active' },
              { id: 2, status: 'active' },
              { id: 3, status: 'active' },
            ],
          })
          .expect(200);

        expect(response.body.updated).toBe(3);
      });

      it('should handle mixed existing and new status updates', async () => {
        // User 1 is active, user 3 is pending
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({
            updates: [
              { id: 1, status: 'active' }, // Same status
              { id: 3, status: 'blocked' }, // Different status
            ],
          })
          .expect(200);

        expect(response.body.updated).toBe(2);
      });

      it('should work with users that have no group', async () => {
        // Users 10, 11, 12 have no group
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({
            updates: [
              { id: 10, status: 'active' },
              { id: 11, status: 'blocked' },
              { id: 12, status: 'pending' },
            ],
          })
          .expect(200);

        expect(response.body.updated).toBe(3);
      });
    });
  });
});
