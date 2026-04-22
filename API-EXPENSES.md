# API Expenses (Gastos) - Admin

## Descripción General

Módulo para la gestión de gastos y contabilidad básica. Permite registrar, actualizar y consultar gastos asociados a propiedades, facilitando el cálculo correcto del Profit & Loss (P&L) por propiedad.

**Rol requerido**: `ADMIN`

---

## Endpoints

### 1. Crear Gasto

```
POST /:slug/admin/expenses
```

**Descripción**: Registra un nuevo gasto con detalles opcionales de comprobante. Soporta gastos recurrentes.

**Headers**:
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "property_id": 1,
  "unit_id": 1,
  "category": "MAINTENANCE",
  "amount": 150.50,
  "currency": "USD",
  "description": "Reparación de tubería en la cocina",
  "date": "2024-04-15",
  "vendor_id": 1,
  "vendor_name": "Fontanería García S.A.",
  "receipt_url": "https://storage.example.com/receipts/123.pdf",
  "is_recurring": false,
  "recurrence_interval": null,
  "recurrence_start_date": null,
  "recurrence_end_date": null,
  "notes": "Factura #1234 - Recibido 15/04/2024"
}
```

**Response (201 Created)**:
```json
{
  "id": 1,
  "property_id": 1,
  "unit_id": 1,
  "category": "MAINTENANCE",
  "amount": "150.50",
  "currency": "USD",
  "description": "Reparación de tubería en la cocina",
  "date": "2024-04-15",
  "vendor_id": 1,
  "vendor_name": "Fontanería García S.A.",
  "receipt_url": "https://storage.example.com/receipts/123.pdf",
  "is_recurring": false,
  "recurrence_interval": null,
  "recurrence_start_date": null,
  "recurrence_end_date": null,
  "recurring_expense_id": null,
  "tenant_id": 1,
  "notes": "Factura #1234 - Recibido 15/04/2024",
  "created_at": "2024-04-15T10:30:00Z",
  "updated_at": "2024-04-15T10:30:00Z",
  "created_by": 1
}
```

**Categorías disponibles**:
- `MAINTENANCE` - Mantenimiento
- `INSURANCE` - Seguros
- `TAX` - Impuestos
- `UTILITIES` - Servicios (agua, luz, gas)
- `MANAGEMENT_FEE` - Honorarios de gestión
- `CLEANING` - Limpieza
- `OTHER` - Otros

**Intervalos de recurrencia** (si `is_recurring` es true):
- `DAILY`
- `WEEKLY`
- `MONTHLY`
- `QUARTERLY`
- `YEARLY`

---

### 2. Listar Gastos con Filtros

```
GET /:slug/admin/expenses
```

**Descripción**: Obtiene una lista paginada de gastos con posibilidad de filtrar por propiedad, categoría, período y otros criterios.

**Query Parameters**:
```
?property_id=1
&unit_id=1
&category=MAINTENANCE
&is_recurring=false
&from=2024-01-01
&to=2024-12-31
&search=fontanería
&page=1
&limit=20
```

**Response (200 OK)**:
```json
{
  "data": [
    {
      "id": 1,
      "property_id": 1,
      "unit_id": 1,
      "category": "MAINTENANCE",
      "amount": "150.50",
      "currency": "USD",
      "description": "Reparación de tubería en la cocina",
      "date": "2024-04-15",
      "vendor_id": 1,
      "vendor_name": "Fontanería García S.A.",
      "receipt_url": "https://storage.example.com/receipts/123.pdf",
      "is_recurring": false,
      "created_at": "2024-04-15T10:30:00Z",
      "updated_at": "2024-04-15T10:30:00Z"
    }
  ],
  "total": 1
}
```

---

### 3. Obtener Gasto por ID

```
GET /:slug/admin/expenses/:id
```

**Descripción**: Retorna los detalles completos de un gasto específico.

**Response (200 OK)**:
```json
{
  "id": 1,
  "property_id": 1,
  "unit_id": 1,
  "category": "MAINTENANCE",
  "amount": "150.50",
  "currency": "USD",
  "description": "Reparación de tubería en la cocina",
  "date": "2024-04-15",
  "vendor_id": 1,
  "vendor_name": "Fontanería García S.A.",
  "receipt_url": "https://storage.example.com/receipts/123.pdf",
  "is_recurring": false,
  "recurrence_interval": null,
  "tenant_id": 1,
  "created_at": "2024-04-15T10:30:00Z",
  "updated_at": "2024-04-15T10:30:00Z",
  "created_by": 1
}
```

**Errores**:
- `404 Not Found` - Gasto no encontrado

---

### 4. Actualizar Gasto

```
PATCH /:slug/admin/expenses/:id
```

**Descripción**: Modifica los detalles de un gasto existente.

**Request Body** (todos los campos son opcionales):
```json
{
  "amount": 175.00,
  "description": "Reparación completada con mejoría",
  "receipt_url": "https://storage.example.com/receipts/123-updated.pdf"
}
```

**Response (200 OK)**:
```json
{
  "id": 1,
  "property_id": 1,
  "category": "MAINTENANCE",
  "amount": "175.00",
  "description": "Reparación completada con mejoría",
  "receipt_url": "https://storage.example.com/receipts/123-updated.pdf",
  "updated_at": "2024-04-15T11:00:00Z",
  "updated_by": 1
}
```

**Errores**:
- `404 Not Found` - Gasto no encontrado
- `400 Bad Request` - No se puede cambiar recurrencia de gasto existente

---

### 5. Eliminar Gasto

```
DELETE /:slug/admin/expenses/:id
```

**Descripción**: Elimina un gasto. Si es un gasto recurrente padre, también elimina todas sus instancias generadas.

**Response (204 No Content)**

**Errores**:
- `404 Not Found` - Gasto no encontrado

---

### 6. Obtener Resumen de Gastos

```
GET /:slug/admin/expenses/summary
```

**Descripción**: Retorna un resumen de gastos agrupado por categoría para una propiedad en un período específico. **Crucial para cálculos de P&L**.

**Query Parameters** (requeridos):
```
?property_id=1          (obligatorio)
&from=2024-01-01        (opcional)
&to=2024-12-31          (opcional)
```

**Response (200 OK)**:
```json
{
  "total_expenses": "1500.00",
  "by_category": {
    "MAINTENANCE": "500.00",
    "UTILITIES": "700.00",
    "CLEANING": "300.00"
  },
  "expense_count": 10,
  "by_unit": {
    "1": "800.00",
    "2": "700.00"
  }
}
```

---

## Integración con P&L (Profit & Loss)

### Cálculo automático de P&L

Los gastos se descuentan automáticamente del cálculo del P&L según la siguiente fórmula:

```
P&L = Total Ingresos - Total Gastos
```

**Donde**:
- **Total Ingresos**: Suma de todos los pagos recibidos en el período
- **Total Gastos**: Suma de todos los gastos registrados en el período

### Ejemplo de cálculo

Para la propiedad 1 en el período de enero 2024:

1. **Ingresos** (del módulo de pagos): $2,500.00
2. **Gastos** (endpoint GET `/summary`):
   - Mantenimiento: $500.00
   - Servicios: $700.00
   - Limpieza: $300.00
   - **Total Gastos**: $1,500.00

3. **P&L = $2,500 - $1,500 = $1,000.00**

---

## Gastos Recurrentes

### Crear un gasto recurrente

```json
{
  "property_id": 1,
  "category": "UTILITIES",
  "amount": 200.00,
  "date": "2024-04-01",
  "description": "Servicio de agua mensual",
  "is_recurring": true,
  "recurrence_interval": "MONTHLY",
  "recurrence_start_date": "2024-04-01",
  "recurrence_end_date": "2024-12-31"
}
```

**Comportamiento**:
- El sistema genera automáticamente instancias para cada mes del período
- Las instancias generadas se crean como gastos individuales (no recurrentes)
- Si se elimina el gasto padre, se eliminan todas sus instancias

---

## Errores Comunes

### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": "Error al crear el gasto",
  "error": "Bad Request"
}
```

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Gasto con ID 999 no encontrado",
  "error": "Not Found"
}
```

### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

---

## Consideraciones de Seguridad

1. **Aislamiento por Tenant**: Todos los gastos están asociados a un tenant específico
2. **Control de Acceso**: Solo usuarios con rol `ADMIN` pueden acceder a estos endpoints
3. **Auditoría**: Se registra `created_by` y `updated_by` para rastrear cambios
4. **Validación**: Montos, fechas y categorías se validan automáticamente

---

## Ejemplos de Uso

### Crear gasto de mantenimiento
```bash
curl -X POST "http://localhost:3000/mi-empresa/admin/expenses" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "property_id": 1,
    "category": "MAINTENANCE",
    "amount": 250.00,
    "date": "2024-04-15",
    "description": "Reparación de techo"
  }'
