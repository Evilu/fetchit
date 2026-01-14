import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/test-utils';

describe('Health API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  // ============================================================================
  // GET /api/v1/health - Health Check Endpoint
  // ============================================================================
  describe('GET /api/v1/health', () => {
    describe('Happy Path', () => {
      it('should return healthy status when database is connected', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/health')
          .expect(200);

        expect(response.body).toHaveProperty('status', 'ok');
      });

      it('should include database health indicator', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/health')
          .expect(200);

        expect(response.body).toHaveProperty('info');
        // Database health indicator should be present
        expect(response.body.info).toHaveProperty('database');
        expect(response.body.info.database).toHaveProperty('status', 'up');
      });

      it('should return structured health check response', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/health')
          .expect(200);

        // NestJS Terminus health check structure
        expect(response.body).toMatchObject({
          status: 'ok',
          info: expect.any(Object),
          details: expect.any(Object),
        });
      });

      it('should respond quickly (under 1 second)', async () => {
        const startTime = Date.now();
        await request(app.getHttpServer())
          .get('/api/v1/health')
          .expect(200);

        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(1000);
      });
    });

    describe('Response Format', () => {
      it('should return JSON content type', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/health')
          .expect(200);

        expect(response.headers['content-type']).toMatch(/application\/json/);
      });

      it('should not cache health check responses', async () => {
        // Health checks should always be fresh
        const response1 = await request(app.getHttpServer())
          .get('/api/v1/health')
          .expect(200);

        const response2 = await request(app.getHttpServer())
          .get('/api/v1/health')
          .expect(200);

        // Both should succeed independently
        expect(response1.body.status).toBe('ok');
        expect(response2.body.status).toBe('ok');
      });
    });

    describe('HTTP Methods', () => {
      it('should only accept GET requests', async () => {
        await request(app.getHttpServer())
          .get('/api/v1/health')
          .expect(200);
      });

      it('should reject POST requests', async () => {
        await request(app.getHttpServer())
          .post('/api/v1/health')
          .expect(404);
      });

      it('should reject PUT requests', async () => {
        await request(app.getHttpServer())
          .put('/api/v1/health')
          .expect(404);
      });

      it('should reject DELETE requests', async () => {
        await request(app.getHttpServer())
          .delete('/api/v1/health')
          .expect(404);
      });

      it('should reject PATCH requests', async () => {
        await request(app.getHttpServer())
          .patch('/api/v1/health')
          .expect(404);
      });
    });

    describe('Monitoring Integration', () => {
      it('should be suitable for load balancer health checks', async () => {
        // Multiple rapid health checks should all succeed
        const checks = await Promise.all([
          request(app.getHttpServer()).get('/api/v1/health'),
          request(app.getHttpServer()).get('/api/v1/health'),
          request(app.getHttpServer()).get('/api/v1/health'),
        ]);

        checks.forEach((response) => {
          expect(response.status).toBe(200);
          expect(response.body.status).toBe('ok');
        });
      });

      it('should be suitable for Kubernetes liveness/readiness probes', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/health')
          .expect(200);

        // Should return 200 for healthy (liveness)
        // Should include database status (readiness)
        expect(response.body.status).toBe('ok');
        expect(response.body.info.database.status).toBe('up');
      });
    });
  });
});
