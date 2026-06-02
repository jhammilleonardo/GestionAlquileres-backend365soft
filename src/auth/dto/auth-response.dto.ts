import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthContractSummaryDto {
  @ApiProperty({ example: 12 })
  id: number;

  @ApiProperty({ example: 'CTR-2026-0001' })
  contract_number: string;

  @ApiProperty({ example: 'ACTIVO' })
  status: string;

  @ApiPropertyOptional({ example: 'Casa Central', nullable: true })
  property_title: string | null;
}

export class AuthUserDto {
  @ApiProperty({ example: 7 })
  id: number;

  @ApiProperty({ example: 'admin@empresa.com' })
  email: string;

  @ApiProperty({ example: 'Ana Perez' })
  name: string;

  @ApiPropertyOptional({ example: '+59170000000' })
  phone?: string;

  @ApiProperty({ example: 'ADMIN' })
  role: string;

  @ApiProperty({ example: 'mi-empresa' })
  tenant_slug: string;

  @ApiPropertyOptional({
    type: () => AuthContractSummaryDto,
    nullable: true,
    description: 'Contrato activo del inquilino. Null para roles no inquilino.',
  })
  contract?: AuthContractSummaryDto | null;

  @ApiPropertyOptional({
    example: 4,
    description: 'Solo presente en login de propietario.',
  })
  rental_owner_id?: number;
}

export class LoginResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'JWT Bearer para consumir rutas protegidas.',
  })
  access_token: string;

  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto;
}

export class AdminMfaRequiredResponseDto {
  @ApiProperty({ example: true })
  mfa_required: true;

  @ApiProperty({
    example: '7f3e9b0b1e6e4a0f9b4a2c1d',
    description: 'Identificador temporal usado para verificar el codigo MFA.',
  })
  challenge_id: string;

  @ApiProperty({
    example: 'ad***@empresa.com',
    description: 'Correo enmascarado al que se envio el codigo.',
  })
  email_masked: string;

  @ApiProperty({
    example: 600,
    description: 'Tiempo de vida del codigo en segundos.',
  })
  expires_in_seconds: number;
}

export class AuthMeResponseDto {
  @ApiProperty({ example: 7 })
  userId: number;

  @ApiProperty({ example: 'Ana Perez' })
  name: string;

  @ApiProperty({ example: 'admin@empresa.com' })
  email: string;

  @ApiPropertyOptional({ example: '+59170000000' })
  phone?: string;

  @ApiProperty({ example: 'ADMIN' })
  role: string;

  @ApiProperty({ example: 'mi-empresa' })
  tenantSlug: string;

  @ApiPropertyOptional({ type: () => AuthContractSummaryDto, nullable: true })
  contract?: AuthContractSummaryDto | null;
}

export class RegisteredUserResponseDto {
  @ApiProperty({ example: 8 })
  id: number;

  @ApiProperty({ example: 'Luis Rojas' })
  name: string;

  @ApiProperty({ example: 'luis@example.com' })
  email: string;

  @ApiPropertyOptional({ example: '+59171111111' })
  phone?: string;

  @ApiProperty({ example: 'INQUILINO' })
  role: string;

  @ApiProperty({ example: true })
  is_active: boolean;
}

export class RegisteredTenantDto {
  @ApiProperty({ example: 3 })
  id: number;

  @ApiProperty({ example: 'mi-empresa' })
  slug: string;

  @ApiProperty({ example: 'Mi Empresa SRL' })
  company_name: string;

  @ApiProperty({ example: 'BOB' })
  currency: string;

  @ApiProperty({ example: 'es-BO' })
  locale: string;
}

export class RegisterAdminResponseDto {
  @ApiProperty({ type: RegisteredTenantDto })
  tenant: RegisteredTenantDto;

  @ApiProperty({ type: RegisteredUserResponseDto })
  user: RegisteredUserResponseDto;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  access_token: string;
}
