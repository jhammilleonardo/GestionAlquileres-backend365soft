# Módulo de Expenses (Gastos)

## Descripción

Este módulo implementa la gestión de gastos y contabilidad básica para el sistema de gestión de alquileres. Permite registrar, consultar y analizar gastos asociados a propiedades, siendo crítico para el cálculo correcto del Profit & Loss (P&L) de cada propiedad.

---

## Arquitectura

### Estructura de Archivos

```
src/expenses/
├── entities/
│   └── expense.entity.ts          # Entidad de base de datos
├── enums/
│   └── expense-category.enum.ts   # Categorías predefinidas
├── dto/
│   ├── create-expense.dto.ts      # DTO para creación
│   ├── update-expense.dto.ts      # DTO para actualización
│   ├── expense-filters.dto.ts     # DTO para filtros
│   └── index.ts
├── expenses.module.ts             # Módulo NestJS
├── expenses.controller.ts          # Controlador
├── expenses.service.ts            # Lógica de negocio
└── expenses.service.spec.ts       # Tests unitarios
```

### Flujo de Datos

```
Controller
    ↓
Service (Lógica de negocio)
    ↓
Repository (Acceso a BD)
    ↓
Database (PostgreSQL)
```

---

## Entidad: Expense

### Campos Principales

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | INT | Clave primaria |
| `property_id` | INT | Referencia a la propiedad |
| `unit_id` | INT (NULL) | Unidad específica (opcional) |
| `category` | ENUM | Categoría del gasto |
| `amount` | DECIMAL(12,2) | Monto del gasto |
| `currency` | VARCHAR(3) | Moneda (ISO 4217) |
| `date` | DATE | Fecha del gasto |
| `description` | TEXT | Descripción detallada |
| `vendor_id` | INT (NULL) | Referencia al proveedor |
| `vendor_name` | VARCHAR | Nombre del proveedor |
| `receipt_url` | VARCHAR | URL del comprobante |
| `is_recurring` | BOOLEAN | ¿Es gasto recurrente? |
| `recurrence_interval` | ENUM | DAILY/WEEKLY/MONTHLY/etc |
| `recurrence_start_date` | DATE | Inicio de recurrencia |
| `recurrence_end_date` | DATE | Fin de recurrencia |
| `recurring_expense_id` | INT | ID del gasto padre (si aplica) |
| `tenant_id` | INT | Aislamiento por tenant |
| `created_at` | TIMESTAMP | Timestamp de creación |
| `updated_at` | TIMESTAMP | Timestamp de actualización |
| `created_by` | INT | Usuario que creó |
| `updated_by` | INT | Usuario que actualizó |

---

## Categorías de Gastos

```typescript
enum ExpenseCategoryEnum {
  MAINTENANCE = 'MAINTENANCE',      // Mantenimiento
  INSURANCE = 'INSURANCE',          // Seguros
  TAX = 'TAX',                      // Impuestos
  UTILITIES = 'UTILITIES',          // Servicios (agua, luz, gas)
  MANAGEMENT_FEE = 'MANAGEMENT_FEE',// Honorarios de gestión
  CLEANING = 'CLEANING',            // Limpieza
  OTHER = 'OTHER',                  // Otros
}
```

Estas categorías pueden extenderse a través de la configuración de tenant en futuras versiones.

---

## Servicios Principales

### `ExpensesService`

#### Métodos CRUD

**`createExpense(tenantId, dto, userId?): Promise<Expense>`**
- Crea un nuevo gasto
- Si es recurrente, genera automáticamente instancias futuras
- Valida que montos sean positivos
- Registra auditoría (created_by)

**`findAll(tenantId, filters): Promise<{data, total}>`**
- Lista gastos con paginación
- Filtros: propiedad, categoría, período, búsqueda
- Orden: fecha descendente

**`findOne(expenseId, tenantId): Promise<Expense>`**
- Obtiene un gasto específico
- Verifica tenantId para seguridad

