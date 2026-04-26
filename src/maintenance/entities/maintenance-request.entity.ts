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
import { Contract } from '../../contracts/entities/contract.entity';
import { MaintenanceMessage } from './maintenance-message.entity';
import { MaintenanceAttachment } from './maintenance-attachment.entity';

@Entity('maintenance_requests')
export class MaintenanceRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  ticket_number: string;

  @Column({
    type: 'enum',
    enum: ['MAINTENANCE', 'GENERAL'],
    default: 'MAINTENANCE',
  })
  request_type: string;

  @Column({
    type: 'enum',
    enum: [
      'GENERAL',
      'ACCESORIOS',
      'ELECTRICO',
      'CLIMATIZACION',
      'LLAVE_CERRADURA',
      'ILUMINACION',
      'AFUERA',
      'PLOMERIA',
    ],
    nullable: true,
  })
  category: string | null;

  @Column()
  title: string;

  @Column('text')
  description: string;

  @Column({
    type: 'enum',
    enum: ['YES', 'NO', 'NOT_APPLICABLE'],
    default: 'NOT_APPLICABLE',
  })
  permission_to_enter: string;

  @Column({ default: false })
  has_pets: boolean;

  @Column({ type: 'text', nullable: true })
  entry_notes: string;

  @Column({
    type: 'enum',
    enum: ['NEW', 'IN_PROGRESS', 'COMPLETED', 'DEFERRED', 'CLOSED'],
    default: 'NEW',
  })
  status: string;

  @Column({
    type: 'enum',
    enum: ['LOW', 'NORMAL', 'HIGH'],
    default: 'NORMAL',
  })
  priority: string;

  @Column({ type: 'date', nullable: true })
  due_date: Date;

  @Column({ nullable: true })
  assigned_to: number;

  @Column({ type: 'int', nullable: true })
  vendor_id: number | null;

  @Column()
  tenant_id: number;

  @Column()
  contract_id: number;

  @Column()
  property_id: number;

  // Relations
  @ManyToOne(() => Contract)
  @JoinColumn({ name: 'contract_id' })
  contract: Contract;

  @ManyToOne(() => Property)
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @OneToMany(
    () => MaintenanceMessage,
    (message) => message.maintenance_request,
    { cascade: true },
  )
  messages: MaintenanceMessage[];

  @OneToMany(
    () => MaintenanceAttachment,
    (attachment) => attachment.maintenance_request,
    { cascade: true },
  )
  attachments: MaintenanceAttachment[];

  @Column({
    type: 'varchar',
    default: 'REPORTED',
  })
  current_stage: string;

  @Column({ default: false })
  owner_authorized: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'int', nullable: true })
  vendor_rating: number | null;

  @Column({ type: 'text', nullable: true })
  vendor_rating_comment: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  vendor_rated_at: Date | null;

  @Column({ type: 'int', nullable: true })
  vendor_rated_by: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
