import { PaymentType, PaymentMethod, PaymentStatus, Currency, PaymentProcessor } from '../enums';

/**
 * Payment Interface
 *
 * Representa un pago en el sistema.
 */
export interface Payment {
  id: number;

  // Relaciones
  tenant_id: number;
  contract_id: number;
  property_id: number;

  // Información financiera
  amount: number;
  currency: Currency;

  // Tipo y método
  payment_type: PaymentType;
  payment_method: PaymentMethod;

  // Estados
  status: PaymentStatus;

  // Fechas
  payment_date: string | Date;
  due_date?: string | Date;
  processed_date?: string | Date;

  // Referencias
  reference_number?: string;
  transaction_id?: string;
  check_number?: string;

  // Procesador
  payment_processor: PaymentProcessor;
  processor_fee?: number;

  // Archivos
  proof_file?: string;
  receipt_file?: string;

  // Notas
  notes?: string;
  admin_notes?: string;
  rejection_reason?: string;

  // Flags
  is_partial_payment: boolean;
  parent_payment_id?: number;
  is_recurring: boolean;
  recurring_schedule_id?: number;
  is_autopay: boolean;

  // Tracking
  created_by?: number;
  approved_by?: number;
  approved_at?: string | Date;

  // Metadata
  metadata?: Record<string, any>;

  // Timestamps
  created_at: string | Date;
  updated_at: string | Date;

  // Relaciones opcionales (joined)
  tenant?: TenantReference;
  property?: PropertyReference;
  contract?: ContractReference;
}

/**
 * Payment Statistics
 */
export interface PaymentStats {
  total_payments: number;
  total_pending: number;
  total_processing: number;
  total_approved: number;
  total_rejected: number;
  total_failed: number;
  total_amount_pending: number;
  total_amount_approved: number;
  total_amount_failed: number;

  // Por moneda
  by_currency?: Record<string, {
    count: number;
    total_amount: number;
  }>;

  // Por tipo
  by_type?: Record<string, number>;

  // Por método
  by_method?: Record<string, number>;
}

/**
 * Referencias
 */
export interface TenantReference {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
}

export interface PropertyReference {
  id: number;
  title: string;
  address?: string;
}

export interface ContractReference {
  id: number;
  contract_number: string;
  start_date: string;
  end_date: string;
  status: string;
}
