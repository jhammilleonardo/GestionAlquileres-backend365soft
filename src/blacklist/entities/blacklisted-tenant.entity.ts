import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * BlacklistedTenant Entity
 * Tabla compartida en schema public entre todos los tenants
 * Almacena inquilinos problemáticos reportados por las inmobiliarias
 */
@Entity('blacklisted_tenants', { schema: 'public' })
@Index(['document_number', 'document_type'])
@Index(['document_number'])
export class BlacklistedTenant {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  full_name: string;

  @Column({ type: 'varchar', length: 50 })
  document_number: string;

  @Column({ type: 'varchar', length: 50 })
  document_type: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ name: 'reported_by_tenant_id' })
  reported_by_tenant_id: number;

  @Column({ type: 'int', nullable: true })
  admin_id: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  admin_email: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}
