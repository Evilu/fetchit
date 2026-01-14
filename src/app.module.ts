import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { CacheModule } from './cache/cache.module';
import { UsersModule } from './users/users.module';
import { GroupsModule } from './groups/groups.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'short',
            ttl: config.get('THROTTLE_SHORT_TTL', 1000),
            limit: config.get('THROTTLE_SHORT_LIMIT', 10),
          },
          {
            name: 'long',
            ttl: config.get('THROTTLE_LONG_TTL', 60000),
            limit: config.get('THROTTLE_LONG_LIMIT', 100),
          },
        ],
      }),
    }),
    DatabaseModule,
    CacheModule,
    UsersModule,
    GroupsModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