```

### Listar gastos de una propiedad en un período
```bash
curl "http://localhost:3000/mi-empresa/admin/expenses?property_id=1&from=2024-01-01&to=2024-01-31" \
  -H "Authorization: Bearer <token>"
```

### Obtener resumen para P&L
```bash
curl "http://localhost:3000/mi-empresa/admin/expenses/summary?property_id=1&from=2024-01-01&to=2024-01-31" \
  -H "Authorization: Bearer <token>"
```

### Actualizar gasto
```bash
curl -X PATCH "http://localhost:3000/mi-empresa/admin/expenses/1" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 275.00,
    "description": "Reparación de techo - completada"
  }'
```

### Eliminar gasto
```bash
curl -X DELETE "http://localhost:3000/mi-empresa/admin/expenses/1" \
  -H "Authorization: Bearer <token>"
```

---

## Relaciones con otros Módulos

- **Properties**: Los gastos se asocian a propiedades específicas
- **Payments**: El P&L combina ingresos (payments) con gastos (expenses)
- **Units**: Los gastos pueden ser específicos a unidades dentro de una propiedad
- **Tenant Config**: Las categorías pueden ser personalizables por tenant

---

## TODO: Funcionalidades Futuras

- [ ] Exportar resumen de gastos a PDF/Excel
- [ ] Análisis de tendencias de gastos
- [ ] Alertas cuando gastos exceden presupuesto
- [ ] Categorías personalizables por tenant
- [ ] Asignación de gastos a múltiples propiedades
- [ ] Integración con sistema contable externo
