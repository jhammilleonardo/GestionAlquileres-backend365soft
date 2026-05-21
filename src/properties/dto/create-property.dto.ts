import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsArray,
  Min,
  Max,
  IsEnum,
  IsBoolean,
  IsEmail,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// DTO para crear dirección
export class CreatePropertyAddressDto {
  @ApiProperty({ enum: ['address_1', 'address_2', 'address_3'] })
  @IsEnum(['address_1', 'address_2', 'address_3'])
  address_type: 'address_1' | 'address_2' | 'address_3';

  @ApiProperty({ example: 'Av. Siempre Viva 123' })
  @IsString()
  @IsNotEmpty()
  street_address: string;

  @ApiPropertyOptional({ example: 'La Paz' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'La Paz' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: '0000' })
  @IsOptional()
  @IsString()
  zip_code?: string;

  @ApiProperty({ example: 'Bolivia' })
  @IsString()
  @IsNotEmpty()
  country: string;
}

// DTO para crear dueño (si no existe)
export class CreateRentalOwnerDto {
  @ApiProperty({ example: 'Ana Perez' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Inversiones Perez SRL' })
  @IsOptional()
  @IsString()
  company_name?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  is_company?: boolean;

  @ApiProperty({ example: 'ana@example.com' })
  @IsEmail()
  @IsNotEmpty()
  primary_email: string;

  @ApiProperty({ example: '+59171111111' })
  @IsString()
  @IsNotEmpty()
  phone_number: string;

  @ApiPropertyOptional({ example: 'ana.alt@example.com' })
  @IsOptional()
  @IsEmail()
  secondary_email?: string;

  @ApiPropertyOptional({ example: '+59172222222' })
  @IsOptional()
  @IsString()
  secondary_phone?: string;

  @ApiPropertyOptional({ example: 'Propietaria principal.' })
  @IsOptional()
  @IsString()
  notes?: string;
}

// DTO para actualizar dueño
export class UpdateRentalOwnerDto {
  @ApiPropertyOptional({ example: 'Ana Perez' })
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  company_name?: string;

  @IsOptional()
  @IsBoolean()
  is_company?: boolean;

  @IsOptional()
  @IsEmail()
  primary_email?: string;

  @IsOptional()
  @IsString()
  phone_number?: string;

  @IsOptional()
  @IsEmail()
  secondary_email?: string;

  @IsOptional()
  @IsString()
  secondary_phone?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

// DTO para asignar dueño existente
export class AssignOwnerDto {
  @ApiProperty({ example: 4 })
  @IsNumber()
  rental_owner_id: number;

  @ApiPropertyOptional({ example: 100, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  ownership_percentage?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;
}

// DTO principal para crear propiedad
export class CreatePropertyDto {
  // Basic Info (mínimo requerido)
  @ApiProperty({ example: 'Departamento Centro' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @IsNotEmpty()
  property_type_id: number;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @IsNotEmpty()
  property_subtype_id: number;

  // Addresses (mínimo 1 requerido)
  @ApiProperty({ type: CreatePropertyAddressDto, isArray: true })
  @IsArray()
  @IsNotEmpty()
  addresses: CreatePropertyAddressDto[];

  // Owners (opcional, puede ser array de dueños nuevos o existentes)
  @ApiPropertyOptional({ type: AssignOwnerDto, isArray: true })
  @IsArray()
  @IsOptional()
  existing_owners?: AssignOwnerDto[]; // IDs de dueños existentes

  @ApiPropertyOptional({ type: CreateRentalOwnerDto, isArray: true })
  @IsArray()
  @IsOptional()
  new_owners?: CreateRentalOwnerDto[]; // Crear nuevos dueños

  // Optional fields
  @ApiPropertyOptional({ example: 'Departamento amplio y luminoso.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 3000, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  security_deposit_amount?: number;

  @IsOptional()
  @IsString()
  account_number?: string;

  @IsOptional()
  @IsString()
  account_type?: string;

  @IsOptional()
  @IsString()
  account_holder_name?: string;

  // Financial fields
  @ApiPropertyOptional({ example: 3000, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthly_rent?: number;

  @ApiPropertyOptional({ example: 'BOB' })
  @IsOptional()
  @IsString()
  currency?: string;

  // Property characteristics
  @ApiPropertyOptional({ example: 90, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  square_meters?: number;

  @ApiPropertyOptional({ example: 2, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  bedrooms?: number;

  @ApiPropertyOptional({ example: 1, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  bathrooms?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  parking_spaces?: number;

  @IsOptional()
  @IsNumber()
  year_built?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  is_furnished?: boolean;

  // Location
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  // Amenities
  @ApiPropertyOptional({ type: String, isArray: true, example: ['parrilla'] })
  @IsOptional()
  @IsArray()
  amenities?: string[];

  @ApiPropertyOptional({ type: String, isArray: true, example: ['cortinas'] })
  @IsOptional()
  @IsArray()
  included_items?: string[];

  // Property rules
  @ApiPropertyOptional({
    example: { pets_allowed: true, smoking_allowed: false, max_occupants: 3 },
  })
  @IsOptional()
  property_rules?: {
    pets_allowed?: boolean;
    smoking_allowed?: boolean;
    max_occupants?: number;
    min_lease_months?: number;
  };
}
