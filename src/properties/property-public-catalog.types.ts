export interface PublicCatalogAddress {
  id?: number;
  property_id?: number;
  address_type?: string;
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  country?: string | null;
}

export interface PublicCatalogOwner {
  id: number;
  name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
}

export interface PublicCatalogProperty {
  id: number;
  title: string;
  description?: string | null;
  property_type_id?: number | null;
  property_subtype_id?: number | null;
  status: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  monthly_rent?: string | number | null;
  currency?: string | null;
  rental_type?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  square_meters?: string | number | null;
  parking_spaces?: number | null;
  is_furnished?: boolean | null;
  images?: unknown[] | null;
  amenities?: unknown[] | null;
  included_items?: unknown[] | null;
  view_count?: number | null;
  last_viewed_at?: Date | string | null;
  created_at?: Date | string;
  updated_at?: Date | string;
  property_type_name?: string | null;
  property_type_code?: string | null;
  property_subtype_name?: string | null;
  property_subtype_code?: string | null;
  first_address?: PublicCatalogAddress | null;
}

export interface PublicCatalogUnit {
  id: number;
  unit_number: string;
  rental_type: string | null;
  status: string | null;
  price_per_night: number | null;
  cleaning_fee: number | null;
  min_nights: number | null;
  max_nights: number | null;
  checkin_time: string | null;
  checkout_time: string | null;
}

export interface PublicCatalogPropertyDetail extends PublicCatalogProperty {
  addresses: PublicCatalogAddress[];
  owners: PublicCatalogOwner[];
  units: PublicCatalogUnit[];
}

export interface PublicCatalogResult {
  data: PublicCatalogProperty[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PublicCatalogWhereClause {
  whereSql: string;
  params: unknown[];
  nextParamIndex: number;
}
