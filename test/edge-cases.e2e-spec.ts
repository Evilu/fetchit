import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  closeTestApp,
  getPrismaService,
  resetDatabase,
  createManyUsers,
  createGroupWithSingleUser,
  ErrorResponse,
} from './setup/test-utils';
import { PrismaService } from '../src/database/prisma.service';

describe('Edge Cases & Hidden Requirements (e2e)', () => {
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
  // Hidden Requirement: Group Status Transition
  // ============================================================================
  describe('Group Status Transition (Critical Hidden Requirement)', () => {
    it('should atomically update group status when last user removed', async () => {
      const { groupId, userId } = await createGroupWithSingleUser(prisma);

      // Verify initial state
      let group = await prisma.group.findUnique({ where: { id: groupId } });
      expect(group?.status).toBe('notEmpty');

      // Remove last user
      await request(app.getHttpServer())
        .delete(`/api/v1/groups/${groupId}/users/${userId}`)
        .expect(204);

      // Verify final state
      group = await prisma.group.findUnique({ where: { id: groupId } });
      expect(group?.status).toBe('empty');

      // User should have null groupId
      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user?.groupId).toBeNull();
    });

    it('should NOT transition status when removing from multi-member group', async () => {
      // Engineering has 3 members
      const groupId = 1;

      // Remove first member
      await request(app.getHttpServer())
        .delete(`/api/v1/groups/${groupId}/users/1`)
        .expect(204);

      // Group should still be notEmpty
      const group = await prisma.group.findUnique({ where: { id: groupId } });
      expect(group?.status).toBe('notEmpty');
    });

    it('should properly count remaining members before status change', async () => {
      // Create group with exactly 2 members
      const group = await prisma.group.create({
        data: { name: 'TwoMemberGroup', status: 'notEmpty' },
      });

      const users = await prisma.user.createMany({
        data: [
          { username: 'member1', status: 'active', groupId: group.id },
          { username: 'member2', status: 'active', groupId: group.id },
        ],
      });

      const createdUsers = await prisma.user.findMany({
        where: { groupId: group.id },
      });

      // Remove first member
      await request(app.getHttpServer())
        .delete(`/api/v1/groups/${group.id}/users/${createdUsers[0].id}`)
        .expect(204);

      let updatedGroup = await prisma.group.findUnique({
        where: { id: group.id },
      });
      expect(updatedGroup?.status).toBe('notEmpty'); // Still has 1 member

      // Remove second (last) member
      await request(app.getHttpServer())
        .delete(`/api/v1/groups/${group.id}/users/${createdUsers[1].id}`)
        .expect(204);

      updatedGroup = await prisma.group.findUnique({ where: { id: group.id } });
      expect(updatedGroup?.status).toBe('empty'); // Now empty
    });
  });

  // ============================================================================
  // Transaction Atomicity Tests
  // ============================================================================
  describe('Transaction Atomicity (Database Integrity)', () => {
    it('should rollback bulk update if ANY user not found', async () => {
      // Get original states
      const originalUsers = await prisma.user.findMany({
        where: { id: { in: [1, 2, 3] } },
        orderBy: { id: 'asc' },
      });

      // Try bulk update with one invalid user
      await request(app.getHttpServer())
        .patch('/api/v1/users/statuses')
        .send({
          updates: [
            { id: 1, status: 'blocked' },
            { id: 2, status: 'blocked' },
            { id: 99999, status: 'blocked' }, // Doesn't exist
          ],
        })
        .expect(404);

      // Verify NO changes were made (rollback)
      const currentUsers = await prisma.user.findMany({
        where: { id: { in: [1, 2, 3] } },
        orderBy: { id: 'asc' },
      });

      expect(currentUsers[0].status).toBe(originalUsers[0].status);
      expect(currentUsers[1].status).toBe(originalUsers[1].status);
    });

    it('should complete bulk update as atomic unit', async () => {
      // Successful bulk update should change all at once
      await request(app.getHttpServer())
        .patch('/api/v1/users/statuses')
        .send({
          updates: [
            { id: 1, status: 'blocked' },
            { id: 2, status: 'blocked' },
            { id: 3, status: 'blocked' },
          ],
        })
        .expect(200);

      // All should be updated
      const users = await prisma.user.findMany({
        where: { id: { in: [1, 2, 3] } },
      });

      users.forEach((u) => expect(u.status).toBe('blocked'));
    });

    it('should handle remove user with proper row locking', async () => {
      const { groupId, userId } = await createGroupWithSingleUser(prisma);

      // This tests that the transaction properly locks the row
      await request(app.getHttpServer())
        .delete(`/api/v1/groups/${groupId}/users/${userId}`)
        .expect(204);

      // Verify consistent state
      const [user, group] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId } }),
        prisma.group.findUnique({ where: { id: groupId } }),
      ]);

      // Both should be in consistent state
      expect(user?.groupId).toBeNull();
      expect(group?.status).toBe('empty');
    });
  });

  // ============================================================================
  // Boundary Value Testing
  // ============================================================================
  describe('Boundary Values', () => {
    describe('Pagination Limits', () => {
      it('should accept limit=1 (minimum)', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users?limit=1')
          .expect(200);

        expect(response.body.data).toHaveLength(1);
      });

      it('should accept limit=100 (maximum)', async () => {
        await createManyUsers(prisma, 100);

        const response = await request(app.getHttpServer())
          .get('/api/v1/users?limit=100')
          .expect(200);

        expect(response.body.data).toHaveLength(100);
      });

      it('should reject limit=0', async () => {
        await request(app.getHttpServer())
          .get('/api/v1/users?limit=0')
          .expect(400);
      });

      it('should reject limit=101', async () => {
        await request(app.getHttpServer())
          .get('/api/v1/users?limit=101')
          .expect(400);
      });

      it('should accept offset=0', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users?offset=0')
          .expect(200);

        expect(response.body.meta.offset).toBe(0);
      });

      it('should handle very large offset gracefully', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users?offset=1000000')
          .expect(200);

        expect(response.body.data).toHaveLength(0);
        expect(response.body.meta.total).toBe(12);
      });
    });

    describe('Bulk Update Limits', () => {
      it('should accept exactly 1 update (minimum)', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({ updates: [{ id: 1, status: 'active' }] })
          .expect(200);

        expect(response.body.updated).toBe(1);
      });

      it('should accept exactly 500 updates (maximum)', async () => {
        await createManyUsers(prisma, 500);

        const updates = Array.from({ length: 500 }, (_, i) => ({
          id: 13 + i,
          status: 'active' as const,
        }));

        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({ updates })
          .expect(200);

        expect(response.body.updated).toBe(500);
      });

      it('should reject 0 updates', async () => {
        await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({ updates: [] })
          .expect(400);
      });

      it('should reject 501 updates', async () => {
        const updates = Array.from({ length: 501 }, (_, i) => ({
          id: i + 1,
          status: 'active' as const,
        }));

        await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({ updates })
          .expect(400);
      });
    });

    describe('ID Boundaries', () => {
      it('should reject userId=0 in path', async () => {
        await request(app.getHttpServer())
          .delete('/api/v1/groups/1/users/0')
          .expect(400);
      });

      it('should reject groupId=0 in path', async () => {
        await request(app.getHttpServer())
          .delete('/api/v1/groups/0/users/1')
          .expect(400);
      });

      it('should handle very large IDs gracefully', async () => {
        await request(app.getHttpServer())
          .delete('/api/v1/groups/999999999/users/1')
          .expect(404);
      });
    });
  });

  // ============================================================================
  // Data Integrity Edge Cases
  // ============================================================================
  describe('Data Integrity Edge Cases', () => {
    it('should handle user with null groupId correctly', async () => {
      // Users 10, 11, 12 have null groupId
      const response = await request(app.getHttpServer())
        .get('/api/v1/users')
        .expect(200);

      const usersWithoutGroup = response.body.data.filter(
        (u: { groupId: number | null }) => u.groupId === null,
      );

      expect(usersWithoutGroup.length).toBe(3);
    });

    it('should not allow removing user from wrong group', async () => {
      // Alice is in group 1, try to remove from group 2
      const response = await request(app.getHttpServer())
        .delete('/api/v1/groups/2/users/1')
        .expect(409);

      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('should not allow removing user with null groupId', async () => {
      // Jack (id 10) has null groupId
      const response = await request(app.getHttpServer())
        .delete('/api/v1/groups/1/users/10')
        .expect(409);

      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('should handle duplicate status update (idempotent)', async () => {
      // Alice is already active
      await request(app.getHttpServer())
        .patch('/api/v1/users/statuses')
        .send({ updates: [{ id: 1, status: 'active' }] })
        .expect(200);

      // Should still report as updated
      const user = await prisma.user.findUnique({ where: { id: 1 } });
      expect(user?.status).toBe('active');
    });
  });

  // ============================================================================
  // Concurrent Operations
  // ============================================================================
  describe('Concurrent Operations', () => {
    it('should handle concurrent reads safely', async () => {
      const requests = Array.from({ length: 10 }, () =>
        request(app.getHttpServer()).get('/api/v1/users'),
      );

      const responses = await Promise.all(requests);

      // All should succeed with same data
      responses.forEach((r) => {
        expect(r.status).toBe(200);
        expect(r.body.data.length).toBe(12);
      });
    });

    it('should handle concurrent writes with proper isolation', async () => {
      // Update different users concurrently
      const requests = [
        request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({ updates: [{ id: 1, status: 'blocked' }] }),
        request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({ updates: [{ id: 2, status: 'pending' }] }),
        request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({ updates: [{ id: 3, status: 'active' }] }),
      ];

      const responses = await Promise.all(requests);

      // All should succeed
      responses.forEach((r) => expect(r.status).toBe(200));

      // Verify final state
      const users = await prisma.user.findMany({
        where: { id: { in: [1, 2, 3] } },
        orderBy: { id: 'asc' },
      });

      expect(users[0].status).toBe('blocked');
      expect(users[1].status).toBe('pending');
      expect(users[2].status).toBe('active');
    });

    it('should serialize concurrent removals from same group', async () => {
      // Create group with 3 users
      const group = await prisma.group.create({
        data: { name: 'ConcurrentRemovalGroup', status: 'notEmpty' },
      });

      const users = await Promise.all([
        prisma.user.create({
          data: { username: 'concurrent1', status: 'active', groupId: group.id },
        }),
        prisma.user.create({
          data: { username: 'concurrent2', status: 'active', groupId: group.id },
        }),
        prisma.user.create({
          data: { username: 'concurrent3', status: 'active', groupId: group.id },
        }),
      ]);

      // Remove all concurrently
      const requests = users.map((u) =>
        request(app.getHttpServer()).delete(
          `/api/v1/groups/${group.id}/users/${u.id}`,
        ),
      );

      const responses = await Promise.all(requests);

      // All should succeed
      responses.forEach((r) => expect(r.status).toBe(204));

      // Final state should be consistent
      const finalGroup = await prisma.group.findUnique({
        where: { id: group.id },
      });
      expect(finalGroup?.status).toBe('empty');

      const finalUsers = await prisma.user.findMany({
        where: { id: { in: users.map((u) => u.id) } },
      });
      finalUsers.forEach((u) => expect(u.groupId).toBeNull());
    });
  });

  // ============================================================================
  // Special Characters & Unicode
  // ============================================================================
  describe('Special Characters Handling', () => {
    it('should handle usernames with special characters', async () => {
      // Create user with special characters
      const user = await prisma.user.create({
        data: {
          username: "test'user\"with<special>&chars",
          status: 'active',
          groupId: null,
        },
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/users')
        .expect(200);

      const foundUser = response.body.data.find(
        (u: { id: number }) => u.id === user.id,
      );
      expect(foundUser.username).toBe("test'user\"with<special>&chars");
    });

    it('should handle unicode usernames', async () => {
      const user = await prisma.user.create({
        data: {
          username: '用户名テスト🚀',
          status: 'active',
          groupId: null,
        },
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/users')
        .expect(200);

      const foundUser = response.body.data.find(
        (u: { id: number }) => u.id === user.id,
      );
      expect(foundUser.username).toBe('用户名テスト🚀');
    });

    it('should handle group names with special characters', async () => {
      const group = await prisma.group.create({
        data: {
          name: "Team <Alpha> & 'Beta'",
          status: 'empty',
        },
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/groups')
        .expect(200);

      const foundGroup = response.body.data.find(
        (g: { id: number }) => g.id === group.id,
      );
      expect(foundGroup.name).toBe("Team <Alpha> & 'Beta'");
    });
  });

  // ============================================================================
  // Empty State Handling
  // ============================================================================
  describe('Empty State Handling', () => {
    it('should handle empty users table', async () => {
      await prisma.$executeRaw`TRUNCATE TABLE "users" RESTART IDENTITY CASCADE`;

      const response = await request(app.getHttpServer())
        .get('/api/v1/users')
        .expect(200);

      expect(response.body.data).toHaveLength(0);
      expect(response.body.meta.total).toBe(0);
    });

    it('should handle empty groups table', async () => {
      await prisma.$executeRaw`TRUNCATE TABLE "users" RESTART IDENTITY CASCADE`;
      await prisma.$executeRaw`TRUNCATE TABLE "groups" RESTART IDENTITY CASCADE`;

      const response = await request(app.getHttpServer())
        .get('/api/v1/groups')
        .expect(200);

      expect(response.body.data).toHaveLength(0);
      expect(response.body.meta.total).toBe(0);
    });

    it('should fail gracefully when bulk updating with no users', async () => {
      await prisma.$executeRaw`TRUNCATE TABLE "users" RESTART IDENTITY CASCADE`;

      const response = await request(app.getHttpServer())
        .patch('/api/v1/users/statuses')
        .send({ updates: [{ id: 1, status: 'active' }] })
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  // ============================================================================
  // Status Enum Validation
  // ============================================================================
  describe('Status Enum Validation', () => {
    it('should accept valid user status: pending', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/statuses')
        .send({ updates: [{ id: 1, status: 'pending' }] })
        .expect(200);
    });

    it('should accept valid user status: active', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/statuses')
        .send({ updates: [{ id: 1, status: 'active' }] })
        .expect(200);
    });

    it('should accept valid user status: blocked', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/statuses')
        .send({ updates: [{ id: 1, status: 'blocked' }] })
        .expect(200);
    });

    it('should reject invalid user status', async () => {
      const invalidStatuses = [
        'PENDING', // uppercase
        'Active', // mixed case
        'suspended', // non-existent
        'deleted', // non-existent
        '', // empty
        null, // null
        123, // number
      ];

      for (const status of invalidStatuses) {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({ updates: [{ id: 1, status }] });

        expect(response.status).toBe(400);
      }
    });
  });

  // ============================================================================
  // Duplicate Detection
  // ============================================================================
  describe('Duplicate Detection in Bulk Updates', () => {
    it('should reject duplicate user IDs in single request', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/users/statuses')
        .send({
          updates: [
            { id: 1, status: 'active' },
            { id: 2, status: 'blocked' },
            { id: 1, status: 'pending' }, // Duplicate!
          ],
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message.toLowerCase()).toContain('duplicate');
    });

    it('should detect duplicates regardless of position', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/users/statuses')
        .send({
          updates: [
            { id: 5, status: 'active' },
            { id: 5, status: 'blocked' }, // Immediate duplicate
          ],
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ============================================================================
  // Performance Edge Cases
  // ============================================================================
  describe('Performance Edge Cases', () => {
    it('should handle large result sets efficiently', async () => {
      // Create 500 users
      await createManyUsers(prisma, 500);

      const startTime = Date.now();
      const response = await request(app.getHttpServer())
        .get('/api/v1/users?limit=100')
        .expect(200);

      const duration = Date.now() - startTime;

      expect(response.body.data).toHaveLength(100);
      expect(duration).toBeLessThan(2000); // Should complete in under 2 seconds
    });

    it('should handle bulk update of 500 users efficiently', async () => {
      await createManyUsers(prisma, 500);

      const updates = Array.from({ length: 500 }, (_, i) => ({
        id: 13 + i,
        status: ['pending', 'active', 'blocked'][i % 3] as
          | 'pending'
          | 'active'
          | 'blocked',
      }));

      const startTime = Date.now();
      const response = await request(app.getHttpServer())
        .patch('/api/v1/users/statuses')
        .send({ updates })
        .expect(200);

      const duration = Date.now() - startTime;

      expect(response.body.updated).toBe(500);
      expect(duration).toBeLessThan(10000); // Should complete in under 10 seconds
    });

    it('should handle cursor pagination through large dataset', async () => {
      await createManyUsers(prisma, 200);

      const allUsers: number[] = [];
      let cursor: number | null = null;
      let iterations = 0;
      const maxIterations = 50;

      while (iterations < maxIterations) {
        const url = cursor
          ? `/api/v1/users/cursor?cursor=${cursor}&limit=50`
          : '/api/v1/users/cursor?limit=50';

        const response = await request(app.getHttpServer()).get(url).expect(200);

        allUsers.push(...response.body.data.map((u: { id: number }) => u.id));

        if (!response.body.meta.hasNext) break;
        cursor = response.body.meta.nextCursor;
        iterations++;
      }

      // Should have fetched all 212 users (12 seed + 200 created)
      expect(allUsers.length).toBe(212);
      // No duplicates
      expect(new Set(allUsers).size).toBe(212);
    });
  });
});
