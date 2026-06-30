import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AddViolationNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  note: string;
}
