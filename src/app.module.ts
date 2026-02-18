import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from './common/config';
import { HealthModule } from './common/health/health.module';
import { TenantsModule } from './tenants/tenants.module';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PropertiesModule } from './properties/properties.module';
import { ContractsModule } from './contracts/contracts.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [
    ConfigModule,
    HealthModule,
    // Rate Limiting - Protección contra fuerza bruta y DoS
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,  // 60 segundos
        limit: 100,  // 100 requests por minuto (general)
      },
      {
        name: 'strict',
        ttl: 60000,  // 60 segundos
        limit: 20,   // 20 requests por minuto (endpoints sensibles)
      },
    ]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.database.host,
        port: configService.database.port,
        username: configService.database.username,
        password: configService.database.password,
        database: configService.database.database,
        // IMPORTANTE: Solo sincronizar entidades del schema public (tenant metadata)
        // Las entidades de tenants (properties, users, maintenance, etc.) se creen MANUALMENTE en cada schema
        entities: [
          __dirname + '/tenants/metadata/*.entity{.ts,.js}',
          __dirname + '/properties/entities/*.entity{.ts,.js}',
          __dirname + '/users/*.entity{.ts,.js}',
          __dirname + '/contracts/entities/*.entity{.ts,.js}',
          __dirname + '/maintenance/entities/*.entity{.ts,.js}',
          __dirname + '/notifications/entities/*.entity{.ts,.js}',
        ],
        // NO sincronizar automáticamente - las tablas de tenants se crean manualmente
        synchronize: false,
        logging: configService.app.nodeEnv === 'development',
        schema: 'public',
        // Configurar el search_path por defecto
        searchPath: 'public',
      }),
    }),
    TenantsModule,
    AuthModule,
    UsersModule,
    PropertiesModule,
    ContractsModule,
    MaintenanceModule,
    NotificationsModule,
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Guard global de Rate Limiting
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantContextMiddleware)
      .exclude(
        // Rutas de health check y endpoints públicos sin tenant
        { path: 'health', method: RequestMethod.GET },
        { path: 'auth/register-admin', method: RequestMethod.POST }, // Crear tenant + admin no requiere tenant context
        // NOTA: auth/:slug/login y auth/:slug/register NO se excluyen porque necesitan detectar el tenant
      )
      .forRoutes('*');
  }
}
