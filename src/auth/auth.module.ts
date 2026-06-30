import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthSecurityService } from './auth-security.service';
import { AuthController } from './auth.controller';
import { TenantsModule } from '../tenants/tenants.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { NotificationsModule } from '../notifications/notifications.module';
import { RefreshTokenService } from './refresh-token.service';
import { AuthCookieInterceptor } from './auth-cookie.interceptor';
import { accessTokenTtlSeconds } from './auth-cookie.util';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    TenantsModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret || secret.length < 32) {
          throw new Error(
            'JWT_SECRET no está definido o tiene menos de 32 caracteres. ' +
              "Generar uno con: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
          );
        }
        return {
          secret,
          signOptions: { expiresIn: accessTokenTtlSeconds() },
        };
      },
      global: true, // Hacer JwtModule disponible globalmente
    }),
    TypeOrmModule.forFeature([]),
    NotificationsModule,
    AuditLogsModule,
  ],
  providers: [
    AuthService,
    AuthSecurityService,
    JwtStrategy,
    RefreshTokenService,
    AuthCookieInterceptor,
  ],
  controllers: [AuthController],
  exports: [AuthService, AuthSecurityService, RefreshTokenService],
})
export class AuthModule {}
