# Catálogo Público de Propiedades

Endpoints para listar propiedades, aplicar filtros, paginar y crear contactos de interés.

---

## Endpoints

### GET /:slug/catalog/properties

Listar propiedades del catálogo con filtros, búsqueda, paginación y ordenamiento.

#### Query Parameters

| Parámetro | Tipo | Requerido | Descripción | Ejemplo |
|-----------|------|-----------|-------------|---------|
| `type` | string | No | Tipo de propiedad (code del property_type) | `residential`, `commercial` |
| `min_price` | number | No | Precio mínimo mensual | `1000` |
| `max_price` | number | No | Precio máximo mensual | `50000` |
| `bedrooms` | number | No | Mínimo de habitaciones | `2`, `3` |
| `rental_type` | string | No | Tipo de alquiler: `short_term`, `long_term`, `any` | `long_term` |
| `status` | string | No | Estado de la propiedad (default: `DISPONIBLE`) | `DISPONIBLE`, `RESERVADO` |
| `city` | string | No | Filtrar por ciudad (búsqueda parcial) | `La Paz` |
| `country` | string | No | Filtrar por país | `Bolivia` |
| `search` | string | No | Buscar en título/descripción (case-insensitive) | `moderno`, `balcón` |
| `sort` | string | No | Ordenamiento: `price_asc`, `price_desc`, `newest`, `available` | `price_asc` |
| `page` | number | No | Número de página (default: 1) | `1`, `2` |
| `limit` | number | No | Items por página (default: 20, máximo: 100) | `20` |

#### Ejemplo de Solicitud

```
GET http://localhost:3000/mi-inmobiliaria/catalog/properties?type=residential&min_price=5000&max_price=50000&bedrooms=3&rental_type=long_term&sort=price_asc&page=1&limit=20
```

#### Response 200 OK

```json
{
  "data": [
    {
      "id": 1,
      "title": "Casa moderna en Achumani",
      "propertyType": "Casa",
      "monthlyRent": 5000,
      "bedrooms": 3,
      "bathrooms": 2,
      "squareMeters": 150,
      "city": "La Paz",
      "view_count": 12
    }
  ],
  "total": 45,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

---

### GET /:slug/catalog/properties/:id

Obtener detalle completo de una propiedad. Incrementa automáticamente el contador de vistas.

#### Path Parameters

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `slug` | string | Slug del inquilino |
| `id` | number | ID de la propiedad |

#### Ejemplo de Solicitud

```
GET http://localhost:3000/mi-inmobiliaria/catalog/properties/1
```

#### Response 200 OK

```json
{
  "id": 1,
  "title": "Casa moderna en Achumani",
  "propertyType": "Casa",
  "monthlyRent": 5000,
  "bedrooms": 3,
  "bathrooms": 2,
  "squareMeters": 150,
  "parking_spaces": 2,
  "is_furnished": true,
  "city": "La Paz",
  "country": "Bolivia",
  "description": "Propiedad con buena iluminación...",
  "view_count": 13,
  "last_viewed_at": "2026-04-09T18:30:00Z",
  "images": [
    "https://s3.amazonaws.com/bucket/image1.jpg",
    "https://s3.amazonaws.com/bucket/image2.jpg"
  ],
  "amenities": ["WiFi", "Aire acondicionado", "Piscina"],
  "included_items": ["Refrigerador", "Lavadora", "Microondas"],
  "property_rules": ["No mascotas", "Máximo 2 personas"],
  "addresses": [
    {
      "street": "Calle Principal 123",
      "city": "La Paz",
      "country": "Bolivia",
      "latitude": -16.5023,
      "longitude": -68.1193
    }
  ],
  "rentalOwners": [
    {
      "id": 1,
      "name": "Juan Pérez García",
      "phone": "+591123456",
      "email": "juan@example.com"
    }
  ]
}
```

#### Comportamiento

- Cada solicitud a este endpoint incrementa automáticamente el contador `view_count`
- Actualiza `last_viewed_at` con el timestamp actual
- Los registros no requieren autenticación

---

### POST /:slug/catalog/properties/:id/contact

Crear contacto de interés (lead) para una propiedad. El admin es notificado automáticamente.

#### Path Parameters

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `slug` | string | Slug del inquilino |
| `id` | number | ID de la propiedad |

#### Request Body

```json
{
  "name": "Juan Pérez",
  "email": "juan@example.com",
  "phone": "+591123456",
  "message": "Me interesa alquilar esta propiedad. ¿Cuál es el precio final y disponibilidad?"
}
```

#### Validaciones

- `name` (string): Requerido
- `email` (string): Email válido, requerido
- `phone` (string): Mínimo 10 caracteres, requerido
- `message` (string): Mínimo 10 caracteres, requerido

#### Ejemplo de Solicitud

```bash
curl -X POST http://localhost:3000/mi-inmobiliaria/catalog/properties/1/contact \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Juan Pérez",
    "email": "juan@example.com",
    "phone": "+591123456",
    "message": "Me interesa alquilar esta propiedad"
  }'
