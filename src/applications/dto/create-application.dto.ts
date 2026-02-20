import {
  IsNumber,
  IsString,
  IsOptional,
  IsObject,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class PersonalDataDto {
  @IsString()
  full_name: string;

  @IsString()
  phone: string;

  @IsString()
  identity_document: string;

  @IsString()
  current_address: string;

  @IsOptional()
  @IsString()
  birth_date?: string;
}

class EmploymentDataDto {
  @IsString()
  employer_name: string;

  @IsString()
  position: string;

  @IsNumber()
  monthly_income: number;

  @IsString()
  employment_duration: string;

  @IsString()
  employer_phone: string;
}

class RentalHistoryDto {
  @IsString()
  previous_address: string;

  @IsString()
  previous_landlord_name: string;

  @IsString()
  previous_landlord_phone: string;

  @IsString()
  reason_for_leaving: string;

  @IsNumber()
  previous_rent_amount: number;
}

class ReferenceDto {
  @IsString()
  name: string;

  @IsString()
  relationship: string;

  @IsString()
  phone: string;
}

class DocumentDto {
  @IsString()
  type: string;

  @IsString()
  url: string;

  @IsString()
  name: string;
}

export class CreateApplicationDto {
  @IsNumber()
  property_id: number;

  @IsObject()
  @ValidateNested()
  @Type(() => PersonalDataDto)
  personal_data: PersonalDataDto;

  @IsObject()
  @ValidateNested()
  @Type(() => EmploymentDataDto)
  employment_data: EmploymentDataDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RentalHistoryDto)
  rental_history: RentalHistoryDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferenceDto)
  references: ReferenceDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => DocumentDto)
  documents?: DocumentDto[];

  @IsOptional()
  @IsString()
  additional_notes?: string;
}
