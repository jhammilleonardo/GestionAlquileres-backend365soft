import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('rental_owners')
export class RentalOwner {
  @PrimaryGeneratedColumn()
  id: number;

  // ─── Datos personales / empresa ───────────────────────────────────────────

  @Column()
  name: string;

  @Column({ nullable: true })
  company_name: string;

  @Column({ nullable: true })
  is_company: boolean;

  @Column()
  primary_email: string;

  @Column()
  phone_number: string;

  @Column({ nullable: true })
  secondary_email: string;

  @Column({ nullable: true })
  secondary_phone: string;

  @Column({ type: 'text', default: '' })
  notes: string;

  @Column({ default: true })
  is_active: boolean;

  // ─── Datos bancarios ──────────────────────────────────────────────────────
  // Soporta múltiples países: CBU (Argentina/Bolivia), IBAN (Internacional),
  // número de cuenta estándar (Guatemala, Honduras, EE.UU.)

  @Column({ nullable: true })
  bank_name: string;

  @Column({ nullable: true })
  account_number: string;

  /** 'checking' | 'savings' | 'corriente' | 'ahorro' */
  @Column({ nullable: true })
  account_type: string;

  @Column({ nullable: true })
  account_holder_name: string;

  /** CBU (22 dígitos), IBAN (hasta 34 chars) o routing number (EE.UU.) */
  @Column({ nullable: true })
  cbu_iban: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
