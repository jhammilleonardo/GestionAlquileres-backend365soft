/**
 * Audit Log Entity
 * Registro de auditoría para todas las operaciones en la lista negra
 * Datos sensibles: solo ADMIN puede acceder
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('blacklist_audit_log', { schema: 'public' })
@Index(['tenant_id'])
@Index(['admin_user_id'])
@Index(['created_at'])
@Index(['action'])
export class BlacklistAuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50 })
  action: string; // 'CREATE', 'UPDATE', 'DELETE', 'CHECK'

  @Column({ type: 'int' })
  tenant_id: number;

  @Column({ type: 'int', nullable: true })
  admin_user_id: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  admin_email: string;

  @Column({ type: 'int', nullable: true })
  blacklisted_tenant_id: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  document_number: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  full_name: string;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip_address: string;

  @Column({ type: 'text', nullable: true })
  user_agent: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}
