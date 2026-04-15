/**
 * DTO de respuesta para una propiedad en el catálogo público
 */
export class CatalogPropertyResponseDto {
  id: number;
  title: string;
  description: string;
  status: string;
  monthly_rent: number;
  currency: string;
  bedrooms?: number;
  bathrooms?: number;
  square_meters?: number;
  parking_spaces?: number;
  is_furnished?: boolean;
  property_type_name?: string;
  property_subtype_name?: string;
  images: string[];
  amenities: string[];
  view_count: number;
  first_address?: {
    street_address: string;
    city: string;
    state: string;
    country: string;
    zip_code: string;
  };
  created_at: Date;
  updated_at: Date;
}

/**
 * DTO de respuesta paginada para el catálogo de propiedades
 */
export class PaginatedCatalogPropertiesResponseDto {
  data: CatalogPropertyResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * DTO de respuesta completa para el detalle de una propiedad
 */
export class CatalogPropertyDetailResponseDto {
  id: number;
  title: string;
  description: string;
  status: string;
  monthly_rent: number;
  security_deposit_amount?: number;
  currency: string;
  bedrooms?: number;
  bathrooms?: number;
  square_meters?: number;
  parking_spaces?: number;
  is_furnished: boolean;
  latitude?: number;
  longitude?: number;
  
  // Relaciones
  property_type: {
    id: number;
    name: string;
    code: string;
  };
  property_subtype: {
    id: number;
    name: string;
    code: string;
  };
  
  addresses: Array<{
    id: number;
    address_type: string;
    street_address: string;
    city: string;
    state: string;
    zip_code: string;
    country: string;
  }>;

  images: string[];
  amenities: string[];
  included_items: string[];
  property_rules: {
    pets_allowed?: boolean;
    smoking_allowed?: boolean;
    max_occupants?: number;
    min_lease_months?: number;
    additional_rules?: string;
  };

  // Información de contacto de dueños
  owners: Array<{
    id: number;
    name: string;
    company_name?: string;
    email: string;
    phone: string;
    is_primary: boolean;
  }>;

  // Contadores
  view_count: number;
  last_viewed_at?: Date;

  created_at: Date;
  updated_at: Date;
}
