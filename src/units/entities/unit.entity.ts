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

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
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

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price_per_month: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price_per_night: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  deposit_amount: number;

  // Amenidades específicas de la unidad (distinto a las de la propiedad)
  @Column({ type: 'jsonb', nullable: true })
  features: Record<string, unknown>;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