```

#### Response 201 Created

```json
{
  "id": 1,
  "property_id": 1,
  "name": "Juan Pérez",
  "email": "juan@example.com",
  "phone": "+591123456",
  "message": "Me interesa alquilar esta propiedad",
  "status": "PENDING",
  "created_at": "2026-04-09T18:35:00Z"
}
```

#### Response 400 Bad Request

```json
{
  "statusCode": 400,
  "message": [
    "message must be longer than or equal to 10 characters",
    "email must be an email"
  ],
  "error": "Bad Request"
}
```

#### Comportamiento

- No requiere autenticación
- El lead es almacenado en la tabla `property_leads`
- Se envía notificación automática al admin del inquilino
- El IP de origen se registra automáticamente

---

## Instalación & Configuración

### 1. Actualizar Código

```bash
git pull origin main
npm install
npm run build
```

### 2. Crear Schema y Tablas

```bash
docker exec gestion-postgres-dev psql -U postgres -d gestion_alquileres << EOF
SET search_path TO tenant_mi_inmobiliaria;

ALTER TABLE properties
ADD COLUMN IF NOT EXISTS view_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMP NULL;

CREATE TABLE IF NOT EXISTS property_leads (
  id SERIAL PRIMARY KEY,
  property_id INT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  inquiry_type VARCHAR(50),
  status VARCHAR(50) DEFAULT 'PENDING',
  user_ip VARCHAR(45),
  assigned_to INT REFERENCES "user"(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_leads_property_id ON property_leads(property_id);
CREATE INDEX IF NOT EXISTS idx_property_leads_status ON property_leads(status);
CREATE INDEX IF NOT EXISTS idx_property_leads_email ON property_leads(email);
EOF
```

### 3. Iniciar Servidor

```bash
npm run start:dev
```

El servidor debe iniciar en `http://localhost:3000`

---

## Pruebas Rápidas (Bruno)

### Test 1: Listar Propiedades

```
GET http://localhost:3000/mi-inmobiliaria/catalog/properties?type=casa&min_price=5000&bedrooms=3
```

### Test 2: Ver Detalle (Incrementa Counter)

```
GET http://localhost:3000/mi-inmobiliaria/catalog/properties/1
```

Ejecutar varias veces y verificar que `view_count` incrementa en 1 cada vez.

### Test 3: Crear Lead

```
POST http://localhost:3000/mi-inmobiliaria/catalog/properties/1/contact
Content-Type: application/json

{
  "name": "Test User",
  "email": "test@example.com",
  "phone": "+591123456789",
  "message": "Me interesa esta propiedad, ¿cuál es el precio final?"
}
```

Verificar:
- Respuesta 201 con los datos del lead
- Admin recibe notificación
- Registro existe en `property_leads` table

---

## Cambios en Código

### Nuevos Archivos

- `src/properties/dto/filter-catalog-properties.dto.ts` - Validación de query params
- `src/properties/dto/create-property-contact.dto.ts` - Validación de formulario de contacto
- `src/properties/dto/catalog-property-response.dto.ts` - DTOs de respuesta
- `src/properties/public-catalog.controller.ts` - Controller con 3 endpoints

### Archivos Modificados

- `src/properties/properties.service.ts`
  - `findCatalogProperties()` - Listar con filtros y paginación
  - `findCatalogPropertyDetail()` - Detalle de propiedad
  - `recordPropertyView()` - Rastrear vistas
  - `createPropertyContact()` - Crear lead

- `src/properties/properties.module.ts` - Registrar `PublicCatalogController`
- `src/properties/entities/property.entity.ts` - Agregar columnas `view_count`, `last_viewed_at`
- `src/notifications/dto/create-notification.dto.ts` - Evento `PROPERTY_LEAD_RECEIVED`

---

## Git Commit

```bash
git add .
git commit -m "feat(F2-BE-03): Add public property catalog with filters, pagination, and lead contact"
git push origin main
```
