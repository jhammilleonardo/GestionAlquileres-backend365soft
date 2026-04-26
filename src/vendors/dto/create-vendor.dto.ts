import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsEmail,
  IsNumber,
  IsBoolean,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VendorSpecialty } from '../enums/vendor-specialty.enum';

export class CreateVendorDto {
  @ApiProperty({ example: 'Instalaciones Rápidas S.R.L.', description: 'Nombre del proveedor' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ enum: VendorSpecialty, description: 'Especialidad principal del proveedor' })
  @IsEnum(VendorSpecialty)
  specialty: VendorSpecialty;

  @ApiPropertyOptional({ example: '+591 76543210', description: 'Teléfono de contacto' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'contacto@instalaciones.bo', description: 'Email de contacto' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Av. Arce 1234, La Paz', description: 'Dirección del proveedor' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 80, description: 'Tarifa por hora en la moneda del tenant' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rate_per_hour?: number;

  @ApiPropertyOptional({ example: 500, description: 'Tarifa fija por servicio' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rate_flat?: number;

  @ApiPropertyOptional({ example: 'Disponible lunes a viernes de 8:00 a 18:00' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
