# Database Migrations - F2-BE-03

Migraciones de base de datos para el catálogo público de propiedades.

---

## Setup

### 1. Actualizar Código

```bash
git pull origin main
npm install
npm run build
```

### 2. Aplicar Migraciones

```bash
docker exec gestion-postgres-dev psql -U postgres -d gestion_alquileres << 'EOF'

SET search_path TO tenant_mi_inmobiliaria;

-- Migration 003: Add view tracking
ALTER TABLE properties
ADD COLUMN IF NOT EXISTS view_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_properties_view_count ON properties(view_count DESC);
CREATE INDEX IF NOT EXISTS idx_properties_last_viewed_at ON properties(last_viewed_at DESC);

-- Migration 004: Create property_leads table
CREATE TABLE IF NOT EXISTS property_leads (
  id SERIAL PRIMARY KEY,
  property_id INT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  inquiry_type VARCHAR(50) DEFAULT 'general',
  availability VARCHAR(50),
  status VARCHAR(50) DEFAULT 'PENDING',
  user_ip VARCHAR(45),
  assigned_to INT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_leads_property_id ON property_leads(property_id);
CREATE INDEX IF NOT EXISTS idx_property_leads_email ON property_leads(email);
CREATE INDEX IF NOT EXISTS idx_property_leads_status ON property_leads(status);
CREATE INDEX IF NOT EXISTS idx_property_leads_created_at ON property_leads(created_at DESC);

CREATE OR REPLACE FUNCTION update_property_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_property_leads_updated_at ON property_leads;
CREATE TRIGGER trigger_property_leads_updated_at
BEFORE UPDATE ON property_leads
FOR EACH ROW
EXECUTE FUNCTION update_property_leads_updated_at();

EOF
```

### 3. Iniciar Servidor

```bash
npm run start:dev
```

---

## Cambios

### Nuevos Archivos
- `src/properties/dto/filter-catalog-properties.dto.ts`
- `src/properties/dto/create-property-contact.dto.ts`
- `src/properties/dto/catalog-property-response.dto.ts`
- `src/properties/public-catalog.controller.ts`

### Archivos Modificados
- `src/properties/properties.service.ts` (+4 métodos)
- `src/properties/properties.module.ts` (controller registration)
- `src/properties/entities/property.entity.ts` (+2 columnas)
- `src/notifications/dto/create-notification.dto.ts` (+evento)

### Base de Datos
- Tabla `property_leads` (almacena contactos del catálogo)
- Columnas `view_count`, `last_viewed_at` en propiedades
- Trigger automático en `property_leads` para `updated_at`
- 7 índices para optimización

---

## Documentación

Ver [API-CATALOG.md](./API-CATALOG.md) para endpoints y ejemplos.
