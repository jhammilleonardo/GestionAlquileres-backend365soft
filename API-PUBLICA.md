# Endpoints Públicos

Documentación de endpoints sin autenticación (públicos).

## Catálogo de Propiedades

Ver [API-CATALOG.md](./API-CATALOG.md)
# API Documentation - Catálogo Público (Sin Autenticación)

Esta documentación está diseñada para el frontend público donde los usuarios (sin cuenta) pueden ver las propiedades disponibles de diferentes organizaciones/tenants. **No se requiere autenticación para ninguna de estas endpoints.**

**Base URL:** `http://localhost:3000`

---

## Índice

1. [Catálogo de Propiedades por Organización](#1-catálogo-de-propiedades-por-organización)
2. [Detalle de Propiedad Pública](#2-detalle-de-propiedad-pública)
3. [Información de Organización/Tenant](#3-información-de-organizacióntenant)
4. [Health Check](#4-health-check)
5. [Sitio Web Público del Tenant](#5-sitio-web-público-del-tenant)

---

## Descripción General

El catálogo público permite a cualquier usuario (sin autenticación) ver:
- Propiedades disponibles de una organización específica
- Detalles completos de cada propiedad
- Información de contacto de dueños
- Amenities, imágenes y ubicación

**Características:**
- ✅ No requiere registro ni login
- ✅ Acceso completo a propiedades con status "DISPONIBLE"
- ✅ Búsqueda y filtrado avanzado
- ✅ Información completa para toma de decisiones

---

## 1. Catálogo de Propiedades por Organización

### 1.1 Listar Propiedades Disponibles de una Organización

**Endpoint:** `GET /:slug/catalog/properties`
**Auth:** No requerida (pública)

**URL Params:**
- `slug` - El slug identificador de la organización/tenant

**Query Params (Todos opcionales):**
```
?status=DISPONIBLE
&property_type_id=1
&property_subtype_id=2
&city=Buenos Aires
&country=Argentina
&search=apartamento
&sort_by=created_at
&sort_order=DESC
&page=1
&limit=20
```

**Descripción de Filtros:**

| Parámetro | Tipo | Descripción | Ejemplo |
|-----------|------|-------------|---------|
| `status` | string | Filtra por estado de propiedad | `DISPONIBLE`, `OCUPADO`, `MANTENIMIENTO`, `RESERVADO` |
| `property_type_id` | number | Filtra por tipo de propiedad | `1` (Apartamento), `2` (Casa), etc. |
| `property_subtype_id` | number | Filtra por subtipo específico | `1` (Studio), `2` (1 Dormitorio), etc. |
| `city` | string | Filtra por ciudad | `Buenos Aires`, `Madrid`, etc. |
| `country` | string | Filtra por país | `Argentina`, `España`, etc. |
| `search` | string | Busca en título y descripción | `moderno`, `vista al río`, etc. |
| `sort_by` | string | Campo de ordenación | `created_at`, `updated_at`, `title` |
| `sort_order` | string | Orden ascendente/descendente | `ASC`, `DESC` |
| `page` | number | Número de página (empieza en 1) | `1`, `2`, `3`... |
| `limit` | number | Resultados por página (max 100) | `10`, `20`, `50` |

---

### Ejemplos de Requests

#### Ejemplo 1: Listado básico
```http
GET /mi-inmobiliaria/catalog/properties
```
Todas las propiedades disponibles de "mi-inmobiliaria".

#### Ejemplo 2: Filtrar por ciudad
```http
GET /mi-inmobiliaria/catalog/properties?city=Buenos Aires&status=DISPONIBLE
```
Propiedades disponibles en Buenos Aires.

#### Ejemplo 3: Buscar apartamentos modernos
```http
GET /mi-inmobiliaria/catalog/properties?property_type_id=1&search=moderno
```
Apartamentos que contengan "moderno" en título/descripción.

#### Ejemplo 4: Paginación
```http
GET /mi-inmobiliaria/catalog/properties?page=1&limit=12&sort_by=created_at&sort_order=DESC
```
Primeras 12 propiedades, ordenadas por fecha de creación (más recientes primero).

#### Ejemplo 5: Búsqueda avanzada
```http
GET /mi-inmobiliaria/catalog/properties?status=DISPONIBLE&property_type_id=1&property_subtype_id=2&city=Buenos Aires&country=Argentina&sort_by=title&sort_order=ASC&page=1&limit=20
```
Apartamentos de 1 dormitorio en Buenos Aires, Argentina, ordenados alfabéticamente.

---

### Response (200) - Éxito

```json
[
  {
    "id": 1,
    "title": "Apartamento Moderno en Centro",
    "property_type_id": 1,
    "property_subtype_id": 2,
    "status": "DISPONIBLE",
    "description": "Hermoso apartamento totalmente amoblado con vista al río. Ubicado en el corazón de Buenos Aires, cerca de transporte, restaurantes y comercios.",
    "security_deposit_amount": 5000,
    "latitude": -34.6037,
    "longitude": -58.3816,
    "images": [
      "/storage/properties/photo1.jpg",
      "/storage/properties/photo2.jpg",
      "/storage/properties/photo3.jpg",
      "/storage/properties/photo4.jpg"
    ],
    "amenities": [
      "WiFi de alta velocidad (200Mbps)",
      "Smart TV 55' 4K",
      "Aire Acondicionado split frio/calor",
      "Calefacción central",
      "Gimnasio en el edificio (24hs)",
      "Piscina en la terraza",
      "Sauna",
      "Laundry en el piso",
      "Seguridad 24hs"
    ],
    "included_items": [
      "Toallas blancas premium",
      "Ropa de cama 100% algodón",
      "Vajilla completa para 4 personas",
      "Utensilios de cocina",
      "Cafetera eléctrica",
      "Tostadora",
      "Microondas",
      "Plancha y tabla",
      "Secador de pelo"
    ],
    "created_at": "2026-01-30T15:20:30.000Z",
    "updated_at": "2026-01-30T15:25:30.000Z",
    "property_type": {
      "id": 1,
      "name": "Apartamento",
      "description": "Unidades residenciales en edificios"
    },
    "property_subtype": {
      "id": 2,
      "name": "1 Dormitorio",
      "description": "Apartamento con 1 dormitorio"
    },
    "addresses": [
      {
        "id": 1,
        "address_type": "address_1",
        "street_address": "Av. Libertador 1234, Piso 5, Depto A",
        "city": "Buenos Aires",
        "state": "Capital Federal",
        "zip_code": "1001",
        "country": "Argentina"
      }
    ]
  },
  {
    "id": 2,
    "title": "Studio Moderno con Balcón",
    "property_type_id": 1,
    "property_subtype_id": 1,
    "status": "DISPONIBLE",
    "description": "Acogedor studio tipo loft con balcón privado y vista panorámica. Ideal para profesionales jóvenes.",
    "security_deposit_amount": 3500,
    "latitude": -34.5920,
    "longitude": -58.3750,
    "images": [
      "/storage/properties/studio1.jpg",
      "/storage/properties/studio2.jpg"
    ],
    "amenities": [
      "WiFi",
      "Aire Acondicionado",
      "Balcón privado"
    ],
    "included_items": [
      "Toallas",
      "Ropa de Cama"
    ],
    "property_type": {
      "id": 1,
      "name": "Apartamento"
    },
    "property_subtype": {
      "id": 1,
      "name": "Studio/Loft"
    },
    "addresses": [
      {
        "street_address": "Av. Santa Fe 2345, 4º Piso",
        "city": "Buenos Aires",
        "country": "Argentina"
      }
    ]
  }
]
```

---

### Response (404) - Organización no encontrada

```json
{
  "statusCode": 404,
  "message": "Tenant not found"
}
```

Esto ocurre cuando el slug de la organización no existe.

---

## 2. Detalle de Propiedad Pública

### 2.1 Obtener Detalle Completo de una Propiedad

**Endpoint:** `GET /:slug/catalog/properties/:id`
**Auth:** No requerida (pública)

**URL Params:**
- `slug` - El slug de la organización/tenant
- `id` - El ID de la propiedad

**Response (200) - Propiedad encontrada:**

```json
{
  "id": 1,
  "title": "Apartamento Moderno en Centro",
  "property_type_id": 1,
  "property_subtype_id": 2,
  "status": "DISPONIBLE",
  "description": "Hermoso apartamento totalmente amoblado con vista al río. Ubicado en el corazón de Buenos Aires, a pasos de los principales puntos de interés. Edificio nuevo con amenities de primer nivel.\n\nEl departamento cuenta con toda la equipamiento necesario para una estadía cómoda: cocina completa integrada, living comedor con vista al río, dormitorio con placard grande y baño completo con ducha.\n\nEdificio con gimnasio, piscina, sauna y seguridad 24hs.",
  "security_deposit_amount": 5000,
  "latitude": -34.6037,
  "longitude": -58.3816,
  "images": [
    "/storage/properties/abc123.jpg",
    "/storage/properties/def456.jpg",
    "/storage/properties/ghi789.jpg",
    "/storage/properties/jkl012.jpg",
    "/storage/properties/mno345.jpg"
  ],
  "amenities": [
    "WiFi de alta velocidad (200Mbps simétrico)",
    "Smart TV Samsung 55 pulgadas 4K con Netflix incluido",
    "Aire Acondicionado split frio/calor en living y dormitorio",
    "Calefacción central",
    "Gimnasio fully equipado en el piso 1 (24hs)",
    "Piscina climatizada en la terraza (temporada: septiembre-abril)",
    "Sauna y vapor",
    "Laundry en cada piso con lavadoras y secadoras",
    "Seguridad 24hs con cámaras y guardia",
    "Baulera individual en sótano",
    "Acceso a terraza con asadores",
    "Bici-estacionamiento"
  ],
  "included_items": [
    "Toallas blancas premium (conjunto completo)",
    "Ropa de cama 100% algodón (almohadas incluidas)",
    "Vajilla completa para 4 personas (platos, cubiertos, vasos)",
    "Utensilios de cocina completos (ollas, sartenes, cuchillos)",
    "Cafetera eléctrica + filtros de café",
    "Tostadora de pan",
    "Microondas",
    "Plancha a vapor y tabla de planchar",
    "Secador de pelo profesional",
    "Servilletas de tela y manteles",
    "Set de limpieza básico",
    "Papel higiénico y jabón de bienvenida"
  ],
  "created_at": "2026-01-30T15:20:30.000Z",
  "updated_at": "2026-01-30T15:25:30.000Z",
  "property_type": {
    "id": 1,
    "name": "Apartamento",
    "description": "Unidades residenciales en edificios"
  },
  "property_subtype": {
    "id": 2,
    "name": "1 Dormitorio",
    "description": "Apartamento con 1 dormitorio"
  },
  "addresses": [
    {
      "id": 1,
      "property_id": 1,
      "address_type": "address_1",
      "street_address": "Av. Libertador 1234, Piso 5, Depto A",
      "city": "Buenos Aires",
      "state": "Capital Federal",
      "zip_code": "1001",
      "country": "Argentina"
    }
  ],
  "owners": [
    {
      "id": 5,
      "name": "Carlos González",
      "company_name": null,
      "is_company": false,
      "primary_email": "carlos@email.com",
      "phone_number": "+5491198765432",
      "secondary_email": "carlos.alt@email.com",
      "secondary_phone": "+5491198765433",
      "notes": "Dueño principal, contacto preferente. Responde rápido por WhatsApp.",
      "ownership_percentage": 100,
      "is_primary": true,
      "created_at": "2026-01-30T10:00:00.000Z"
    }
  ],
  "account_number": "123-456-789",
  "account_type": "Ahorros",
  "account_holder_name": "Carlos González"
}
```

---

### Response (404) - Propiedad no encontrada

```json
{
  "statusCode": 404,
  "message": "Property not found"
}
```

---

## 3. Información de Organización/Tenant

### 3.1 Obtener información de una organización por Slug

**Endpoint:** `GET /tenants/slug/:slug`
**Auth:** No requerida (pública)

**URL Params:**
- `slug` - El slug de la organización

**Response (200):**

```json
{
  "id": 1,
  "company_name": "Mi Inmobiliaria S.A.",
  "slug": "mi-inmobiliaria",
  "currency": "USD",
  "locale": "es",
  "is_active": true,
  "logo_url": "https://example.com/logo.png",
  "created_at": "2026-01-30T15:20:30.000Z",
  "updated_at": "2026-01-30T15:20:30.000Z"
}
```

**Uso recomendado:**
- Mostrar el logo de la organización en el header
- Configurar el formato de moneda según `currency`
- Configurar el idioma según `locale`
- Verificar que la organización está activa (`is_active: true`)

---

### 3.2 Obtener información de una organización por ID

**Endpoint:** `GET /tenants/:id`
**Auth:** No requerida (pública)

**URL Params:**
- `id` - El ID numérico de la organización

**Response (200):**

```json
{
  "id": 1,
  "company_name": "Mi Inmobiliaria S.A.",
  "slug": "mi-inmobiliaria",
  "currency": "USD",
  "locale": "es",
  "is_active": true,
  "logo_url": null,
  "created_at": "2026-01-30T15:20:30.000Z"
}
```

---

## 4. Health Check

### 4.1 Verificar estado del servidor

**Endpoint:** `GET /health`
**Auth:** No requerida (pública)

**Response (200):**

```json
{
  "status": "ok",
  "info": {
    "database": {
      "status": "up"
    }
  },
  "error": {},
  "details": {
    "database": {
      "status": "up",
      "message": "Database connection is healthy"
    }
  }
}
```

**Uso recomendado:**
- Monitoreo de salud del servidor
- Verificar que la API está funcionando
- Integración con sistemas de uptime monitoring

---

## Ejemplos de Implementación en Frontend

### Ejemplo 1: Página de Listado Público (React)

```javascript
import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

function PublicCatalog() {
  const { slug } = useParams(); // Obtiene el slug de la URL
  const [searchParams, setSearchParams] = useSearchParams();

  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tenantInfo, setTenantInfo] = useState(null);

  // Obtener filtros de la URL
  const filters = {
    status: searchParams.get('status') || 'DISPONIBLE',
    property_type_id: searchParams.get('property_type_id'),
    city: searchParams.get('city'),
    search: searchParams.get('search'),
    page: searchParams.get('page') || '1',
    limit: searchParams.get('limit') || '20'
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      try {
        // Construir query params
        const queryParams = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
          if (value) queryParams.append(key, value);
        });

        // Fetch propiedades
        const propsResponse = await fetch(
          `http://localhost:3000/${slug}/catalog/properties?${queryParams}`
        );

        if (!propsResponse.ok) {
          throw new Error('Error al cargar propiedades');
        }

        const propertiesData = await propsResponse.json();
        setProperties(propertiesData);

        // Fetch info del tenant
        const tenantResponse = await fetch(
          `http://localhost:3000/tenants/slug/${slug}`
        );

        if (tenantResponse.ok) {
          const tenantData = await tenantResponse.json();
          setTenantInfo(tenantData);
        }

      } catch (error) {
        console.error('Error:', error);

      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [slug, JSON.stringify(filters)]);

  const updateFilters = (newFilters) => {
    const params = {};
    Object.entries({ ...filters, ...newFilters }).forEach(([key, value]) => {
      if (value) params[key] = value;
    });
    setSearchParams(params);
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Cargando propiedades...</p>
      </div>
    );
  }

  return (
    <div className="public-catalog">
      {/* Header con info del tenant */}
      <header className="catalog-header">
        {tenantInfo && (
          <div className="tenant-info">
            {tenantInfo.logo_url && (
              <img src={tenantInfo.logo_url} alt={tenantInfo.company_name} />
            )}
            <h1>{tenantInfo.company_name}</h1>
          </div>
        )}
      </header>

      {/* Filtros de búsqueda */}
      <aside className="filters-sidebar">
        <FilterPanel
          filters={filters}
          onFilterChange={updateFilters}
        />
      </aside>

      {/* Listado de propiedades */}
      <main className="properties-grid">
        {properties.length === 0 ? (
          <div className="no-results">
            <p>No se encontraron propiedades</p>
          </div>
        ) : (
          properties.map(property => (
            <PropertyCard
              key={property.id}
              property={property}
              tenantSlug={slug}
            />
          ))
        )}
      </main>

      {/* Paginación */}
      <div className="pagination">
        <button
          onClick={() => updateFilters({ page: parseInt(filters.page) - 1 })}
          disabled={filters.page === '1'}
        >
          Anterior
        </button>
        <span>Página {filters.page}</span>
        <button
          onClick={() => updateFilters({ page: parseInt(filters.page) + 1 })}
          disabled={properties.length < parseInt(filters.limit)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

// Componente de tarjeta de propiedad
function PropertyCard({ property, tenantSlug }) {
  const mainImage = property.images?.[0]
    ? `http://localhost:3000${property.images[0]}`
    : '/placeholder-image.jpg';

  return (
    <article className="property-card">
      <div className="card-image">
        <img src={mainImage} alt={property.title} />
        <div className="card-badges">
          <span className="badge-type">{property.property_type.name}</span>
          <span className={`badge-status ${property.status.toLowerCase()}`}>
            {property.status}
          </span>
        </div>
      </div>

      <div className="card-content">
        <h3>{property.title}</h3>

        <div className="card-location">
          {property.addresses?.[0] && (
            <p>
              {property.addresses[0].city}, {property.addresses[0].country}
            </p>
          )}
        </div>

        <p className="card-description">
          {property.description?.substring(0, 150)}...
        </p>

        {property.security_deposit_amount && (
          <div className="card-price">
            <span className="label">Depósito:</span>
            <span className="amount">${property.security_deposit_amount}</span>
          </div>
        )}

        {property.amenities?.length > 0 && (
          <div className="card-amenities">
            {property.amenities.slice(0, 4).map((amenity, index) => (
              <span key={index} className="amenity-tag">✓ {amenity}</span>
            ))}
          </div>
        )}

        <a
          href={`/catalog/${tenantSlug}/properties/${property.id}`}
          className="btn-view-details"
        >
          Ver detalles
        </a>
      </div>
    </article>
  );
}
```

---

### Ejemplo 2: Página de Detalle Público

```javascript
function PropertyDetailPublic() {
  const { slug, id } = useParams();

  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    const fetchProperty = async () => {
      try {
        const response = await fetch(
          `http://localhost:3000/${slug}/catalog/properties/${id}`
        );

        if (!response.ok) {
          throw new Error('Propiedad no encontrada');
        }

        const data = await response.json();
        setProperty(data);

      } catch (error) {
        console.error('Error:', error);

      } finally {
        setLoading(false);
      }
    };

    fetchProperty();
  }, [slug, id]);

  if (loading) return <div className="loading">Cargando...</div>;
  if (!property) return <div className="error">Propiedad no encontrada</div>;

  const currentImage = property.images?.[currentImageIndex]
    ? `http://localhost:3000${property.images[currentImageIndex]}`
    : '/placeholder.jpg';

  return (
    <div className="property-detail-public">
      {/* Galería de imágenes */}
      <section className="gallery">
        <div className="main-image">
          <img src={currentImage} alt={property.title} />
        </div>

        {property.images?.length > 1 && (
          <div className="thumbnail-strip">
            {property.images.map((imageUrl, index) => (
              <button
                key={index}
                className={`thumbnail ${index === currentImageIndex ? 'active' : ''}`}
                onClick={() => setCurrentImageIndex(index)}
              >
                <img src={`http://localhost:3000${imageUrl}`} alt={`Foto ${index + 1}`} />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Información principal */}
      <section className="property-info">
        <div className="header">
          <h1>{property.title}</h1>

          <div className="badges">
            <span className="badge">{property.property_type.name}</span>
            <span className="badge">{property.property_subtype.name}</span>
            <span className={`status ${property.status.toLowerCase()}`}>
              {property.status}
            </span>
          </div>
        </div>

        {/* Ubicación */}
        {property.addresses?.[0] && (
          <div className="location">
            <h2>Ubicación</h2>
            <p className="address">
              {property.addresses[0].street_address}<br />
              {property.addresses[0].city}, {property.addresses[0].state}<br />
              {property.addresses[0].country}
            </p>

            {property.latitude && property.longitude && (
              <div className="map">
                {/* Integrar mapa aquí */}
                <a
                  href={`https://maps.google.com/?q=${property.latitude},${property.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-map"
                >
                  Ver en Google Maps
                </a>
              </div>
            )}
          </div>
        )}

        {/* Descripción */}
        <div className="description">
          <h2>Descripción</h2>
          <p>{property.description || 'Sin descripción disponible'}</p>
        </div>

        {/* Amenities */}
        {property.amenities?.length > 0 && (
          <div className="amenities">
            <h2>Amenities</h2>
            <ul className="amenities-list">
              {property.amenities.map((amenity, index) => (
                <li key={index}>
                  <span className="icon">✓</span>
                  <span>{amenity}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Ítems incluidos */}
        {property.included_items?.length > 0 && (
          <div className="included-items">
            <h2>Lo que está incluido</h2>
            <ul className="items-list">
              {property.included_items.map((item, index) => (
                <li key={index}>
                  <span className="icon">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Información de depósito */}
        {property.security_deposit_amount && (
          <div className="deposit-info">
            <h2>Depósito de seguridad</h2>
            <p className="amount">${property.security_deposit_amount}</p>
          </div>
        )}

        {/* Información de contacto */}
        {property.owners?.length > 0 && (
          <div className="contact-info">
            <h2>Información de contacto</h2>
            {property.owners.map(owner => (
              <div key={owner.id} className="owner-card">
                <h3>{owner.name}</h3>
                <div className="contact-methods">
                  <a href={`mailto:${owner.primary_email}`} className="contact-link">
                    ✉️ {owner.primary_email}
                  </a>
                  <a href={`tel:${owner.phone_number}`} className="contact-link">
                    📞 {owner.phone_number}
                  </a>
                  {owner.secondary_email && (
                    <a href={`mailto:${owner.secondary_email}`} className="contact-link">
                      ✉️ {owner.secondary_email}
                    </a>
                  )}
                  {owner.secondary_phone && (
                    <a href={`tel:${owner.secondary_phone}`} className="contact-link">
                      📞 {owner.secondary_phone}
                    </a>
                  )}
                </div>
                {owner.notes && (
                  <p className="owner-notes">Nota: {owner.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Call to Action */}
        <div className="cta">
          <a href={`mailto:${property.owners?.[0]?.primary_email}`} className="btn-primary">
            Contactar ahora
          </a>
          <a href={`tel:${property.owners?.[0]?.phone_number}`} className="btn-secondary">
            Llamar
          </a>
        </div>
      </section>
    </div>
  );
}
```

---

### Ejemplo 3: Componente de Filtros Avanzados

```javascript
function FilterPanel({ filters, onFilterChange }) {
  const [localFilters, setLocalFilters] = useState(filters);

  const handleChange = (field, value) => {
    const newFilters = { ...localFilters, [field]: value };
    setLocalFilters(newFilters);

    // Debounce para no hacer demasiadas requests
    const timeout = setTimeout(() => {
      onFilterChange(newFilters);
    }, 500);

    return () => clearTimeout(timeout);
  };

  const handleReset = () => {
    const resetFilters = {
      status: 'DISPONIBLE',
      property_type_id: '',
      city: '',
      search: '',
      page: '1',
      limit: '20'
    };
    setLocalFilters(resetFilters);
    onFilterChange(resetFilters);
  };

  return (
    <div className="filter-panel">
      <div className="filter-header">
        <h3>Filtros</h3>
        <button onClick={handleReset} className="btn-reset">
          Limpiar filtros
        </button>
      </div>

      {/* Búsqueda de texto */}
      <div className="filter-group">
        <label>Buscar</label>
        <input
          type="text"
          placeholder="Ej: moderno, vista al río..."
          value={localFilters.search || ''}
          onChange={(e) => handleChange('search', e.target.value)}
        />
      </div>

      {/* Tipo de propiedad */}
      <div className="filter-group">
        <label>Tipo de propiedad</label>
        <select
          value={localFilters.property_type_id || ''}
          onChange={(e) => handleChange('property_type_id', e.target.value)}
        >
          <option value="">Todos</option>
          <option value="1">Apartamento</option>
          <option value="2">Casa</option>
          <option value="3">Oficina</option>
          <option value="4">Local Comercial</option>
        </select>
      </div>

      {/* Ciudad */}
      <div className="filter-group">
        <label>Ciudad</label>
        <input
          type="text"
          placeholder="Ej: Buenos Aires"
          value={localFilters.city || ''}
          onChange={(e) => handleChange('city', e.target.value)}
        />
      </div>

      {/* Estado */}
      <div className="filter-group">
        <label>Estado</label>
        <select
          value={localFilters.status || 'DISPONIBLE'}
          onChange={(e) => handleChange('status', e.target.value)}
        >
          <option value="DISPONIBLE">Disponible</option>
          <option value="OCUPADO">Ocupado</option>
          <option value="MANTENIMIENTO">En Mantenimiento</option>
          <option value="RESERVADO">Reservado</option>
        </select>
      </div>
    </div>
  );
}
```

---

## Notas Importantes para el Frontend

### 1. URLs de Imágenes
Las URLs de imágenes son relativas. Debes prependear la base URL:

```javascript
const imageUrl = property.images[0]; // "/storage/properties/abc123.jpg"
const fullUrl = `http://localhost:3000${imageUrl}`; // "http://localhost:3000/storage/properties/abc123.jpg"
```

### 2. Manejo de Arrays Vacíos
Siempre verifica que los arrays existan y tengan elementos:

```javascript
{property.images?.length > 0 && (
  <Gallery images={property.images} />
)}
{property.amenities?.length > 0 && (
  <AmenitiesList items={property.amenities} />
)}
```

### 3. Texto con Saltos de Línea
Las descripciones pueden contener saltos de línea (`\n`). Para renderizarlos en React:

```javascript
<p style={{ whiteSpace: 'pre-line' }}>{property.description}</p>
```

### 4. SEO y Metaetiquetas
Para mejorar el SEO, actualiza las metaetiquetas en la página de detalle:

```javascript
useEffect(() => {
  if (property) {
    document.title = `${property.title} - ${tenantInfo?.company_name}`;

    // Meta descripción
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', property.description?.substring(0, 160));
    }

    // Open Graph para redes sociales
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage && property.images?.[0]) {
      ogImage.setAttribute('content', `http://localhost:3000${property.images[0]}`);
    }
  }
}, [property, tenantInfo]);
```

### 5. Manejo de Errores 404
Implementa páginas de error para cuando:
- La organización no existe (`slug` inválido)
- La propiedad no existe (`id` inválido)

### 6. Optimización de Imágenes
Implementa lazy loading para las imágenes:

```javascript
<img
  src={imageUrl}
  alt={property.title}
  loading="lazy"
  decoding="async"
/>
```

### 7. Formato de Moneda
Usa el campo `currency` del tenant para formatear montos:

```javascript
const formatPrice = (amount, currency) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency || 'USD'
  }).format(amount);
};

// Uso:
<p>{formatPrice(property.security_deposit_amount, tenantInfo?.currency)}</p>
// Output: "$5,000.00 USD"
```

---

## Códigos de Estado HTTP

| Código | Significado |
|--------|-------------|
| 200 OK | Request exitosa |
| 404 Not Found | Tenant o propiedad no encontrados |
| 500 Internal Server Error | Error del servidor |

---

## URLs de Ejemplo

Asumiendo que el servidor corre en `http://localhost:3000`:

```
# Catálogo de una organización
GET http://localhost:3000/mi-inmobiliaria/catalog/properties

# Detalle de una propiedad
GET http://localhost:3000/mi-inmobiliaria/catalog/properties/1

# Info de la organización
GET http://localhost:3000/tenants/slug/mi-inmobiliaria

# Health check
GET http://localhost:3000/health
```

---

**Fin de la Documentación del Catálogo Público**

---

## 5. Sitio Web Público del Tenant

Los endpoints del sitio web público usan el prefijo `/public/:subdomain` (no `/:slug/...`).
El `subdomain` corresponde al **slug** del tenant configurado al registrarse.

> **Routing con Nginx:** En producción, `miinmobiliaria.365soft.com` se mapea a `/public/miinmobiliaria` mediante rewrite de Nginx. Ver sección de Nginx al final.

---

### 5.1 Obtener Sitio Web Público

**Endpoint:** `GET /public/:subdomain`
**Auth:** No requerida

Retorna la configuración del sitio web del tenant y el catálogo de propiedades disponibles en un solo request. Solo responde si el sitio está publicado (`is_published = true`).

**URL Params:**
- `subdomain` — slug del tenant (ej: `miinmobiliaria`)

**Response (200):**

```json
{
  "id": 1,
  "subdomain": "miinmobiliaria",
  "company_description": "Somos una inmobiliaria con más de 10 años de experiencia en el mercado boliviano.",
  "logo_url": "https://storage.365soft.com/logos/mi-logo.png",
  "primary_color": "#1976d2",
  "secondary_color": "#424242",
  "contact_email": "info@miinmobiliaria.com",
  "contact_phone": "+591 2 2123456",
  "social_links": {
    "facebook": "https://facebook.com/miinmobiliaria",
    "instagram": "https://instagram.com/miinmobiliaria",
    "whatsapp": "+59172000000"
  },
  "meta_title": "Mi Inmobiliaria — Alquileres en La Paz",
  "meta_description": "Encuentra tu próximo hogar con Mi Inmobiliaria. Departamentos y casas en alquiler en La Paz, Bolivia.",
  "is_published": true,
  "created_at": "2026-01-15T10:00:00.000Z",
  "updated_at": "2026-04-01T09:30:00.000Z",
  "properties": [
    {
      "id": 1,
      "title": "Departamento moderno en Miraflores",
      "description": "Hermoso departamento con vista panorámica.",
      "monthly_rent": 3500,
      "currency": "BOB",
      "square_meters": 85,
      "bedrooms": 3,
      "bathrooms": 2,
      "parking_spaces": 1,
      "is_furnished": false,
      "images": ["/storage/properties/foto1.jpg"],
      "amenities": ["WiFi", "Lavandería", "Seguridad 24h"],
      "rental_type": "LONG_TERM",
      "property_type": "Departamento",
      "city": "La Paz",
      "street_address": "Calle 21 de Calacoto, Torre A, Piso 8"
    }
  ]
}
```

**Response (404) — tenant no existe o sitio no publicado:**

```json
{
  "statusCode": 404,
  "message": "Sitio 'miinmobiliaria' no publicado"
}
```

---

### 5.2 Enviar Formulario de Contacto

**Endpoint:** `POST /public/:subdomain/contact`
**Auth:** No requerida
**Rate limit:** 20 requests/minuto por IP

Guarda el mensaje en `website_contacts` para que el admin lo gestione. Solo funciona si el sitio está publicado.

**URL Params:**
- `subdomain` — slug del tenant

**Body:**

```json
{
  "name": "Juan Pérez",
  "email": "juan@correo.com",
  "phone": "70123456",
  "message": "Me interesa alquilar. ¿Tienen departamentos de 2 dormitorios disponibles?"
}
```

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `name` | string | Sí | Nombre completo (máx. 255 chars) |
| `email` | string | Sí | Email válido |
| `phone` | string | No | Teléfono de contacto (máx. 50 chars) |
| `message` | string | Sí | Mensaje del visitante |

**Response (201):**

```json
{
  "id": 42,
  "message": "Mensaje enviado correctamente"
}
```

**Response (400) — sitio no publicado:**

```json
{
  "statusCode": 400,
  "message": "El sitio no está disponible"
}
```

**Response (429) — rate limit excedido:**

```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests"
}
```

---

### 5.3 Endpoints Admin del Sitio Web

Los siguientes endpoints son para que el ADMIN configure el sitio. Requieren JWT.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/:slug/admin/website` | Obtener configuración actual (crea row por defecto si no existe) |
| `PATCH` | `/:slug/admin/website` | Actualizar campos del sitio |
| `PATCH` | `/:slug/admin/website/publish` | Toggle publicar/despublicar |

**Body PATCH `/:slug/admin/website`** (todos opcionales):

| Campo | Tipo | Descripción |
|---|---|---|
| `subdomain` | string | Subdominio personalizado (solo a-z, 0-9, guiones) |
| `company_description` | string | Descripción de la empresa |
| `logo_url` | URL | URL del logo |
| `primary_color` | string | Color primario en formato `#RRGGBB` |
| `secondary_color` | string | Color secundario en formato `#RRGGBB` |
| `contact_email` | email | Email de contacto público |
| `contact_phone` | string | Teléfono de contacto público |
| `social_links` | object | `{ facebook, instagram, whatsapp, ... }` |
| `meta_title` | string | Título SEO (máx. 200 chars) |
| `meta_description` | string | Descripción SEO (máx. 500 chars) |

**Ejemplo PATCH:**

```http
PATCH /miinmobiliaria/admin/website
Authorization: Bearer <token>
Content-Type: application/json

{
  "company_description": "Alquileres en La Paz desde 2015.",
  "primary_color": "#0d47a1",
  "contact_email": "info@miinmobiliaria.com",
  "social_links": {
    "facebook": "https://facebook.com/miinmobiliaria",
    "whatsapp": "+59172000000"
  },
  "meta_title": "Mi Inmobiliaria — La Paz, Bolivia"
}
```

**Ejemplo toggle publicar:**

```http
PATCH /miinmobiliaria/admin/website/publish
Authorization: Bearer <token>
```

```json
{
  "id": 1,
  "is_published": true,
  ...
}
```

---

### 5.4 Esquema de Base de Datos

**Tabla `tenant_website`** (una fila por tenant):

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | SERIAL PK | — |
| `subdomain` | VARCHAR(100) UNIQUE | Subdominio personalizado |
| `company_description` | TEXT | — |
| `logo_url` | VARCHAR(500) | — |
| `primary_color` | VARCHAR(7) | Default `#1976d2` |
| `secondary_color` | VARCHAR(7) | Default `#424242` |
| `contact_email` | VARCHAR(255) | — |
| `contact_phone` | VARCHAR(50) | — |
| `social_links` | JSONB | Default `{}` |
| `meta_title` | VARCHAR(200) | — |
| `meta_description` | VARCHAR(500) | — |
| `is_published` | BOOLEAN | Default `false` |

**Tabla `website_contacts`** (mensajes recibidos del formulario):

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | SERIAL PK | — |
| `name` | VARCHAR(255) | — |
| `email` | VARCHAR(255) | — |
| `phone` | VARCHAR(50) | Nullable |
| `message` | TEXT | — |
| `status` | VARCHAR(50) | `PENDING` / `CONTACTED` / `CLOSED` |
| `user_ip` | VARCHAR(45) | IP del visitante |
| `created_at` | TIMESTAMP | — |

---

### 5.5 Configuración de Nginx (Referencia)

Para enrutar `miinmobiliaria.365soft.com → /public/miinmobiliaria`:

```nginx
server {
    listen 80;
    server_name ~^(?<subdomain>.+)\.365soft\.com$;

    location / {
        proxy_pass http://localhost:3000/public/$subdomain$request_uri;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```
