import { Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';

@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const redisHost = configService.get('REDIS_HOST', 'localhost');
        const redisPort = configService.get('REDIS_PORT', 6379);
        const ttl = configService.get('REDIS_TTL', 60) * 1000; // convert to ms

        // Dynamic import for redis store
        const { redisStore } = await import('cache-manager-redis-store');

        return {
          store: redisStore as any,
          host: redisHost,
          port: redisPort,
          ttl,
        };
      },
    }),
  ],
  providers: [CacheService],
  exports: [NestCacheModule, CacheService],
})
export class CacheModule {}
