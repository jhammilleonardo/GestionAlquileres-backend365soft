import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { PropertyType } from './property-type.entity';
import { PropertySubtype } from './property-subtype.entity';
import { PropertyAddress } from './property-address.entity';
import { RentalOwner } from './rental-owner.entity';

@Entity('properties')
export class Property {
  @PrimaryGeneratedColumn()
  id: number;

  // Basic Info
  @Column()
  title: string;

  @Column({ nullable: true })
  description: string;

  @Column()
  property_type_id: number;

  @Column()
  property_subtype_id: number;

  @ManyToOne(() => PropertyType)
  @JoinColumn({ name: 'property_type_id' })
  property_type: PropertyType;

  @ManyToOne(() => PropertySubtype)
  @JoinColumn({ name: 'property_subtype_id' })
  property_subtype: PropertySubtype;

  // Status
  @Column({
    type: 'enum',
    enum: ['DISPONIBLE', 'OCUPADO', 'MANTENIMIENTO', 'RESERVADO', 'INACTIVO'],
    default: 'DISPONIBLE',
  })
  status: string;

  // Coordinates (added in details)
  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  latitude: number;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  longitude: number;

  // Images
  @Column({ type: 'json', default: [] })
  images: string[];

  // Security Deposit (Reservation)
  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  security_deposit_amount: number;

  // Amenities (stored as JSON string in PostgreSQL)
  @Column({ type: 'json', default: [] })
  amenities: string[];

  // Included Items (stored as JSON string)
  @Column({ type: 'json', default: [] })
  included_items: string[];

  // Financial
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  monthly_rent: number;

  @Column({ default: 'BOB' })
  currency: string;

  // Property characteristics
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  square_meters: number;

  @Column({ type: 'int', nullable: true })
  bedrooms: number;

  @Column({ type: 'int', nullable: true })
  bathrooms: number;

  @Column({ type: 'int', nullable: true })
  parking_spaces: number;

  @Column({ type: 'int', nullable: true })
  year_built: number;

  @Column({ default: false })
  is_furnished: boolean;

  // Property rules
  @Column({ type: 'jsonb', nullable: true })
  property_rules: {
    pets_allowed?: boolean;
    smoking_allowed?: boolean;
    max_occupants?: number;
    min_lease_months?: number;
  };

  // Account info (optional, for future payment implementation)
  @Column({ nullable: true })
  account_number: string;

  @Column({ nullable: true })
  account_type: string;

  @Column({ nullable: true })
  account_holder_name: string;

  @OneToMany(() => PropertyAddress, (address) => address.property)
  addresses: PropertyAddress[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
