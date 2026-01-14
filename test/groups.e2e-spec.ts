import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  closeTestApp,
  getPrismaService,
  resetDatabase,
  createGroupWithSingleUser,
  SEED_DATA,
  PaginatedResponse,
  ErrorResponse,
  GroupResponse,
} from './setup/test-utils';
import { PrismaService } from '../src/database/prisma.service';

describe('Groups API (e2e)', () => {
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
  // GET /api/v1/groups - Offset-based Pagination
  // ============================================================================
  describe('GET /api/v1/groups (Offset Pagination)', () => {
    describe('Happy Path', () => {
      it('should return paginated groups with default parameters', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/groups')
          .expect(200);

        const body = response.body as PaginatedResponse<GroupResponse>;

        expect(body.data).toHaveLength(5); // All seed groups
        expect(body.meta).toEqual({
          limit: 20,
          offset: 0,
          total: 5,
        });

        // Verify group structure
        expect(body.data[0]).toMatchObject({
          id: expect.any(Number),
          name: expect.any(String),
          status: expect.stringMatching(/^(empty|notEmpty)$/),
        });
      });

      it('should return groups with custom limit', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/groups?limit=2')
          .expect(200);

        const body = response.body as PaginatedResponse<GroupResponse>;

        expect(body.data).toHaveLength(2);
        expect(body.meta.limit).toBe(2);
        expect(body.meta.total).toBe(5);
      });

      it('should return groups with custom offset', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/groups?offset=3')
          .expect(200);

        const body = response.body as PaginatedResponse<GroupResponse>;

        expect(body.data).toHaveLength(2); // 5 - 3 = 2
        expect(body.meta.offset).toBe(3);
      });

      it('should return groups with both limit and offset', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/groups?limit=2&offset=1')
          .expect(200);

        const body = response.body as PaginatedResponse<GroupResponse>;

        expect(body.data).toHaveLength(2);
        expect(body.meta).toEqual({
          limit: 2,
          offset: 1,
          total: 5,
        });
      });

      it('should return groups ordered by ID ascending (deterministic)', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/groups')
          .expect(200);

        const body = response.body as PaginatedResponse<GroupResponse>;
        const ids = body.data.map((g) => g.id);

        // Verify ascending order
        for (let i = 1; i < ids.length; i++) {
          expect(ids[i]).toBeGreaterThan(ids[i - 1]);
        }
      });

      it('should correctly show group statuses', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/groups')
          .expect(200);

        const body = response.body as PaginatedResponse<GroupResponse>;

        // HR (id 4) should be empty, others should be notEmpty
        const hrGroup = body.data.find((g) => g.name === 'HR');
        const engineeringGroup = body.data.find((g) => g.name === 'Engineering');

        expect(hrGroup?.status).toBe('empty');
        expect(engineeringGroup?.status).toBe('notEmpty');
      });

      it('should include all expected group fields', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/groups')
          .expect(200);

        const body = response.body as PaginatedResponse<GroupResponse>;

        body.data.forEach((group) => {
          expect(group).toHaveProperty('id');
          expect(group).toHaveProperty('name');
          expect(group).toHaveProperty('status');
          // Should NOT expose users array (performance/security)
          expect(group).not.toHaveProperty('users');
        });
      });
    });

    describe('Pagination Edge Cases', () => {
      it('should return empty array when offset exceeds total', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/groups?offset=100')
          .expect(200);

        const body = response.body as PaginatedResponse<GroupResponse>;

        expect(body.data).toHaveLength(0);
        expect(body.meta.total).toBe(5);
      });

      it('should handle offset at exact boundary', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/groups?offset=5')
          .expect(200);

        const body = response.body as PaginatedResponse<GroupResponse>;

        expect(body.data).toHaveLength(0);
      });

      it('should handle limit=1 (minimum)', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/groups?limit=1')
          .expect(200);

        const body = response.body as PaginatedResponse<GroupResponse>;

        expect(body.data).toHaveLength(1);
        expect(body.meta.limit).toBe(1);
      });

      it('should handle limit=100 (maximum)', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/groups?limit=100')
          .expect(200);

        const body = response.body as PaginatedResponse<GroupResponse>;

        expect(body.data).toHaveLength(5); // Only 5 groups exist
        expect(body.meta.limit).toBe(100);
      });

      it('should return partial page at the end', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/groups?limit=3&offset=3')
          .expect(200);

        const body = response.body as PaginatedResponse<GroupResponse>;

        expect(body.data).toHaveLength(2); // Only 2 remaining
      });
    });

    describe('Validation Errors', () => {
      it('should reject limit=0', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/groups?limit=0')
          .expect(400);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject negative limit', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/groups?limit=-1')
          .expect(400);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject limit > 100', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/groups?limit=101')
          .expect(400);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject negative offset', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/groups?offset=-1')
          .expect(400);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject non-numeric parameters', async () => {
        await request(app.getHttpServer())
          .get('/api/v1/groups?limit=abc')
          .expect(400);

        await request(app.getHttpServer())
          .get('/api/v1/groups?offset=xyz')
          .expect(400);
      });
    });

    describe('Empty Database', () => {
      it('should return empty array when no groups exist', async () => {
        await prisma.$executeRaw`TRUNCATE TABLE "users" RESTART IDENTITY CASCADE`;
        await prisma.$executeRaw`TRUNCATE TABLE "groups" RESTART IDENTITY CASCADE`;

        const response = await request(app.getHttpServer())
          .get('/api/v1/groups')
          .expect(200);

        const body = response.body as PaginatedResponse<GroupResponse>;

        expect(body.data).toHaveLength(0);
        expect(body.meta.total).toBe(0);
      });
    });
  });

  // ============================================================================
  // DELETE /api/v1/groups/:groupId/users/:userId - Remove User from Group
  // ============================================================================
  describe('DELETE /api/v1/groups/:groupId/users/:userId (Remove User)', () => {
    describe('Happy Path', () => {
      it('should remove user from group successfully', async () => {
        // Alice (id 1) is in Engineering (id 1)
        await request(app.getHttpServer())
          .delete('/api/v1/groups/1/users/1')
          .expect(204);

        // Verify user is no longer in group
        const user = await prisma.user.findUnique({ where: { id: 1 } });
        expect(user?.groupId).toBeNull();

        // Group should still be notEmpty (bob and charlie still in it)
        const group = await prisma.group.findUnique({ where: { id: 1 } });
        expect(group?.status).toBe('notEmpty');
      });

      it('should return 204 No Content on success', async () => {
        const response = await request(app.getHttpServer())
          .delete('/api/v1/groups/1/users/1')
          .expect(204);

        // 204 should have no body
        expect(response.body).toEqual({});
      });

      it('should remove multiple users from same group sequentially', async () => {
        // Remove alice, bob, charlie from Engineering one by one
        await request(app.getHttpServer())
          .delete('/api/v1/groups/1/users/1')
          .expect(204);

        await request(app.getHttpServer())
          .delete('/api/v1/groups/1/users/2')
          .expect(204);

        // Verify both removed
        const users = await prisma.user.findMany({
          where: { id: { in: [1, 2] } },
        });

        users.forEach((u) => expect(u.groupId).toBeNull());
      });
    });

    describe('Group Status Transition (Critical Business Logic)', () => {
      it('should update group status to empty when last user is removed', async () => {
        // Create a group with single user
        const { groupId, userId } = await createGroupWithSingleUser(prisma);

        // Verify group is notEmpty initially
        let group = await prisma.group.findUnique({ where: { id: groupId } });
        expect(group?.status).toBe('notEmpty');

        // Remove the last user
        await request(app.getHttpServer())
          .delete(`/api/v1/groups/${groupId}/users/${userId}`)
          .expect(204);

        // Verify group status changed to empty
        group = await prisma.group.findUnique({ where: { id: groupId } });
        expect(group?.status).toBe('empty');
      });

      it('should NOT update group status when other users remain', async () => {
        // Engineering has 3 users (alice, bob, charlie)
        await request(app.getHttpServer())
          .delete('/api/v1/groups/1/users/1') // Remove alice
          .expect(204);

        // Group should still be notEmpty
        const group = await prisma.group.findUnique({ where: { id: 1 } });
        expect(group?.status).toBe('notEmpty');
      });

      it('should handle removing second-to-last user correctly', async () => {
        // Marketing has 2 users (david, eve)
        await request(app.getHttpServer())
          .delete('/api/v1/groups/2/users/4') // Remove david
          .expect(204);

        // Group should still be notEmpty (eve remains)
        let group = await prisma.group.findUnique({ where: { id: 2 } });
        expect(group?.status).toBe('notEmpty');

        // Now remove eve (last user)
        await request(app.getHttpServer())
          .delete('/api/v1/groups/2/users/5')
          .expect(204);

        // Group should now be empty
        group = await prisma.group.findUnique({ where: { id: 2 } });
        expect(group?.status).toBe('empty');
      });

      it('should transition from notEmpty to empty atomically', async () => {
        const { groupId, userId } = await createGroupWithSingleUser(prisma);

        // Remove user and verify atomic state change
        await request(app.getHttpServer())
          .delete(`/api/v1/groups/${groupId}/users/${userId}`)
          .expect(204);

        // Both user.groupId and group.status should be updated
        const [user, group] = await Promise.all([
          prisma.user.findUnique({ where: { id: userId } }),
          prisma.group.findUnique({ where: { id: groupId } }),
        ]);

        expect(user?.groupId).toBeNull();
        expect(group?.status).toBe('empty');
      });
    });

    describe('Not Found Errors (404)', () => {
      it('should return 404 when group does not exist', async () => {
        const response = await request(app.getHttpServer())
          .delete('/api/v1/groups/9999/users/1')
          .expect(404);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('NOT_FOUND');
        expect(body.error.message).toContain('Group');
      });

      it('should return 404 when user does not exist', async () => {
        const response = await request(app.getHttpServer())
          .delete('/api/v1/groups/1/users/9999')
          .expect(404);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('NOT_FOUND');
        expect(body.error.message).toContain('User');
      });

      it('should return 404 when both group and user do not exist', async () => {
        const response = await request(app.getHttpServer())
          .delete('/api/v1/groups/9999/users/8888')
          .expect(404);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('NOT_FOUND');
      });
    });

    describe('Conflict Errors (409)', () => {
      it('should return 409 when user is not a member of the group', async () => {
        // Alice (id 1) is in Engineering (id 1), not Marketing (id 2)
        const response = await request(app.getHttpServer())
          .delete('/api/v1/groups/2/users/1')
          .expect(409);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('CONFLICT');
        expect(body.error.message).toContain('not a member');
      });

      it('should return 409 when user has no group (null groupId)', async () => {
        // Jack (id 10) has no group
        const response = await request(app.getHttpServer())
          .delete('/api/v1/groups/1/users/10')
          .expect(409);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('CONFLICT');
      });

      it('should return 409 when user is in a different group', async () => {
        // David (id 4) is in Marketing (id 2), try to remove from Engineering (id 1)
        const response = await request(app.getHttpServer())
          .delete('/api/v1/groups/1/users/4')
          .expect(409);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('CONFLICT');
      });
    });

    describe('Validation Errors', () => {
      it('should reject non-numeric groupId', async () => {
        const response = await request(app.getHttpServer())
          .delete('/api/v1/groups/abc/users/1')
          .expect(400);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject non-numeric userId', async () => {
        const response = await request(app.getHttpServer())
          .delete('/api/v1/groups/1/users/xyz')
          .expect(400);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject negative groupId', async () => {
        // API attempts to find the entity, returns 404 for non-existent IDs
        const response = await request(app.getHttpServer())
          .delete('/api/v1/groups/-1/users/1')
          .expect(404);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('NOT_FOUND');
      });

      it('should reject negative userId', async () => {
        const response = await request(app.getHttpServer())
          .delete('/api/v1/groups/1/users/-1')
          .expect(404);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('NOT_FOUND');
      });

      it('should reject zero groupId', async () => {
        const response = await request(app.getHttpServer())
          .delete('/api/v1/groups/0/users/1')
          .expect(404);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('NOT_FOUND');
      });

      it('should reject zero userId', async () => {
        const response = await request(app.getHttpServer())
          .delete('/api/v1/groups/1/users/0')
          .expect(404);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('NOT_FOUND');
      });

      it('should reject float values for IDs', async () => {
        await request(app.getHttpServer())
          .delete('/api/v1/groups/1.5/users/1')
          .expect(400);

        await request(app.getHttpServer())
          .delete('/api/v1/groups/1/users/2.5')
          .expect(400);
      });
    });

    describe('Idempotency and Edge Cases', () => {
      it('should NOT be idempotent - second removal should fail', async () => {
        // First removal should succeed
        await request(app.getHttpServer())
          .delete('/api/v1/groups/1/users/1')
          .expect(204);

        // Second removal should fail with 409 (user no longer in group)
        const response = await request(app.getHttpServer())
          .delete('/api/v1/groups/1/users/1')
          .expect(409);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('CONFLICT');
      });

      it('should handle user removal from already empty group correctly', async () => {
        // HR group (id 4) is already empty
        // Try to remove a user that exists but isn't in any group
        const response = await request(app.getHttpServer())
          .delete('/api/v1/groups/4/users/10') // Jack has no group
          .expect(409);

        const body = response.body as ErrorResponse;
        expect(body.error.code).toBe('CONFLICT');
      });
    });

    describe('Concurrent Access (Race Conditions)', () => {
      it('should handle concurrent removals from same group safely', async () => {
        // Create a group with multiple users
        const group = await prisma.group.create({
          data: { name: 'ConcurrentTestGroup', status: 'notEmpty' },
        });

        const users = await Promise.all([
          prisma.user.create({
            data: { username: 'concurrent1', status: 'active', groupId: group.id },
          }),
          prisma.user.create({
            data: { username: 'concurrent2', status: 'active', groupId: group.id },
          }),
        ]);

        // Concurrent removal requests
        const results = await Promise.allSettled([
          request(app.getHttpServer())
            .delete(`/api/v1/groups/${group.id}/users/${users[0].id}`),
          request(app.getHttpServer())
            .delete(`/api/v1/groups/${group.id}/users/${users[1].id}`),
        ]);

        // Both should succeed (no race condition crash)
        results.forEach((result) => {
          expect(result.status).toBe('fulfilled');
          if (result.status === 'fulfilled') {
            expect(result.value.status).toBe(204);
          }
        });

        // Verify final state
        const finalGroup = await prisma.group.findUnique({ where: { id: group.id } });
        expect(finalGroup?.status).toBe('empty');

        const finalUsers = await prisma.user.findMany({
          where: { id: { in: users.map((u) => u.id) } },
        });
        finalUsers.forEach((u) => expect(u.groupId).toBeNull());
      });

      it('should handle concurrent removal of last user correctly', async () => {
        // Create group with single user
        const { groupId, userId } = await createGroupWithSingleUser(prisma);

        // Try concurrent duplicate removals
        const results = await Promise.allSettled([
          request(app.getHttpServer()).delete(`/api/v1/groups/${groupId}/users/${userId}`),
          request(app.getHttpServer()).delete(`/api/v1/groups/${groupId}/users/${userId}`),
        ]);

        // One should succeed (204), one should fail (409 - already removed)
        const statuses = results.map((r) => {
          if (r.status === 'fulfilled') return r.value.status;
          return 'rejected';
        });

        expect(statuses).toContain(204);
        // The other request should either succeed (race winner) or get 409
        expect(statuses.every((s) => s === 204 || s === 409)).toBe(true);

        // Final state should be consistent
        const finalGroup = await prisma.group.findUnique({ where: { id: groupId } });
        expect(finalGroup?.status).toBe('empty');
      });
    });

    describe('Transaction Integrity', () => {
      it('should not update group status if user removal fails mid-transaction', async () => {
        // This tests that partial state changes don't occur
        const { groupId, userId } = await createGroupWithSingleUser(prisma);

        // First verify initial state
        let group = await prisma.group.findUnique({ where: { id: groupId } });
        expect(group?.status).toBe('notEmpty');

        // Successfully remove user
        await request(app.getHttpServer())
          .delete(`/api/v1/groups/${groupId}/users/${userId}`)
          .expect(204);

        // Verify both user and group are updated atomically
        const [user, finalGroup] = await Promise.all([
          prisma.user.findUnique({ where: { id: userId } }),
          prisma.group.findUnique({ where: { id: groupId } }),
        ]);

        // Should never have inconsistent state where user is removed but group is still notEmpty
        expect(user?.groupId).toBeNull();
        expect(finalGroup?.status).toBe('empty');
      });

      it('should maintain data integrity across multiple operations', async () => {
        // Engineering group has 3 users: alice(1), bob(2), charlie(3)
        const groupId = 1;

        // Remove first user
        await request(app.getHttpServer())
          .delete(`/api/v1/groups/${groupId}/users/1`)
          .expect(204);

        let group = await prisma.group.findUnique({ where: { id: groupId } });
        expect(group?.status).toBe('notEmpty');

        // Remove second user
        await request(app.getHttpServer())
          .delete(`/api/v1/groups/${groupId}/users/2`)
          .expect(204);

        group = await prisma.group.findUnique({ where: { id: groupId } });
        expect(group?.status).toBe('notEmpty');

        // Remove last user
        await request(app.getHttpServer())
          .delete(`/api/v1/groups/${groupId}/users/3`)
          .expect(204);

        group = await prisma.group.findUnique({ where: { id: groupId } });
        expect(group?.status).toBe('empty');

        // Verify all users are ungrouped
        const users = await prisma.user.findMany({
          where: { id: { in: [1, 2, 3] } },
        });
        users.forEach((u) => expect(u.groupId).toBeNull());
      });
    });

    describe('HTTP Method Validation', () => {
      it('should reject GET request on remove endpoint', async () => {
        await request(app.getHttpServer())
          .get('/api/v1/groups/1/users/1')
          .expect(404); // Route doesn't exist for GET
      });

      it('should reject POST request on remove endpoint', async () => {
        await request(app.getHttpServer())
          .post('/api/v1/groups/1/users/1')
          .expect(404); // Route doesn't exist for POST
      });

      it('should reject PUT request on remove endpoint', async () => {
        await request(app.getHttpServer())
          .put('/api/v1/groups/1/users/1')
          .expect(404); // Route doesn't exist for PUT
      });

      it('should reject PATCH request on remove endpoint', async () => {
        await request(app.getHttpServer())
          .patch('/api/v1/groups/1/users/1')
          .expect(404); // Route doesn't exist for PATCH
      });
    });
  });
});
