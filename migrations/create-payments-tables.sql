-- =====================================================
-- MIGRATION: Create Payments Tables
-- Description: Sistema completo de pagos internacional
-- Author: Sistema de Gestión de Alquileres 365Soft
-- Date: 2026-02-13
-- =====================================================

-- =====================================================
-- 1. TABLA PRINCIPAL DE PAGOS
-- =====================================================
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,

  -- Relaciones
  tenant_id INTEGER NOT NULL,
  contract_id INTEGER NOT NULL,
  property_id INTEGER NOT NULL,

  -- Información financiera
  amount DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',

  -- Tipo y método
  payment_type VARCHAR(50) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,

  -- Estados
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',

  -- Fechas
  payment_date DATE NOT NULL,
  due_date DATE,
  processed_date TIMESTAMP,

  -- Referencias y tracking
  reference_number VARCHAR(100),
  transaction_id VARCHAR(255),
  check_number VARCHAR(50),

  -- Procesador de pago
  payment_processor VARCHAR(50) DEFAULT 'manual',
  processor_fee DECIMAL(10, 2) DEFAULT 0,

  -- Archivos
  proof_file VARCHAR(255),
  receipt_file VARCHAR(255),

  -- Notas
  notes TEXT,
  admin_notes TEXT,
  rejection_reason TEXT,

  -- Pago parcial y recurrente
  is_partial_payment BOOLEAN DEFAULT false,
  parent_payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  is_recurring BOOLEAN DEFAULT false,
  recurring_schedule_id INTEGER,

  -- Auto-pago
  is_autopay BOOLEAN DEFAULT false,

  -- Tracking de usuarios
  created_by INTEGER,
  approved_by INTEGER,
  approved_at TIMESTAMP,

  -- Metadatos flexibles (JSON)
  metadata JSONB,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 2. TABLA DE SCHEDULES (Pagos Recurrentes)
-- =====================================================
CREATE TABLE IF NOT EXISTS payment_schedules (
  id SERIAL PRIMARY KEY,

  -- Relaciones
  tenant_id INTEGER NOT NULL,
  contract_id INTEGER NOT NULL,
  property_id INTEGER NOT NULL,

  -- Información financiera
  amount DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  payment_type VARCHAR(50) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,

  -- Configuración de recurrencia
  frequency VARCHAR(20) NOT NULL, -- MONTHLY, WEEKLY, BIWEEKLY, QUARTERLY, YEARLY
  start_date DATE NOT NULL,
  end_date DATE,
  day_of_month INTEGER CHECK (day_of_month >= 1 AND day_of_month <= 31),

  -- Estado
  is_active BOOLEAN DEFAULT true,
  last_payment_date DATE,
  next_payment_date DATE,

  -- Auto-pago
  autopay_enabled BOOLEAN DEFAULT false,
  autopay_method VARCHAR(50),
  autopay_token VARCHAR(255), -- Token del procesador para cobro automático

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 3. TABLA DE REEMBOLSOS
-- =====================================================
CREATE TABLE IF NOT EXISTS payment_refunds (
  id SERIAL PRIMARY KEY,

  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  reason TEXT,
  refund_method VARCHAR(50),
  refund_date DATE NOT NULL,
  transaction_id VARCHAR(255),

  processed_by INTEGER,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 4. ÍNDICES PARA PERFORMANCE
-- =====================================================

-- Payments table
CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_contract ON payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_payments_property ON payments(property_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_currency ON payments(currency);
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(payment_type);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(payment_method);
CREATE INDEX IF NOT EXISTS idx_payments_processor ON payments(payment_processor);

-- Payment schedules table
CREATE INDEX IF NOT EXISTS idx_payment_schedules_tenant ON payment_schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_contract ON payment_schedules(contract_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_active ON payment_schedules(is_active);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_next_date ON payment_schedules(next_payment_date);

-- Payment refunds table
CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment ON payment_refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_date ON payment_refunds(refund_date);

-- =====================================================
-- 5. FUNCIÓN PARA ACTUALIZAR updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. TRIGGERS PARA AUTO-UPDATE
-- =====================================================
DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_schedules_updated_at ON payment_schedules;
CREATE TRIGGER update_payment_schedules_updated_at
    BEFORE UPDATE ON payment_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 7. COMENTARIOS DE DOCUMENTACIÓN
-- =====================================================
COMMENT ON TABLE payments IS 'Tabla principal de pagos con soporte multi-moneda y multi-método';
COMMENT ON TABLE payment_schedules IS 'Configuración de pagos recurrentes y auto-pago';
COMMENT ON TABLE payment_refunds IS 'Historial de reembolsos de pagos';

COMMENT ON COLUMN payments.currency IS 'Código ISO 4217 de moneda (USD, EUR, GBP, etc.)';
COMMENT ON COLUMN payments.payment_type IS 'Tipo de pago: RENT, DEPOSIT, LATE_FEE, UTILITY, etc.';
COMMENT ON COLUMN payments.payment_method IS 'Método: ACH, CREDIT_CARD, PAYPAL, STRIPE, etc.';
COMMENT ON COLUMN payments.status IS 'Estado: PENDING, PROCESSING, APPROVED, REJECTED, FAILED, REFUNDED, REVERSED';
COMMENT ON COLUMN payments.payment_processor IS 'Procesador: stripe, paypal, square, authorize_net, manual';
COMMENT ON COLUMN payments.metadata IS 'Datos adicionales en formato JSON para extensibilidad';

-- =====================================================
-- 8. DATOS INICIALES (OPCIONAL)
-- =====================================================
-- Puedes agregar configuraciones o datos de ejemplo aquí

-- =====================================================
-- FIN DE MIGRACIÓN
-- =====================================================
