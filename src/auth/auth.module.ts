import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TenantsModule } from '../tenants/tenants.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { NotificationsModule } from '../notifications/notifications.module';

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
              'Generar uno con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
          );
        }
        return {
          secret,
          signOptions: { expiresIn: '7d' },
        };
      },
      global: true, // Hacer JwtModule disponible globalmente
    }),
    TypeOrmModule.forFeature([]),
    NotificationsModule,
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
