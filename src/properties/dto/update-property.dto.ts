import {
  IsOptional,
  IsNumber,
  IsString,
  IsBoolean,
  IsArray,
  Min,
  IsEnum,
} from 'class-validator';
import { CreatePropertyAddressDto } from './create-property.dto';

// DTO independiente para actualizar propiedad (sin herencia compleja)
export class UpdatePropertyDto {
  // Basic Info
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsNumber()
  property_type_id?: number;

  @IsOptional()
  @IsNumber()
  property_subtype_id?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  addresses?: CreatePropertyAddressDto[];

  // Financial fields
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthly_rent?: number;

  @IsOptional()
  @IsString()
  currency?: string;

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

  // Property characteristics
  @IsOptional()
  @IsNumber()
  @Min(0)
  square_meters?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bedrooms?: number;

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

  // Arrays
  @IsOptional()
  @IsArray()
  images?: string[];

  @IsOptional()
  @IsArray()
  amenities?: string[];

  @IsOptional()
  @IsArray()
  included_items?: string[];

  // Property rules (JSONB)
  @IsOptional()
  property_rules?: {
    pets_allowed?: boolean;
    smoking_allowed?: boolean;
    max_occupants?: number;
    min_lease_months?: number;
  };

  // Status
  @IsOptional()
  @IsEnum(['DISPONIBLE', 'OCUPADO', 'MANTENIMIENTO', 'RESERVADO', 'INACTIVO'])
  status?: string;
}
