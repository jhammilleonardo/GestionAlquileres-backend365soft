# Owner Statements Module - F2-BE-07

Módulo para generar y gestionar comprobantes de liquidación mensual para propietarios.

## Features

✅ Generación automática de states from payments  
✅ PDFs bilingües (ES/EN) con PDFKit  
✅ Almacenamiento local (uploads/owner-statements)  
✅ Endpoints separados para admin y propietarios  
✅ Soporte para múltiples monedas y comisiones  

## Database

### Table: owner_statements

```sql
CREATE TABLE owner_statements (
  id SERIAL PRIMARY KEY,
  rental_owner_id INT NOT NULL REFERENCES rental_owners(id),
  property_id INT NOT NULL REFERENCES properties(id),
  period_month INT NOT NULL,
  period_year INT NOT NULL,
  gross_rent NUMERIC(12,2) NOT NULL,
  maintenance_deduction NUMERIC(12,2) DEFAULT 0,
  management_commission NUMERIC(12,2) NOT NULL,
  net_amount NUMERIC(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'BOB',
  payment_count INT DEFAULT 0,
  generated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(rental_owner_id, property_id, period_year, period_month)
);
```

## API Endpoints

### Admin Endpoints

#### 1. Get Owner Statement
```
GET /:slug/admin/owner-statements/:id
```

**Response:**
```json
{
  "id": 1,
  "rental_owner_id": 5,
  "property_id": 10,
  "period_month": 4,
  "period_year": 2026,
  "gross_rent": 5000,
  "maintenance_deduction": 500,
  "management_commission": 750,
  "net_amount": 3750,
  "currency": "BOB",
  "payment_count": 1,
  "generated_at": "2026-04-14T10:30:00Z",
  "created_at": "2026-04-14T10:30:00Z",
  "updated_at": "2026-04-14T10:30:00Z"
}
```

#### 2. Download PDF (Admin)
```
GET /:slug/admin/owner-statements/:id/pdf?lang=es
```

**Query Parameters:**
- `lang` (optional): `es` or `en` (default: `es`)

**Response:** PDF file download

**Example:**
```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/tenant_mi_inmobiliaria/admin/owner-statements/1/pdf?lang=es" \
  -o liquidacion_1.pdf
```

#### 3. Create Statement (Manual)
```
POST /:slug/admin/owner-statements
Content-Type: application/json

{
  "rental_owner_id": 5,
  "property_id": 10,
  "period_month": 4,
  "period_year": 2026,
  "gross_rent": 5000,
  "maintenance_deduction": 500,
  "management_commission": 750,
  "net_amount": 3750,
  "currency": "BOB",
  "payment_count": 1
}
```

#### 4. Update Statement
```
PATCH /:slug/admin/owner-statements/:id
Content-Type: application/json

{
  "gross_rent": 6000,
  "management_commission": 900
}
```

#### 5. Delete Statement
```
DELETE /:slug/admin/owner-statements/:id
```

### Owner Portal Endpoints

#### 1. Download Own Statement
```
GET /:slug/owner/statements/:id/pdf?lang=es
```

**Note:** Owner can only download their own statements (authorization verified by JWT)

**Response:** PDF file download

#### 2. Download Statement from Properties Portal
```
GET /:slug/owner/properties/:propertyId/statements/:statementId/pdf?lang=es
```

**Description:** Propietario descarga el PDF de su liquidación desde el portal de propiedades

**Query Parameters:**
- `lang` (optional): `es` or `en` (default: `es`)

**Response:** PDF file download

**Example:**
```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/tenant_mi-inmobiliaria/owner/properties/1/statements/1/pdf?lang=es" \
  -o liquidacion_1.pdf
```

## PDF Content

El PDF incluye:

- **Header:** Encabezado confidencial y número de documento
- **Metadata:** Número, fecha de emisión, período
- **Property Section:** Datos de la propiedad e inquilino
- **Financial Summary:** Tabla con:
  - Renta Bruta del Período
  - Deducción por Mantenimiento (si aplica)
  - Comisión de Gestión
  - Monto Neto Transferido
- **Details:** Descripción de deducciones
- **Footer:** Referencia al sistema y firma digital

## Soporte Bilingüe

### Español (ES)
```
COMPROBANTE DE LIQUIDACIÓN MENSUAL
Renta Bruta del Período
Deducción por Mantenimiento
Comisión de Gestión
Monto Neto Transferido
```

### English (EN)
```
MONTHLY LIQUIDATION RECEIPT
Gross Rent for Period
Maintenance Deduction
Management Commission
Net Amount Transferred
```

## Integration with Payments Module

Cuando se **aprueba un pago** (PATCH to APPROVED status):

1. Se calcula el split payment entre propietarios
2. **Automáticamente se crea/actualiza** un owner_statement
3. Se incluye deducción de mantenimiento y comisión

**Configuración por tenant:**
- `commission_percentage` (default: 15%)
- `currency` (ejemplo: BOB, USD, EUR)

## File Storage

Los PDFs se almacenan en:
```
/uploads/owner-statements/liquidacion_{id}_{owner_name}.pdf
```

**Lifetime:**
- Indefinido en fase inicial
- Migración a S3 en Fase 3

## Testing

### Unit Tests
```bash
npm run test -- owner-statements.service.spec.ts
```

### Test Cases
- ✅ Crear statement válido
- ✅ Validar período único por propietario/propiedad
- ✅ Generar PDF en español
- ✅ Generar PDF en inglés
- ✅ Calcular comisión correctamente
- ✅ Manejar decimales con precisión

### Integration Test
```bash
# Con docker corriendo
docker exec gestion-postgres-dev psql -U postgres -d gestion_alquileres -c \
  "SELECT * FROM tenant_mi_inmobiliaria.owner_statements LIMIT 5;"
```

## Error Handling

```json
{
  "statusCode": 404,
  "message": "Estado de cuenta con ID 999 no encontrado",
  "error": "Not Found"
}
```

```json
{
  "statusCode": 400,
  "message": "Ya existe un estado de cuenta para este propietario, propiedad y período",
  "error": "Bad Request"
}
```

## Performance

**Índices:**
- `rental_owner_id` - búsqueda por propietario
- `period_year, period_month` - búsqueda por período
- `rental_owner_id, period_year, period_month` (UNIQUE) - garantiza unicidad

**Queries:**
- Get by owner: ~10ms (indexed)
- Generate PDF: ~500-800ms (incluye renderizado)
- Create from payment: ~50ms

## Migration

Para aplicar la migración en todos los tenants:

```bash
# 1. Ejecutar migración
docker exec gestion-postgres-dev psql -U postgres -d gestion_alquileres < \
  docker/migrations/005_create_owner_statements_table.sql

# 2. Verificar creación
docker exec gestion-postgres-dev psql -U postgres -d gestion_alquileres -c \
  "SELECT * FROM information_schema.tables WHERE table_name='owner_statements';"
```

## Próximas Fases

**Fase 3:**
- [ ] Migración a S3
- [ ] API de búsqueda avanzada
- [ ] Generación masiva de statements
- [ ] Email automático de PDFs
- [ ] Firma digital real (certificado)
- [ ] Reporte consolidado por período

**Fase 4:**
- [ ] Customización de template PDF por tenant
- [ ] QR code en PDF
- [ ] Integración con portal propietario
