import { Module, Global } from '@nestjs/common';
import { CacheModule as NestCacheModule, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { Cache } from 'cache-manager';

/**
 * Mock CacheService for testing - uses in-memory cache
 */
@Injectable()
export class TestCacheService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async get<T>(key: string): Promise<T | undefined> {
    return this.cacheManager.get<T>(key);
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    await this.cacheManager.set(key, value, ttl);
  }

  async del(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }

  async reset(): Promise<void> {
    await this.cacheManager.clear();
  }

  async delByPattern(pattern: string): Promise<void> {
    // In-memory cache doesn't support pattern deletion well
    // For tests, we just clear all cache
    await this.cacheManager.clear();
  }
}

/**
 * Test Cache Module - uses in-memory store instead of Redis
 * This replaces the production CacheModule for testing
 */
@Global()
@Module({
  imports: [
    NestCacheModule.register({
      ttl: 30000, // 30 seconds
      max: 100, // Maximum number of items in cache
    }),
  ],
  providers: [TestCacheService],
  exports: [NestCacheModule, TestCacheService],
})
export class TestCacheModule {}