**`update(expenseId, tenantId, dto, userId?): Promise<Expense>`**
- Actualiza un gasto
- No permite cambiar recurrencia de gastos existentes
- Registra auditoría (updated_by)

**`remove(expenseId, tenantId): Promise<void>`**
- Elimina un gasto
- Si es recurrente, elimina todas sus instancias

#### Métodos de Análisis

**`getSummary(tenantId, propertyId, from?, to?): Promise<ExpenseSummary>`**
- Retorna total de gastos agrupado por categoría
- Usado para P&L
- Desglose también por unidad

**`getTotalExpensesByPeriod(tenantId, propertyId, from, to): Promise<number>`**
- Retorna total de gastos en un período
- Entrada para cálculo de P&L

**`getExpensesByCategory(tenantId, propertyId, from, to): Promise<Record>`**
- Análisis detallado de gastos por categoría
- Usado en reportes financieros

#### Métodos Internos

**`generateRecurringExpenses(parent): Promise<void>`** (privado)
- Genera automáticamente instancias de gastos recurrentes
- Genera para los próximos 24 meses o hasta recurrence_end_date
- Las instancias generadas no son recurrentes

**`addInterval(date, interval): Date`** (privado)
- Calcula la siguiente fecha según intervalo
- Soporta: DAILY, WEEKLY, MONTHLY, QUARTERLY, YEARLY

---

## Integración con P&L

### Cálculo de P&L

El cálculo del P&L debe realizarse así:

```typescript
// En un servicio de reportes o dashboard
const ingresos = await paymentsService.getTotalPaymentsByPeriod(tenantId, propertyId, from, to);
const gastos = await expensesService.getTotalExpensesByPeriod(tenantId, propertyId, from, to);

const pl = ingresos - gastos; // Profit & Loss

// Para análisis detallado
const gastosPorCategoria = await expensesService.getExpensesByCategory(tenantId, propertyId, from, to);
```

### Ejemplo de Reporte P&L

```json
{
  "propiedad": "Casa en Alquiler - Calle Principal 123",
  "periodo": "2024-04-01 a 2024-04-30",
  
  "ingresos": {
    "alquileres": 2500.00,
    "otros_ingresos": 0.00,
    "total_ingresos": 2500.00
  },
  
  "gastos": {
    "mantenimiento": 500.00,
    "servicios": 700.00,
    "seguros": 200.00,
    "limpieza": 300.00,
    "otros": 100.00,
    "total_gastos": 1800.00
  },
  
  "resultado": {
    "p_l": 700.00,
    "margen_neto": 28.0  // (700 / 2500) * 100
  }
}
```

---

## Gastos Recurrentes

### Ejemplo: Servicio Mensual de Agua

```json
POST /mi-empresa/admin/expenses
{
  "property_id": 1,
  "category": "UTILITIES",
  "amount": 200.00,
  "date": "2024-04-01",
  "description": "Servicio de agua - Acueducto",
  "is_recurring": true,
  "recurrence_interval": "MONTHLY",
  "recurrence_start_date": "2024-04-01",
  "recurrence_end_date": "2024-12-31",
  "vendor_name": "Acueducto Municipal"
}
```

**Comportamiento**:
1. Se crea el gasto padre con `id = X`
2. Se generan instancias para cada mes:
   - 2024-04-01: $200
   - 2024-05-01: $200
   - 2024-06-01: $200
   - ...
   - 2024-12-01: $200
3. Cada instancia tiene `recurring_expense_id = X`
4. Si se elimina el padre, se eliminan todas las instancias

---

## Validaciones

### En Creación/Actualización

- ✅ `property_id` es requerido y debe existir
- ✅ `amount` debe ser > 0 y ≤ 999,999.99
- ✅ `category` debe ser un valor válido del enum
- ✅ `date` debe ser válida (ISO 8601)
- ✅ `currency` debe ser código ISO 4217 válido (3 caracteres)
- ✅ Si `is_recurring` es true, `recurrence_interval` es requerido
- ✅ `recurrence_start_date` debe ser ≤ `recurrence_end_date`
- ✅ No se puede cambiar `is_recurring` en actualización

