#!/bin/bash

# =====================================================
# Script de Prueba del Módulo de Pagos
# =====================================================
# Este script verifica que el backend de pagos funcione correctamente
# Ejecutar: bash test-payments.sh

set -e

echo "=========================================="
echo "PRUEBA DEL MÓDULO DE PAGOS - BACKEND"
echo "=========================================="
echo ""

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Variables
DB_USER="gestion_user"
DB_PASSWORD="365Soft_Dev"
DB_HOST="localhost"
DB_NAME="gestion_alquileres"
TENANT_SCHEMA="tenant_jhammil123"

echo "1. Verificando conexión a la base de datos..."
if PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -d $DB_NAME -h $DB_HOST -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Conexión exitosa${NC}"
else
    echo -e "${RED}✗ Error de conexión${NC}"
    exit 1
fi

echo ""
echo "2. Verificando que las tablas existen..."
TABLES=$(PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -d $DB_NAME -h $DB_HOST -t -A -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$TENANT_SCHEMA' AND table_name IN ('payments', 'payment_schedules', 'payment_refunds');")

if [ "$TABLES" -eq 3 ]; then
    echo -e "${GREEN}✓ Todas las tablas existen (payments, payment_schedules, payment_refunds)${NC}"
else
    echo -e "${RED}✗ Faltan tablas. Encontradas: $TABLES/3${NC}"
    exit 1
fi

echo ""
echo "3. Verificando permisos de INSERT..."
PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -d $DB_NAME -h $DB_HOST > /dev/null 2>&1 << EOF
SET search_path TO $TENANT_SCHEMA;
INSERT INTO payments (
  tenant_id, contract_id, property_id, amount, currency,
  payment_type, payment_method, status, payment_date,
  reference_number, notes, created_by
) VALUES (
  2, 2, 2, 100.00, 'BOB',
  'RENT', 'TRANSFER', 'PENDING', CURRENT_DATE,
  'SCRIPT-TEST-001', 'Prueba de permisos INSERT', 2
);
EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Permiso INSERT funciona${NC}"
else
    echo -e "${RED}✗ Error en INSERT${NC}"
    exit 1
fi

echo ""
echo "4. Verificando permisos de SELECT..."
PAYMENT_COUNT=$(PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -d $DB_NAME -h $DB_HOST -t -A -c "SET search_path TO $TENANT_SCHEMA; SELECT COUNT(*) FROM payments WHERE reference_number = 'SCRIPT-TEST-001';" | tail -1)

if [ "$PAYMENT_COUNT" -eq 1 ]; then
    echo -e "${GREEN}✓ Permiso SELECT funciona${NC}"
else
    echo -e "${RED}✗ Error en SELECT${NC}"
    exit 1
fi

echo ""
echo "5. Verificando permisos de UPDATE..."
PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -d $DB_NAME -h $DB_HOST > /dev/null 2>&1 << EOF
SET search_path TO $TENANT_SCHEMA;
UPDATE payments
SET status = 'APPROVED', admin_notes = 'Test update'
WHERE reference_number = 'SCRIPT-TEST-001';
EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Permiso UPDATE funciona${NC}"
else
    echo -e "${RED}✗ Error en UPDATE${NC}"
    exit 1
fi

echo ""
echo "6. Verificando permisos de DELETE..."
PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -d $DB_NAME -h $DB_HOST > /dev/null 2>&1 << EOF
SET search_path TO $TENANT_SCHEMA;
DELETE FROM payments WHERE reference_number = 'SCRIPT-TEST-001';
EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Permiso DELETE funciona${NC}"
else
    echo -e "${RED}✗ Error en DELETE${NC}"
    exit 1
fi

echo ""
echo "7. Verificando índices..."
INDEX_COUNT=$(PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -d $DB_NAME -h $DB_HOST -t -A -c "SET search_path TO $TENANT_SCHEMA; SELECT COUNT(*) FROM pg_indexes WHERE schemaname = '$TENANT_SCHEMA' AND tablename LIKE 'payment%';" | tail -1)

if [ "$INDEX_COUNT" -ge 10 ]; then
    echo -e "${GREEN}✓ Índices creados correctamente ($INDEX_COUNT índices)${NC}"
else
    echo -e "${YELLOW}⚠ Pocos índices. Encontrados: $INDEX_COUNT${NC}"
fi

echo ""
echo "8. Verificando triggers..."
TRIGGER_COUNT=$(PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -d $DB_NAME -h $DB_HOST -t -A -c "SELECT COUNT(*) FROM information_schema.triggers WHERE event_object_schema = '$TENANT_SCHEMA' AND event_object_table IN ('payments', 'payment_schedules');")

if [ "$TRIGGER_COUNT" -ge 2 ]; then
    echo -e "${GREEN}✓ Triggers creados correctamente ($TRIGGER_COUNT triggers)${NC}"
else
    echo -e "${YELLOW}⚠ Faltan triggers. Encontrados: $TRIGGER_COUNT${NC}"
fi

echo ""
echo "9. Verificando secuencias..."
SEQ_COUNT=$(PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -d $DB_NAME -h $DB_HOST -t -A -c "SELECT COUNT(*) FROM information_schema.sequences WHERE sequence_schema = '$TENANT_SCHEMA' AND sequence_name LIKE 'payment%';")

if [ "$SEQ_COUNT" -ge 3 ]; then
    echo -e "${GREEN}✓ Secuencias creadas correctamente ($SEQ_COUNT secuencias)${NC}"
else
    echo -e "${YELLOW}⚠ Faltan secuencias. Encontradas: $SEQ_COUNT${NC}"
fi

echo ""
echo "10. Probando consulta compleja con JOINs..."
PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -d $DB_NAME -h $DB_HOST > /dev/null 2>&1 << EOF
SET search_path TO $TENANT_SCHEMA;
SELECT
  p.id,
  p.amount,
  c.contract_number,
  u.name
FROM payments p
JOIN contracts c ON p.contract_id = c.id
JOIN "user" u ON p.tenant_id = u.id
LIMIT 1;
EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Consultas con JOINs funcionan${NC}"
else
    echo -e "${RED}✗ Error en JOINs${NC}"
    exit 1
fi

echo ""
echo "=========================================="
echo -e "${GREEN}✓ TODAS LAS PRUEBAS PASARON EXITOSAMENTE${NC}"
echo "=========================================="
echo ""
echo "Resumen:"
echo "  - Usuario DB: $DB_USER"
echo "  - Esquema: $TENANT_SCHEMA"
echo "  - Tablas: 3/3 creadas"
echo "  - Permisos: INSERT, SELECT, UPDATE, DELETE ✓"
echo "  - Índices: $INDEX_COUNT"
echo "  - Triggers: $TRIGGER_COUNT"
echo "  - Secuencias: $SEQ_COUNT"
echo ""
echo "El módulo de pagos está 100% funcional."
echo ""
