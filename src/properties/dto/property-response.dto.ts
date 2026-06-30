import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PropertyAddressResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 8 })
  property_id: number;

  @ApiProperty({ example: 'address_1' })
  address_type: string;

  @ApiProperty({ example: 'Av. Siempre Viva 123' })
  street_address: string;

  @ApiPropertyOptional({ example: 'La Paz', nullable: true })
  city?: string | null;

  @ApiPropertyOptional({ example: 'La Paz', nullable: true })
  state?: string | null;

  @ApiPropertyOptional({ example: '0000', nullable: true })
  zip_code?: string | null;

  @ApiProperty({ example: 'Bolivia' })
  country: string;
}

export class PropertyTypeResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Residencial' })
  name: string;

  @ApiProperty({ example: 'residential' })
  code: string;
}

export class PropertyOwnerResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 8 })
  property_id: number;

  @ApiProperty({ example: 4 })
  rental_owner_id: number;

  @ApiProperty({ example: 100 })
  ownership_percentage: number;

  @ApiProperty({ example: true })
  is_primary: boolean;

  @ApiProperty({ example: 'Ana Perez' })
  name: string;

  @ApiProperty({ example: 'ana@example.com' })
  primary_email: string;

  @ApiProperty({ example: '+59171111111' })
  phone_number: string;
}

export class PropertyDetailResponseDto {
  @ApiProperty({ example: 8 })
  id: number;

  @ApiProperty({ example: 'Departamento Centro' })
  title: string;

  @ApiPropertyOptional({ example: 'Departamento amplio y luminoso.' })
  description?: string | null;

  @ApiProperty({ example: 1 })
  property_type_id: number;

  @ApiProperty({ example: 2 })
  property_subtype_id: number;

  @ApiProperty({ example: 'DISPONIBLE' })
  status: string;

  @ApiPropertyOptional({ example: 'SHORT_TERM', nullable: true })
  rental_type?: string | null;

  @ApiPropertyOptional({ example: 3000, nullable: true })
  monthly_rent?: number | null;

  @ApiPropertyOptional({ example: 3000, nullable: true })
  security_deposit_amount?: number | null;

  @ApiPropertyOptional({ example: 'BOB', nullable: true })
  currency?: string | null;

  @ApiPropertyOptional({ example: 90, nullable: true })
  square_meters?: number | null;

  @ApiPropertyOptional({ example: 2, nullable: true })
  bedrooms?: number | null;

  @ApiPropertyOptional({ example: 1, nullable: true })
  bathrooms?: number | null;

  @ApiPropertyOptional({ example: 1, nullable: true })
  parking_spaces?: number | null;

  @ApiProperty({ example: false })
  is_furnished: boolean;

  @ApiProperty({ type: String, isArray: true })
  images: string[];

  @ApiProperty({ type: String, isArray: true })
  amenities: string[];

  @ApiProperty({ type: String, isArray: true })
  included_items: string[];

  @ApiProperty({ type: PropertyTypeResponseDto })
  property_type: PropertyTypeResponseDto;

  @ApiProperty({ type: PropertyTypeResponseDto })
  property_subtype: PropertyTypeResponseDto;

  @ApiProperty({ type: PropertyAddressResponseDto, isArray: true })
  addresses: PropertyAddressResponseDto[];

  @ApiProperty({ type: PropertyOwnerResponseDto, isArray: true })
  owners: PropertyOwnerResponseDto[];
}

export class PaginatedPropertiesResponseDto {
  @ApiProperty({ type: Object, isArray: true })
  items: Record<string, unknown>[];

  @ApiProperty({ example: 40 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: 4 })
  pages: number;
}

export class PropertyStatsResponseDto {
  @ApiProperty({ example: 40 })
  total: number;

  @ApiProperty({ example: 20 })
  available: number;

  @ApiProperty({ example: 15 })
  occupied: number;

  @ApiProperty({ example: 2 })
  maintenance: number;

  @ApiProperty({ example: 2 })
  reserved: number;

  @ApiProperty({ example: 1 })
  inactive: number;
}

export class PropertyMutationMessageResponseDto {
  @ApiProperty({ example: 'Property deleted successfully' })
  message: string;

  @ApiProperty({ example: 8 })
  id: number;
}

export class PropertyImageDeleteDto {
  @ApiProperty({ example: 'properties/mi-empresa/8/foto.jpg' })
  image_url: string;
}
