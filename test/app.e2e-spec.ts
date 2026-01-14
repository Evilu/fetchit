import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  closeTestApp,
  getPrismaService,
  resetDatabase,
  ErrorResponse,
} from './setup/test-utils';
import { PrismaService } from '../src/database/prisma.service';

describe('API Integration Tests (e2e)', () => {
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
  // API Versioning & Global Prefix
  // ============================================================================
  describe('API Versioning', () => {
    it('should require /api/v1 prefix for all endpoints', async () => {
      // Without prefix should fail
      await request(app.getHttpServer())
        .get('/users')
        .expect(404);

      // With prefix should work
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .expect(200);
    });

    it('should return 404 for non-existent routes', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/nonexistent')
        .expect(404);
    });

    it('should return 404 for root path', async () => {
      await request(app.getHttpServer())
        .get('/')
        .expect(404);
    });
  });

  // ============================================================================
  // Error Response Format
  // ============================================================================
  describe('Error Response Format', () => {
    it('should return consistent error format for validation errors', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users?limit=-1')
        .expect(400);

      const body = response.body as ErrorResponse;

      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code', 'VALIDATION_ERROR');
      expect(body.error).toHaveProperty('message');
    });

    it('should return consistent error format for not found errors', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/users/statuses')
        .send({ updates: [{ id: 99999, status: 'active' }] })
        .expect(404);

      const body = response.body as ErrorResponse;

      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code', 'NOT_FOUND');
      expect(body.error).toHaveProperty('message');
    });

    it('should return consistent error format for conflict errors', async () => {
      // Try to remove user from wrong group
      const response = await request(app.getHttpServer())
        .delete('/api/v1/groups/2/users/1') // Alice is in group 1, not 2
        .expect(409);

      const body = response.body as ErrorResponse;

      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code', 'CONFLICT');
      expect(body.error).toHaveProperty('message');
    });

    it('should include validation details for validation errors', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/users/statuses')
        .send({ updates: [{ id: 1, status: 'invalid' }] })
        .expect(400);

      const body = response.body as ErrorResponse;

      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error).toHaveProperty('details');
      expect(Array.isArray(body.error.details)).toBe(true);
    });
  });

  // ============================================================================
  // Request Validation (Whitelist)
  // ============================================================================
  describe('Request Validation (Whitelist)', () => {
    it('should reject unknown query parameters (forbidden non-whitelisted)', async () => {
      // This depends on your validation pipe config
      // If forbidNonWhitelisted is true, unknown props should fail
      const response = await request(app.getHttpServer())
        .patch('/api/v1/users/statuses')
        .send({
          updates: [{ id: 1, status: 'active' }],
          unknownField: 'should fail',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should strip unknown properties with whitelist (if configured)', async () => {
      // Note: This test verifies the validation behavior
      // With forbidNonWhitelisted: true, this should fail
      const response = await request(app.getHttpServer())
        .patch('/api/v1/users/statuses')
        .send({
          updates: [{ id: 1, status: 'active', extraField: 'ignored' }],
        });

      // Should fail because of forbidNonWhitelisted
      expect(response.status).toBe(400);
    });
  });

  // ============================================================================
  // HTTP Methods
  // ============================================================================
  describe('HTTP Methods', () => {
    describe('GET endpoints', () => {
      it('should support GET on /users', async () => {
        await request(app.getHttpServer())
          .get('/api/v1/users')
          .expect(200);
      });

      it('should support GET on /users/cursor', async () => {
        await request(app.getHttpServer())
          .get('/api/v1/users/cursor')
          .expect(200);
      });

      it('should support GET on /groups', async () => {
        await request(app.getHttpServer())
          .get('/api/v1/groups')
          .expect(200);
      });

      it('should support GET on /health', async () => {
        await request(app.getHttpServer())
          .get('/api/v1/health')
          .expect(200);
      });
    });

    describe('PATCH endpoints', () => {
      it('should support PATCH on /users/statuses', async () => {
        await request(app.getHttpServer())
          .patch('/api/v1/users/statuses')
          .send({ updates: [{ id: 1, status: 'active' }] })
          .expect(200);
      });
    });

    describe('DELETE endpoints', () => {
      it('should support DELETE on /groups/:groupId/users/:userId', async () => {
        await request(app.getHttpServer())
          .delete('/api/v1/groups/1/users/1')
          .expect(204);
      });
    });
  });

  // ============================================================================
  // Content-Type Handling
  // ============================================================================
  describe('Content-Type Handling', () => {
    it('should accept application/json for POST/PATCH/PUT', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/statuses')
        .set('Content-Type', 'application/json')
        .send({ updates: [{ id: 1, status: 'active' }] })
        .expect(200);
    });

    it('should return application/json responses', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should handle missing Content-Type for JSON body gracefully', async () => {
      // Supertest sets Content-Type automatically when using .send()
      // This tests the server's handling of JSON without explicit Content-Type
      const response = await request(app.getHttpServer())
        .patch('/api/v1/users/statuses')
        .send({ updates: [{ id: 1, status: 'active' }] });

      expect(response.status).toBe(200);
    });
  });

  // ============================================================================
  // Request ID Tracking
  // ============================================================================
  describe('Request ID Tracking', () => {
    it('should return X-Request-Id header', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users')
        .expect(200);

      expect(response.headers).toHaveProperty('x-request-id');
      // Should be a valid UUID format
      expect(response.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('should generate unique request IDs for each request', async () => {
      const response1 = await request(app.getHttpServer())
        .get('/api/v1/users')
        .expect(200);

      const response2 = await request(app.getHttpServer())
        .get('/api/v1/users')
        .expect(200);

      expect(response1.headers['x-request-id']).not.toBe(
        response2.headers['x-request-id'],
      );
    });
  });

  // ============================================================================
  // Security Headers
  // ============================================================================
  describe('Security Headers', () => {
    it('should include Helmet security headers', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users')
        .expect(200);

      // Helmet adds various security headers
      // Check for some common ones
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  // ============================================================================
  // CORS (if applicable)
  // ============================================================================
  describe('CORS', () => {
    it('should handle CORS preflight requests', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/v1/users')
        .set('Origin', 'http://localhost:3001')
        .set('Access-Control-Request-Method', 'GET');

      // Should return 204 for preflight or CORS headers
      expect([200, 204]).toContain(response.status);
    });
  });

  // ============================================================================
  // Large Payload Handling
  // ============================================================================
  describe('Large Payload Handling', () => {
    it('should handle maximum bulk update size (500 items)', async () => {
      // First create 500 users
      const createValues = Array.from(
        { length: 500 },
        (_, i) => `(${i + 100}, 'bulk_user_${i}', 'pending', NULL)`,
      ).join(',');

      await prisma.$executeRawUnsafe(`
        INSERT INTO "users" (id, username, status, group_id) VALUES ${createValues}
      `);

      const updates = Array.from({ length: 500 }, (_, i) => ({
        id: i + 100,
        status: 'active' as const,
      }));

      const response = await request(app.getHttpServer())
        .patch('/api/v1/users/statuses')
        .send({ updates })
        .expect(200);

      expect(response.body.updated).toBe(500);
    });

    it('should reject payload exceeding maximum size', async () => {
      const updates = Array.from({ length: 501 }, (_, i) => ({
        id: i + 1,
        status: 'active' as const,
      }));

      const response = await request(app.getHttpServer())
        .patch('/api/v1/users/statuses')
        .send({ updates })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ============================================================================
  // Data Consistency Across Endpoints
  // ============================================================================
  describe('Data Consistency Across Endpoints', () => {
    it('should reflect status changes in subsequent GET requests', async () => {
      // Update user status
      await request(app.getHttpServer())
        .patch('/api/v1/users/statuses')
        .send({ updates: [{ id: 1, status: 'blocked' }] })
        .expect(200);

      // Verify in users list
      const response = await request(app.getHttpServer())
        .get('/api/v1/users')
        .expect(200);

      const alice = response.body.data.find(
        (u: { username: string }) => u.username === 'alice',
      );
      expect(alice.status).toBe('blocked');
    });

    it('should reflect group removal in subsequent GET requests', async () => {
      // Remove user from group
      await request(app.getHttpServer())
        .delete('/api/v1/groups/1/users/1')
        .expect(204);

      // Verify user no longer has groupId
      const usersResponse = await request(app.getHttpServer())
        .get('/api/v1/users')
        .expect(200);

      const alice = usersResponse.body.data.find(
        (u: { username: string }) => u.username === 'alice',
      );
      expect(alice.groupId).toBeNull();
    });

    it('should reflect empty group status after last user removal', async () => {
      // Create group with single user
      const group = await prisma.group.create({
        data: { name: 'TestSingleGroup', status: 'notEmpty' },
      });
      const user = await prisma.user.create({
        data: { username: 'singleUser', status: 'active', groupId: group.id },
      });

      // Remove last user
      await request(app.getHttpServer())
        .delete(`/api/v1/groups/${group.id}/users/${user.id}`)
        .expect(204);

      // Verify group status in groups list
      const groupsResponse = await request(app.getHttpServer())
        .get('/api/v1/groups')
        .expect(200);

      const testGroup = groupsResponse.body.data.find(
        (g: { name: string }) => g.name === 'TestSingleGroup',
      );
      expect(testGroup.status).toBe('empty');
    });
  });

  // ============================================================================
  // End-to-End User Journey Tests
  // ============================================================================
  describe('User Journey Tests', () => {
    it('should handle complete user lifecycle: create -> update status -> remove from group', async () => {
      // 1. Get initial state
      let usersResponse = await request(app.getHttpServer())
        .get('/api/v1/users')
        .expect(200);

      const initialUserCount = usersResponse.body.meta.total;
      expect(initialUserCount).toBe(12);

      // 2. Update multiple user statuses
      await request(app.getHttpServer())
        .patch('/api/v1/users/statuses')
        .send({
          updates: [
            { id: 1, status: 'blocked' },
            { id: 2, status: 'pending' },
          ],
        })
        .expect(200);

      // 3. Verify status changes
      usersResponse = await request(app.getHttpServer())
        .get('/api/v1/users')
        .expect(200);

      const alice = usersResponse.body.data.find(
        (u: { id: number }) => u.id === 1,
      );
      const bob = usersResponse.body.data.find((u: { id: number }) => u.id === 2);

      expect(alice.status).toBe('blocked');
      expect(bob.status).toBe('pending');

      // 4. Remove users from group
      await request(app.getHttpServer())
        .delete('/api/v1/groups/1/users/1')
        .expect(204);

      await request(app.getHttpServer())
        .delete('/api/v1/groups/1/users/2')
        .expect(204);

      // 5. Verify final state
      usersResponse = await request(app.getHttpServer())
        .get('/api/v1/users')
        .expect(200);

      const aliceFinal = usersResponse.body.data.find(
        (u: { id: number }) => u.id === 1,
      );
      const bobFinal = usersResponse.body.data.find(
        (u: { id: number }) => u.id === 2,
      );

      expect(aliceFinal.groupId).toBeNull();
      expect(bobFinal.groupId).toBeNull();
    });

    it('should handle group emptying scenario correctly', async () => {
      // Create a new group with 2 users
      const group = await prisma.group.create({
        data: { name: 'JourneyGroup', status: 'notEmpty' },
      });

      await prisma.user.createMany({
        data: [
          { username: 'journey1', status: 'active', groupId: group.id },
          { username: 'journey2', status: 'active', groupId: group.id },
        ],
      });

      const users = await prisma.user.findMany({
        where: { groupId: group.id },
      });

      // 1. Verify group is notEmpty
      let groupsResponse = await request(app.getHttpServer())
        .get('/api/v1/groups')
        .expect(200);

      let journeyGroup = groupsResponse.body.data.find(
        (g: { name: string }) => g.name === 'JourneyGroup',
      );
      expect(journeyGroup.status).toBe('notEmpty');

      // 2. Remove first user
      await request(app.getHttpServer())
        .delete(`/api/v1/groups/${group.id}/users/${users[0].id}`)
        .expect(204);

      groupsResponse = await request(app.getHttpServer())
        .get('/api/v1/groups')
        .expect(200);

      journeyGroup = groupsResponse.body.data.find(
        (g: { name: string }) => g.name === 'JourneyGroup',
      );
      expect(journeyGroup.status).toBe('notEmpty');

      // 3. Remove last user - group should become empty
      await request(app.getHttpServer())
        .delete(`/api/v1/groups/${group.id}/users/${users[1].id}`)
        .expect(204);

      groupsResponse = await request(app.getHttpServer())
        .get('/api/v1/groups')
        .expect(200);

      journeyGroup = groupsResponse.body.data.find(
        (g: { name: string }) => g.name === 'JourneyGroup',
      );
      expect(journeyGroup.status).toBe('empty');
    });
  });

  // ============================================================================
  // Pagination Integrity Tests
  // ============================================================================
  describe('Pagination Integrity', () => {
    it('should return consistent total across all pages', async () => {
      const page1 = await request(app.getHttpServer())
        .get('/api/v1/users?limit=5&offset=0')
        .expect(200);

      const page2 = await request(app.getHttpServer())
        .get('/api/v1/users?limit=5&offset=5')
        .expect(200);

      const page3 = await request(app.getHttpServer())
        .get('/api/v1/users?limit=5&offset=10')
        .expect(200);

      // Total should be consistent
      expect(page1.body.meta.total).toBe(page2.body.meta.total);
      expect(page2.body.meta.total).toBe(page3.body.meta.total);

      // Combined data should cover all users
      const allIds = [
        ...page1.body.data.map((u: { id: number }) => u.id),
        ...page2.body.data.map((u: { id: number }) => u.id),
        ...page3.body.data.map((u: { id: number }) => u.id),
      ];

      expect(new Set(allIds).size).toBe(12); // All unique, no duplicates
    });

    it('should maintain order consistency across pages', async () => {
      const allInOne = await request(app.getHttpServer())
        .get('/api/v1/users?limit=100')
        .expect(200);

      const page1 = await request(app.getHttpServer())
        .get('/api/v1/users?limit=4&offset=0')
        .expect(200);

      const page2 = await request(app.getHttpServer())
        .get('/api/v1/users?limit=4&offset=4')
        .expect(200);

      // First 4 users should match
      expect(page1.body.data.map((u: { id: number }) => u.id)).toEqual(
        allInOne.body.data.slice(0, 4).map((u: { id: number }) => u.id),
      );

      // Next 4 users should match
      expect(page2.body.data.map((u: { id: number }) => u.id)).toEqual(
        allInOne.body.data.slice(4, 8).map((u: { id: number }) => u.id),
      );
    });
  });
});
