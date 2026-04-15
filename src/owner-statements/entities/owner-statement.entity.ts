import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity('owner_statements')
@Index(['rental_owner_id'])
@Index(['property_id'])
@Index(['period_year', 'period_month'])
@Index(['rental_owner_id', 'period_year', 'period_month'], { unique: true })
export class OwnerStatement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  rental_owner_id: number;

  @Column()
  property_id: number;

  @Column()
  period_month: number;

  @Column()
  period_year: number;

  @Column('numeric', { precision: 12, scale: 2 })
  gross_rent: number;

  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  maintenance_deduction: number;

  @Column('numeric', { precision: 12, scale: 2 })
  management_commission: number;

  @Column('numeric', { precision: 12, scale: 2 })
  net_amount: number;

  @Column({ length: 3, default: 'BOB' })
  currency: string;

  @Column({ default: 0 })
  payment_count: number;

  @CreateDateColumn()
  generated_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
