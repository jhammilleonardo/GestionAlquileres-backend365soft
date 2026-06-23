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
import { UnitStatus } from '../enums/unit-status.enum';
import { RentalType } from '../enums/rental-type.enum';
import { decimalTransformer } from '../../common/utils/decimal.transformer';

@Entity('units')
export class Unit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  property_id: number;

  @ManyToOne(() => Property, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @Column()
  unit_number: string;

  @Column({ type: 'int', nullable: true })
  floor: number;

  @Column({ type: 'int', nullable: true })
  bedrooms: number;

  @Column({ type: 'int', nullable: true })
  bathrooms: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  square_meters: number;

  @Column({
    type: 'enum',
    enum: UnitStatus,
    default: UnitStatus.AVAILABLE,
  })
  status: UnitStatus;

  @Column({
    type: 'enum',
    enum: RentalType,
    nullable: true,
  })
  rental_type: RentalType;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  price_per_month: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  price_per_night: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  deposit_amount: number;

  // ─── Campos exclusivos de alquiler corto plazo ────────────────────────────

  @Column({ type: 'int', nullable: true })
  min_nights: number;

  @Column({ type: 'int', nullable: true })
  max_nights: number;

  @Column({ type: 'varchar', length: 5, nullable: true })
  checkin_time: string;

  @Column({ type: 'varchar', length: 5, nullable: true })
  checkout_time: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  cleaning_fee: number;

  // Descuento (%) aplicado a estadías de 7+ noches.
  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  weekly_discount_pct: number;

  // Descuento (%) aplicado a estadías de 28+ noches.
  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  monthly_discount_pct: number;

  @Column({
    type: 'decimal',
    precision: 6,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  weekend_adjustment_pct: number;

  @Column({ type: 'int', nullable: true })
  early_bird_min_days: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  early_bird_discount_pct: number;

  @Column({ type: 'int', nullable: true })
  last_minute_max_days: number;

  @Column({
    type: 'decimal',
    precision: 6,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  last_minute_adjustment_pct: number;

  @Column({ type: 'int', nullable: true })
  advance_notice_days: number;

  @Column({ type: 'int', nullable: true })
  max_advance_days: number;

  // Modo de reserva OTA: 'instant' auto-confirma; 'request' deja la reserva
  // PENDING hasta que el admin la confirme (o expire).
  @Column({ type: 'varchar', length: 20, default: 'instant' })
  booking_mode: string;

  // Política de cancelación: flexible | moderate | strict | non_refundable.
  @Column({ type: 'varchar', length: 20, default: 'moderate' })
  cancellation_policy: string;

  // Adelanto requerido para confirmar la reserva, como % del total (0-100).
  // NULL = se exige el pago completo (comportamiento por defecto).
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  deposit_to_confirm_pct: number | null;

  // Amenidades específicas de la unidad (distinto a las de la propiedad)
  @Column({ type: 'jsonb', nullable: true })
  features: Record<string, unknown>;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
