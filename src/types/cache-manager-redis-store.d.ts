declare module 'cache-manager-redis-store' {
  import { Store } from 'cache-manager';

  export interface RedisStoreOptions {
    host?: string;
    port?: number;
    ttl?: number;
    db?: number;
    password?: string;
  }

  export function redisStore(options?: RedisStoreOptions): Store;
}
