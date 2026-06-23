import {
  IsNumber,
  IsString,
  IsOptional,
  IsObject,
  IsArray,
  ValidateNested,
  MaxLength,
  ArrayMaxSize,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class PersonalDataDto {
  @ApiProperty({ example: 'Luis Rojas' })
  @IsString()
  @MaxLength(120)
  full_name: string;

  @ApiProperty({ example: '+59171111111' })
  @IsString()
  @MaxLength(50)
  phone: string;

  @ApiProperty({ example: 'CI-1234567' })
  @IsString()
  @MaxLength(80)
  identity_document: string;

  @ApiProperty({ example: 'Av. Siempre Viva 123' })
  @IsString()
  @MaxLength(250)
  current_address: string;

  @ApiPropertyOptional({ example: '1992-03-14' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  birth_date?: string;
}

class EmploymentDataDto {
  @ApiProperty({ example: 'Empresa Demo SRL' })
  @IsString()
  @MaxLength(160)
  employer_name: string;

  @ApiProperty({ example: 'Analista de sistemas' })
  @IsString()
  @MaxLength(120)
  position: string;

  @ApiProperty({ example: 8500 })
  @IsNumber()
  @Min(0)
  monthly_income: number;

  @ApiProperty({ example: '3 años' })
  @IsString()
  @MaxLength(80)
  employment_duration: string;

  @ApiProperty({ example: '+59170000000' })
  @IsString()
  @MaxLength(50)
  employer_phone: string;
}

class RentalHistoryDto {
  @ApiProperty({ example: 'Calle anterior 456' })
  @IsString()
  @MaxLength(250)
  previous_address: string;

  @ApiProperty({ example: 'Ana Perez' })
  @IsString()
  @MaxLength(120)
  previous_landlord_name: string;

  @ApiProperty({ example: '+59172222222' })
  @IsString()
  @MaxLength(50)
  previous_landlord_phone: string;

  @ApiProperty({ example: 'Cambio de zona' })
  @IsString()
  @MaxLength(500)
  reason_for_leaving: string;

  @ApiProperty({ example: 2500 })
  @IsNumber()
  @Min(0)
  previous_rent_amount: number;
}

class ReferenceDto {
  @ApiProperty({ example: 'Carlos Vera' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'Compañero de trabajo' })
  @IsString()
  @MaxLength(80)
  relationship: string;

  @ApiProperty({ example: '+59173333333' })
  @IsString()
  @MaxLength(50)
  phone: string;
}

class DocumentDto {
  @ApiProperty({ example: 'carnet_anverso' })
  @IsString()
  @MaxLength(80)
  type: string;

  @ApiProperty({ example: '/storage/applications/mi-empresa/1/carnet.jpg' })
  @IsString()
  @MaxLength(500)
  url: string;

  @ApiProperty({ example: 'carnet.jpg' })
  @IsString()
  @MaxLength(180)
  name: string;
}

export class CreateApplicationDto {
  @ApiProperty({ example: 12 })
  @IsNumber()
  @Min(1)
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
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => RentalHistoryDto)
  rental_history: RentalHistoryDto[];

  @ApiProperty({ type: ReferenceDto, isArray: true })
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ReferenceDto)
  references: ReferenceDto[];

  @ApiPropertyOptional({ type: DocumentDto, isArray: true })
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => DocumentDto)
  documents?: DocumentDto[];

  @ApiPropertyOptional({ example: 'Busco contrato de largo plazo.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  additional_notes?: string;
}
