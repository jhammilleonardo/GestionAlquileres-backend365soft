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
   * Monto del gasto
   */
  @Column('decimal', { precision: 12, scale: 2 })
  amount: number;

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
   * Indica si es un gasto recurrente
   */
  @Column({ default: false })
  is_recurring: boolean;

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
