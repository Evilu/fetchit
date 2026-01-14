import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { CacheKeys } from './cache-keys';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async get<T>(key: string): Promise<T | undefined> {
    try {
      return await this.cacheManager.get<T>(key);
    } catch (error) {
      this.logger.warn(`Cache get error for key ${key}: ${error}`);
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      await this.cacheManager.set(key, value, ttl);
    } catch (error) {
      this.logger.warn(`Cache set error for key ${key}: ${error}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
    } catch (error) {
      this.logger.warn(`Cache del error for key ${key}: ${error}`);
    }
  }

  async invalidateUsersCache(): Promise<void> {
    try {
      const stores = (this.cacheManager as any).stores;
      if (stores && stores[0]?.opts?.store?.client) {
        const client = stores[0].opts.store.client;
        const keys = await client.keys(`${CacheKeys.USERS_LIST}:*`);
        if (keys.length > 0) {
          await Promise.all(keys.map((key: string) => this.cacheManager.del(key)));
        }
      }
    } catch (error) {
      this.logger.warn(`Cache invalidation error for users: ${error}`);
    }
  }

  async invalidateGroupsCache(): Promise<void> {
    try {
      const stores = (this.cacheManager as any).stores;
      if (stores && stores[0]?.opts?.store?.client) {
        const client = stores[0].opts.store.client;
        const keys = await client.keys(`${CacheKeys.GROUPS_LIST}:*`);
        if (keys.length > 0) {
          await Promise.all(keys.map((key: string) => this.cacheManager.del(key)));
        }
      }
    } catch (error) {
      this.logger.warn(`Cache invalidation error for groups: ${error}`);
    }
  }

  async invalidateAllCache(): Promise<void> {
    await Promise.all([
      this.invalidateUsersCache(),
      this.invalidateGroupsCache(),
    ]);
  }
}
