import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsIn,
  IsBoolean,
  IsOptional,
} from 'class-validator';

export class CreateContractTemplateDto {
  @IsString()
  @IsIn(['es', 'en', 'pt'])
  language: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
