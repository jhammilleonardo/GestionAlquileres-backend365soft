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
import { ApplicationStatus } from '../enums/application-status.enum';

@Entity('rental_applications')
export class RentalApplication {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  property_id: number;

  @ManyToOne(() => Property)
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @Column()
  applicant_id: number;

  @Column({
    type: 'enum',
    enum: ApplicationStatus,
    default: ApplicationStatus.PENDIENTE,
  })
  status: ApplicationStatus;

  // Datos personales adicionales
  @Column({ type: 'jsonb', nullable: true })
  personal_data: {
    full_name: string;
    phone: string;
    identity_document: string;
    current_address: string;
    birth_date?: string;
  };

  // Datos laborales
  @Column({ type: 'jsonb', nullable: true })
  employment_data: {
    employer_name: string;
    position: string;
    monthly_income: number;
    employment_duration: string;
    employer_phone: string;
  };

  // Historial de alquiler
  @Column({ type: 'jsonb', nullable: true })
  rental_history: {
    previous_landlord_name: string;
    previous_landlord_phone: string;
    reason_for_leaving: string;
    previous_rent_amount: number;
  }[];

  // Referencias personales
  @Column({ type: 'jsonb', nullable: true })
  references: {
    name: string;
    relationship: string;
    phone: string;
  }[];

  // Enlaces a documentos cargados (identidad, boletas de pago, etc)
  @Column({ type: 'jsonb', nullable: true })
  documents: {
    type: string;
    url: string;
    name: string;
  }[];

  @Column({ type: 'text', nullable: true })
  additional_notes: string;

  @Column({ type: 'text', nullable: true })
  admin_feedback: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
