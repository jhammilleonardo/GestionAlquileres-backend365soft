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
import { Property } from '../../properties/entities/property.entity';
import { ContractStatus } from '../enums/contract-status.enum';
import { MaintenanceRequest } from '../../maintenance/entities/maintenance-request.entity';
import { RentalApplication } from '../../applications/entities/application.entity';

@Entity('contracts')
export class Contract {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  contract_number: string; // CTR-YYYY-####

  @Column()
  tenant_id: number; // User ID from the tenant schema

  @Column()
  property_id: number;

  @ManyToOne(() => Property)
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @OneToMany(() => MaintenanceRequest, (maintenance) => maintenance.contract)
  maintenance_requests: MaintenanceRequest[];

  @Column({
    type: 'enum',
    enum: ContractStatus,
    default: ContractStatus.BORRADOR,
  })
  status: ContractStatus;

  // Fechas importantes
  @Column({ type: 'date' })
  start_date: Date;

  @Column({ type: 'date' })
  end_date: Date;

  @Column({ type: 'int', nullable: true })
  duration_months: number;

  @Column({ type: 'date', nullable: true })
  key_delivery_date: Date;

  @Column({ type: 'timestamp', nullable: true })
  tenant_signature_date: Date;

  @Column({ type: 'timestamp', nullable: true })
  owner_signature_date: Date;

  @Column({ nullable: true })
  signed_ip: string;

  @Column({ type: 'timestamp', nullable: true })
  activation_date: Date;

  @Column({ type: 'date', nullable: true })
  actual_termination_date: Date;

  // Términos financieros
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  monthly_rent: number;

  @Column({ default: 'BOB' })
  currency: string;

  @Column({ type: 'int', default: 5 })
  payment_day: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  deposit_amount: number;

  @Column({ nullable: true })
  payment_method: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  late_fee_percentage: number;

  @Column({ type: 'int', default: 0 })
  grace_days: number;

  // Términos del contrato (Stored as JSON for flexibility or specific columns)
  @Column({ type: 'jsonb', nullable: true })
  included_services: string[]; // ['agua', 'luz', etc]

  @Column({ type: 'text', nullable: true })
  tenant_responsibilities: string;

  @Column({ type: 'text', nullable: true })
  owner_responsibilities: string;

  @Column({ type: 'text', nullable: true })
  prohibitions: string;

  @Column({ type: 'text', nullable: true })
  coexistence_rules: string;

  @Column({ type: 'text', nullable: true })
  renewal_terms: string;

  @Column({ type: 'text', nullable: true })
  termination_terms: string;

  @Column({ type: 'jsonb', nullable: true })
  special_clauses: string[];

  @Column({ default: 'Bolivia' })
  jurisdiction: string;

  // Archivos
  @Column({ nullable: true })
  pdf_url: string;

  @Column({ default: false })
  is_signed: boolean;

  // Datos bancarios (opcionales)
  @Column({ nullable: true })
  bank_account_number: string;

  @Column({ nullable: true })
  bank_account_type: string;

  @Column({ nullable: true })
  bank_name: string;

  @Column({ nullable: true })
  bank_account_holder: string;

  // Renovación
  @Column({ default: false })
  auto_renew: boolean;

  @Column({ type: 'int', default: 30 })
  renewal_notice_days: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  auto_increase_percentage: number;

  @Column({ nullable: true })
  previous_contract_id: number;

  @Column({ nullable: true })
  application_id: number; // ID de la solicitud de alquiler que originó este contrato

  @ManyToOne(() => RentalApplication, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'application_id' })
  application: RentalApplication;

  // Terminación
  @Column({ nullable: true })
  termination_reason: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  applied_penalty: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  returned_deposit: number;

  @Column({ nullable: true })
  terminated_by: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