### Por Seguridad

- ✅ Validación de tenant en todos los endpoints
- ✅ Solo ADMIN puede crear/modificar gastos
- ✅ Verificación de existencia de propiedad antes de crear
- ✅ Aislamiento de datos por tenant

---

## Tests

### Coverage

El módulo incluye tests para:

✅ **Creación de gastos** - Validación de entrada y persistencia
✅ **Listado y filtros** - Paginación, búsqueda, filtros por categoría/período
✅ **Obtención** - Recuperación de un gasto específico
✅ **Actualización** - Modificación de campos
✅ **Eliminación** - Borrado de gastos y gastos recurrentes
✅ **Resumen** - Cálculo de totales por categoría
✅ **P&L** - Cálculo correcto del balance ingresos - gastos

### Ejecutar Tests

```bash
# Tests del módulo expenses
npm test -- expenses.service.spec.ts

# Con coverage
npm test -- expenses.service.spec.ts --coverage

# Watch mode
npm test -- expenses.service.spec.ts --watch
```

---

## Consultas SQL Comunes

### Gastos totales por propiedad en el mes actual

```sql
SELECT 
    e.property_id,
    SUM(e.amount) as total_gastos
FROM expenses e
WHERE e.tenant_id = $1
    AND e.property_id = $2
    AND EXTRACT(YEAR FROM e.date) = EXTRACT(YEAR FROM CURRENT_DATE)
    AND EXTRACT(MONTH FROM e.date) = EXTRACT(MONTH FROM CURRENT_DATE)
GROUP BY e.property_id;
```

### Gastos por categoría

```sql
SELECT 
    e.category,
    COUNT(*) as cantidad,
    SUM(e.amount) as total,
    AVG(e.amount) as promedio
FROM expenses e
WHERE e.tenant_id = $1
    AND e.property_id = $2
    AND e.date BETWEEN $3 AND $4
GROUP BY e.category
ORDER BY total DESC;
```

### Gastos recurrentes activos

```sql
SELECT *
FROM expenses e
WHERE e.tenant_id = $1
    AND e.is_recurring = true
    AND (e.recurrence_end_date IS NULL 
         OR e.recurrence_end_date >= CURRENT_DATE);
```

---

## Mejoras Futuras (Roadmap)

- [ ] **Categorías configurables por tenant**: Permitir que cada tenant defina sus propias categorías
- [ ] **Aprobación de gastos**: Workflow de aprobación antes de registrar
- [ ] **Presupuestos**: Definir presupuestos por categoría y alertar si se exceden
- [ ] **Importación masiva**: Subir gastos desde CSV/Excel
- [ ] **Exportación**: Generar reportes en PDF/Excel
- [ ] **Integraciones contables**: Exportar a sistemas contables externos
- [ ] **Análisis de tendencias**: Gráficos de evolución de gastos
- [ ] **Compartición con propietarios**: Vista limitada de gastos para rentistas
- [ ] **Cálculo automático de P&L**: Endpoint que retorne P&L completo
- [ ] **Proyecciones**: Estimaciones de gastos futuros

---

## Troubleshooting

### "Gasto no encontrado"
- Verificar que el `id` es correcto
- Verificar que el gasto pertenece al tenant actual
- Verificar que el usuario tiene permisos ADMIN

### "Error al crear el gasto"
- Validar que `property_id` existe
- Validar que `amount` es número positivo
- Validar que `category` es válida
- Revisar logs de la aplicación

### Gastos recurrentes no se generan
- Verificar que `is_recurring` es `true`
- Verificar que `recurrence_interval` está especificado
- Revisar que `recurrence_start_date` y `recurrence_end_date` son válidas
- Revisar logs de la aplicación

---

## Referencias

- [API Expenses Documentation](../API-EXPENSES.md)
- [P&L Calculations](../../docs/adr/ADR-001-schema-per-tenant.md)
- [NestJS Documentation](https://docs.nestjs.com)
- [TypeORM Documentation](https://typeorm.io)
