/**
 * Global test setup
 * Runs once before all test suites
 */

import { execSync } from 'child_process';

export default async function globalSetup(): Promise<void> {
  console.log('\n Starting E2E test environment setup...\n');

  // Verify environment
  const requiredEnvVars = ['DATABASE_URL'];
  const missing = requiredEnvVars.filter((v) => !process.env[v]);

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    console.error('Make sure to run docker-compose up -d and set DATABASE_URL');
    process.exit(1);
  }

  // Verify database connection using Prisma
  try {
    execSync('npx prisma db push --skip-generate', {
      stdio: 'pipe',
      env: process.env,
    });
    console.log('Database schema verified');
  } catch (error) {
    console.error('Failed to connect to database');
    console.error('Make sure PostgreSQL is running (docker-compose up -d)');
    throw error;
  }

  console.log('\nE2E test environment ready\n');
}