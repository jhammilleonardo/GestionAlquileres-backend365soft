import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VendorResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Plomería Central' })
  name: string;

  @ApiProperty({ example: 'PLUMBING' })
  specialty: string;

  @ApiPropertyOptional({ example: '+59171111111', nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ example: 'proveedor@example.com', nullable: true })
  email: string | null;

  @ApiPropertyOptional({ example: 'Av. Principal 123', nullable: true })
  address: string | null;

  @ApiPropertyOptional({ example: '80.00', nullable: true })
  rate_per_hour: string | null;

  @ApiProperty({ example: true })
  is_active: boolean;

  @ApiPropertyOptional({ example: '4.50', nullable: true })
  average_rating: string | null;
}

export class VendorMessageResponseDto {
  @ApiProperty({ example: 'Proveedor 1 desactivado correctamente' })
  message: string;
}

export class VendorHistoryResponseDto {
  @ApiProperty({ example: 10 })
  id: number;

  @ApiProperty({ example: 'MT-2026-0001' })
  ticket_number: string;

  @ApiProperty({ example: 'Fuga de agua' })
  title: string;

  @ApiProperty({ example: 'COMPLETED' })
  status: string;

  @ApiPropertyOptional({ example: 5, nullable: true })
  vendor_rating: number | null;
}
