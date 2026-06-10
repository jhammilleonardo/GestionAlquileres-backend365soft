import {
  Controller,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Get,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthRequestUser, AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RegisterAdminDto } from './dto/register-admin.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyAdminMfaDto } from './dto/verify-admin-mfa.dto';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  AdminMfaRequiredResponseDto,
  AuthMeResponseDto,
  LoginResponseDto,
  RegisteredUserResponseDto,
  RegisterAdminResponseDto,
} from './dto/auth-response.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 registros por hora
  @Post('register-admin')
  @ApiOperation({
    summary: 'Registrar tenant y usuario administrador inicial',
    description:
      'Crea el tenant, provisiona su schema y devuelve un JWT para el administrador.',
  })
  @ApiBody({ type: RegisterAdminDto })
  @ApiCreatedResponse({ type: RegisterAdminResponseDto })
  @ApiTooManyRequestsResponse({ description: 'Límite de registros excedido' })
  async registerAdmin(@Body() registerAdminDto: RegisterAdminDto) {
    return this.authService.registerAdmin(registerAdminDto);
  }

  @Public()
  @Throttle({ default: { limit: 15, ttl: 120000 } }) // 15 intentos cada 2 minutos
  @Post('login-admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login de administrador',
    description:
      'Busca el administrador por email entre tenants activos. Si MFA esta activo, devuelve un desafio sin JWT; el token se emite despues de verificar el codigo.',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiOkResponse({ type: AdminMfaRequiredResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Credenciales inválidas o usuario inactivo',
  })
  @ApiTooManyRequestsResponse({ description: 'Cuenta temporalmente bloqueada' })
  async loginAdmin(@Body() loginDto: LoginDto) {
    return this.authService.loginAdmin(loginDto.email, loginDto.password);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 600000 } })
  @Post('login-admin/mfa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verificar codigo MFA de administrador',
    description:
      'Valida el codigo enviado por correo y recien entonces emite el JWT del administrador.',
  })
  @ApiBody({ type: VerifyAdminMfaDto })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Codigo inválido, vencido o desafio agotado',
  })
  @ApiTooManyRequestsResponse({ description: 'Demasiados intentos MFA' })
  async verifyAdminMfa(@Body() dto: VerifyAdminMfaDto) {
    return this.authService.verifyAdminMfa(dto.challenge_id, dto.code);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Solicitar recuperacion de contrasena',
    description:
      'Devuelve siempre una respuesta generica para evitar enumeracion de usuarios.',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOkResponse({
    schema: {
      example: {
        message:
          'Si el correo existe, se enviaran instrucciones de recuperacion.',
      },
    },
  })
  @ApiTooManyRequestsResponse({
    description: 'Demasiadas solicitudes de recuperacion',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restablecer contrasena con token',
    description:
      'Valida el token de recuperacion, actualiza la contrasena y marca el token como usado.',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({
    schema: {
      example: {
        message: 'Contrasena actualizada correctamente.',
      },
    },
  })
  @ApiTooManyRequestsResponse({
    description: 'Demasiados intentos de restablecimiento',
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Public()
  @Throttle({ default: { limit: 15, ttl: 120000 } }) // 15 intentos cada 2 minutos
  @Post(':slug/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login de usuario dentro de un tenant' })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Credenciales inválidas o usuario inactivo',
  })
  @ApiTooManyRequestsResponse({ description: 'Cuenta temporalmente bloqueada' })
  async login(@Param('slug') slug: string, @Body() loginDto: LoginDto) {
    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
      slug,
    );
    return this.authService.login(user, slug);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 3600000 } }) // 5 registros por hora por IP
  @Post(':slug/register')
  @ApiOperation({ summary: 'Registrar inquilino en un tenant existente' })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({ type: RegisteredUserResponseDto })
  @ApiTooManyRequestsResponse({ description: 'Límite de registros excedido' })
  async register(
    @Param('slug') slug: string,
    @Body() registerDto: RegisterDto,
  ) {
    return this.authService.register(
      registerDto.name,
      registerDto.email,
      registerDto.password,
      slug,
      registerDto.phone,
    );
  }

  @Public()
  @Throttle({ default: { limit: 15, ttl: 120000 } }) // 15 intentos cada 2 minutos
  @Post(':slug/owner/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login de propietario',
    description:
      'Requiere usuario con rol PROPIETARIO vinculado a un rental_owner activo.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Credenciales inválidas o propietario no vinculado',
  })
  @ApiTooManyRequestsResponse({ description: 'Cuenta temporalmente bloqueada' })
  async loginOwner(@Param('slug') slug: string, @Body() loginDto: LoginDto) {
    return this.authService.loginOwner(loginDto.email, loginDto.password, slug);
  }

  @Public()
  @Throttle({ default: { limit: 15, ttl: 120000 } }) // 15 intentos cada 2 minutos
  @Post(':slug/vendor/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login de proveedor externo',
    description:
      'Requiere usuario con rol VENDOR vinculado a un proveedor activo.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Credenciales inválidas o proveedor no vinculado',
  })
  @ApiTooManyRequestsResponse({ description: 'Cuenta temporalmente bloqueada' })
  async loginVendor(@Param('slug') slug: string, @Body() loginDto: LoginDto) {
    return this.authService.loginVendor(
      loginDto.email,
      loginDto.password,
      slug,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  @ApiOkResponse({ type: AuthMeResponseDto })
  @ApiUnauthorizedResponse({
    description: 'JWT inválido, vencido o usuario inexistente',
  })
  async getProfile(@Request() req: { user: AuthRequestUser }) {
    return this.authService.getMe(req.user);
  }
}
