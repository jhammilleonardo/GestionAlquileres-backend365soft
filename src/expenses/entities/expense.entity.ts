import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Property } from '../../properties/entities/property.entity';
import { ExpensePaymentStatusEnum } from '../enums/expense-category.enum';

@Entity('expenses')
export class Expense {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * Propiedad asociada al gasto
   */
  @Column({ type: 'int' })
  property_id: number;

  @ManyToOne(() => Property)
  @JoinColumn({ name: 'property_id' })
  property: Property;

  /**
   * Unidad opcional (si el gasto es para una unidad específica)
   */
  @Column({ type: 'int', nullable: true })
  unit_id: number | null;

  /**
   * Categoría del gasto
   * Puede ser una de las predefinidas o una personalizada por el tenant
   */
  @Column({ type: 'varchar', length: 50 })
  category: string;

  /**
   * Ámbito operativo del gasto: general, alquiler largo plazo o reserva corta.
   */
  @Column({ type: 'varchar', length: 20, default: 'GENERAL' })
  expense_scope: string;

  /**
   * Quién debe asumir o reembolsar el gasto.
   */
  @Column({ type: 'varchar', length: 20, default: 'COMPANY' })
  responsibility: string;

  /**
   * Estado de pago del egreso.
   */
  @Column({ type: 'varchar', length: 20, default: 'PAID' })
  payment_status: ExpensePaymentStatusEnum;

  /**
   * Monto del gasto
   */
  @Column('decimal', { precision: 12, scale: 2 })
  amount: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  paid_amount: number;

  /**
   * Moneda (ISO 4217)
   */
  @Column({ default: 'USD', length: 3 })
  currency: string;

  /**
   * Descripción del gasto
   */
  @Column('text', { nullable: true })
  description: string | null;

  /**
   * Fecha del gasto
   */
  @Column('date')
  date: Date;

  /**
   * Fecha de vencimiento cuando el gasto queda por pagar.
   */
  @Column('date', { nullable: true })
  due_date: Date | null;

  /**
   * Fecha en la que realmente salió caja/banco.
   */
  @Column('date', { nullable: true })
  paid_date: Date | null;

  /**
   * Proveedor/Vendedor del servicio o bien
   */
  @Column({ type: 'int', nullable: true })
  vendor_id: number | null;

  /**
   * Nombre del proveedor (backup)
   */
  @Column({ type: 'varchar', nullable: true })
  vendor_name: string | null;

  /**
   * URL o ruta del comprobante/recibo
   */
  @Column({ type: 'varchar', nullable: true })
  receipt_url: string | null;

  /**
   * Número de factura, recibo o documento externo.
   */
  @Column({ type: 'varchar', length: 80, nullable: true })
  invoice_number: string | null;

  /**
   * Contrato de alquiler largo plazo relacionado.
   */
  @Column({ type: 'int', nullable: true })
  contract_id: number | null;

  /**
   * Reserva de alquiler corto plazo relacionada.
   */
  @Column({ type: 'int', nullable: true })
  reservation_id: number | null;

  @Column({ type: 'int', nullable: true })
  maintenance_request_id: number | null;

  /**
   * Si se descuenta del estado de cuenta del propietario.
   */
  @Column({ default: true })
  affects_owner_statement: boolean;

  /**
   * Si el gasto debe recuperarse de inquilino, huésped, propietario u otro tercero.
   */
  @Column({ default: false })
  is_reimbursable: boolean;

  /**
   * Indica si es un gasto recurrente
   */
  @Column({ default: false })
  is_recurring: boolean;

  @Column({ type: 'varchar', length: 30, default: 'not_posted' })
  accounting_status: string;

  @Column({ type: 'int', nullable: true })
  journal_entry_id: number | null;

  /**
   * Intervalo de recurrencia (DAILY, WEEKLY, MONTHLY, QUARTERLY, YEARLY)
   */
  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  recurrence_interval: string | null;

  /**
   * Fecha de inicio de la recurrencia
   */
  @Column('date', { nullable: true })
  recurrence_start_date: Date | null;

  /**
   * Fecha de fin de la recurrencia (opcional)
   */
  @Column('date', { nullable: true })
  recurrence_end_date: Date | null;

  /**
   * ID del gasto recurrente padre (si es generado de uno recurrente)
   */
  @Column({ type: 'int', nullable: true })
  recurring_expense_id: number | null;

  /**
   * Notas internas
   */
  @Column('text', { nullable: true })
  notes: string | null;

  /**
   * Timestamps de auditoría
   */
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  /**
   * Usuario que creó el gasto
   */
  @Column({ type: 'int', nullable: true })
  created_by: number | null;

  /**
   * Usuario que actualizó por última vez
   */
  @Column({ type: 'int', nullable: true })
  updated_by: number | null;
}
