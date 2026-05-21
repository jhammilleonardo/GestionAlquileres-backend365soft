import {
  IsNumber,
  IsString,
  IsOptional,
  IsObject,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class PersonalDataDto {
  @ApiProperty({ example: 'Luis Rojas' })
  @IsString()
  full_name: string;

  @ApiProperty({ example: '+59171111111' })
  @IsString()
  phone: string;

  @ApiProperty({ example: 'CI-1234567' })
  @IsString()
  identity_document: string;

  @ApiProperty({ example: 'Av. Siempre Viva 123' })
  @IsString()
  current_address: string;

  @ApiPropertyOptional({ example: '1992-03-14' })
  @IsOptional()
  @IsString()
  birth_date?: string;
}

class EmploymentDataDto {
  @ApiProperty({ example: 'Empresa Demo SRL' })
  @IsString()
  employer_name: string;

  @ApiProperty({ example: 'Analista de sistemas' })
  @IsString()
  position: string;

  @ApiProperty({ example: 8500 })
  @IsNumber()
  monthly_income: number;

  @ApiProperty({ example: '3 años' })
  @IsString()
  employment_duration: string;

  @ApiProperty({ example: '+59170000000' })
  @IsString()
  employer_phone: string;
}

class RentalHistoryDto {
  @ApiProperty({ example: 'Calle anterior 456' })
  @IsString()
  previous_address: string;

  @ApiProperty({ example: 'Ana Perez' })
  @IsString()
  previous_landlord_name: string;

  @ApiProperty({ example: '+59172222222' })
  @IsString()
  previous_landlord_phone: string;

  @ApiProperty({ example: 'Cambio de zona' })
  @IsString()
  reason_for_leaving: string;

  @ApiProperty({ example: 2500 })
  @IsNumber()
  previous_rent_amount: number;
}

class ReferenceDto {
  @ApiProperty({ example: 'Carlos Vera' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Compañero de trabajo' })
  @IsString()
  relationship: string;

  @ApiProperty({ example: '+59173333333' })
  @IsString()
  phone: string;
}

class DocumentDto {
  @ApiProperty({ example: 'carnet_anverso' })
  @IsString()
  type: string;

  @ApiProperty({ example: '/storage/applications/mi-empresa/1/carnet.jpg' })
  @IsString()
  url: string;

  @ApiProperty({ example: 'carnet.jpg' })
  @IsString()
  name: string;
}

export class CreateApplicationDto {
  @ApiProperty({ example: 12 })
  @IsNumber()
  property_id: number;

  @ApiProperty({ type: PersonalDataDto })
  @IsObject()
  @ValidateNested()
  @Type(() => PersonalDataDto)
  personal_data: PersonalDataDto;

  @ApiProperty({ type: EmploymentDataDto })
  @IsObject()
  @ValidateNested()
  @Type(() => EmploymentDataDto)
  employment_data: EmploymentDataDto;

  @ApiProperty({ type: RentalHistoryDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RentalHistoryDto)
  rental_history: RentalHistoryDto[];

  @ApiProperty({ type: ReferenceDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferenceDto)
  references: ReferenceDto[];

  @ApiPropertyOptional({ type: DocumentDto, isArray: true })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => DocumentDto)
  documents?: DocumentDto[];

  @ApiPropertyOptional({ example: 'Busco contrato de largo plazo.' })
  @IsOptional()
  @IsString()
  additional_notes?: string;
}
