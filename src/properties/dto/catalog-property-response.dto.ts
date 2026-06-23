import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CatalogPropertyAddressResponseDto {
  @ApiProperty({ example: 'La Paz' })
  city: string;

  @ApiProperty({ example: 'La Paz' })
  state: string;

  @ApiProperty({ example: 'Bolivia' })
  country: string;
}

/**
 * DTO de respuesta para una propiedad en el catálogo público
 */
export class CatalogPropertyResponseDto {
  @ApiProperty({ example: 8 })
  id: number;

  @ApiProperty({ example: 'Departamento Centro' })
  title: string;

  @ApiProperty({ example: 'Departamento amplio y luminoso.' })
  description: string;

  @ApiProperty({ example: 'DISPONIBLE' })
  status: string;

  @ApiProperty({ example: 3000 })
  monthly_rent: number;

  @ApiPropertyOptional({
    example: 120,
    description:
      'Precio mínimo por noche entre unidades disponibles de corto plazo.',
  })
  min_price_per_night?: number;

  @ApiProperty({ example: 'BOB' })
  currency: string;

  @ApiPropertyOptional({
    example: 'BOTH',
    enum: ['SHORT_TERM', 'LONG_TERM', 'BOTH'],
  })
  rental_type?: string;

  @ApiPropertyOptional({ example: 2 })
  bedrooms?: number;

  @ApiPropertyOptional({ example: 1 })
  bathrooms?: number;

  @ApiPropertyOptional({ example: 90 })
  square_meters?: number;

  @ApiPropertyOptional({ example: 1 })
  parking_spaces?: number;

  @ApiPropertyOptional({ example: false })
  is_furnished?: boolean;

  @ApiPropertyOptional({ example: 'Residencial' })
  property_type_name?: string;

  @ApiPropertyOptional({ example: 'Departamento' })
  property_subtype_name?: string;

  @ApiProperty({ type: String, isArray: true })
  images: string[];

  @ApiProperty({ type: String, isArray: true })
  amenities: string[];

  @ApiProperty({ example: 12 })
  view_count: number;

  @ApiPropertyOptional({ example: 4 })
  total_units?: number;

  @ApiPropertyOptional({ example: 2 })
  available_units?: number;

  @ApiPropertyOptional({ example: 1 })
  available_short_term_units?: number;

  @ApiPropertyOptional({ example: 1 })
  available_long_term_units?: number;

  @ApiPropertyOptional({ type: CatalogPropertyAddressResponseDto })
  first_address?: CatalogPropertyAddressResponseDto;

  @ApiProperty({ example: '2026-05-20T10:00:00.000Z' })
  created_at: Date;

  @ApiProperty({ example: '2026-05-20T10:00:00.000Z' })
  updated_at: Date;
}

/**
 * DTO de respuesta paginada para el catálogo de propiedades
 */
export class PaginatedCatalogPropertiesResponseDto {
  @ApiProperty({ type: CatalogPropertyResponseDto, isArray: true })
  data: CatalogPropertyResponseDto[];

  @ApiProperty({ example: 40 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 2 })
  totalPages: number;
}

/**
 * DTO de respuesta completa para el detalle de una propiedad
 */
export class CatalogPropertyDetailResponseDto {
  @ApiProperty({ example: 8 })
  id: number;

  @ApiProperty({ example: 'Departamento Centro' })
  title: string;

  @ApiProperty({ example: 'Departamento amplio y luminoso.' })
  description: string;

  @ApiProperty({ example: 'DISPONIBLE' })
  status: string;

  @ApiProperty({ example: 3000 })
  monthly_rent: number;

  @ApiPropertyOptional({
    example: 120,
    description:
      'Precio mínimo por noche entre unidades disponibles de corto plazo.',
  })
  min_price_per_night?: number;

  @ApiPropertyOptional({
    example: 'BOTH',
    enum: ['SHORT_TERM', 'LONG_TERM', 'BOTH'],
  })
  rental_type?: string;

  @ApiPropertyOptional({ example: 3000 })
  security_deposit_amount?: number;

  @ApiProperty({ example: 'BOB' })
  currency: string;

  @ApiPropertyOptional({ example: 2 })
  bedrooms?: number;

  @ApiPropertyOptional({ example: 1 })
  bathrooms?: number;

  @ApiPropertyOptional({ example: 90 })
  square_meters?: number;

  @ApiPropertyOptional({ example: 1 })
  parking_spaces?: number;

  @ApiProperty({ example: false })
  is_furnished: boolean;

  @ApiPropertyOptional({ example: -16.5 })
  latitude?: number;

  @ApiPropertyOptional({ example: -68.15 })
  longitude?: number;

  // Relaciones
  @ApiProperty({ type: Object })
  property_type: {
    id: number;
    name: string;
    code: string;
  };

  @ApiProperty({ type: Object })
  property_subtype: {
    id: number;
    name: string;
    code: string;
  };

  @ApiProperty({ type: Object, isArray: true })
  addresses: Array<{
    id: number;
    address_type: string;
    street_address: string;
    city: string;
    state: string;
    zip_code: string;
    country: string;
  }>;

  @ApiProperty({ type: String, isArray: true })
  images: string[];

  @ApiProperty({ type: String, isArray: true })
  amenities: string[];

  @ApiProperty({ type: String, isArray: true })
  included_items: string[];

  @ApiProperty({ type: Object })
  property_rules: {
    pets_allowed?: boolean;
    smoking_allowed?: boolean;
    max_occupants?: number;
    min_lease_months?: number;
    additional_rules?: string;
  };

  // Contadores
  @ApiProperty({ example: 12 })
  view_count: number;

  @ApiPropertyOptional({ example: '2026-05-20T10:00:00.000Z' })
  last_viewed_at?: Date;

  @ApiProperty({ example: '2026-05-20T10:00:00.000Z' })
  created_at: Date;

  @ApiProperty({ example: '2026-05-20T10:00:00.000Z' })
  updated_at: Date;
}
