import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type OwnerStatementStatus = 'pending' | 'transferred';

const numericTransformer = {
  to: (value: number) => value,
  from: (value: string) => parseFloat(value),
};

@Entity('owner_statements')
@Index(['rental_owner_id'])
@Index(['property_id'])
@Index(['period_year', 'period_month'])
@Index(['rental_owner_id', 'property_id', 'period_year', 'period_month'], {
  unique: true,
})
export class OwnerStatement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  rental_owner_id: number;

  @Column()
  property_id: number;

  @Column({ type: 'integer', nullable: true })
  unit_id: number | null;

  @Column()
  period_month: number;

  @Column()
  period_year: number;

  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  gross_rent: number;

  @Column('numeric', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  maintenance_deduction: number;

  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  management_commission: number;

  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  net_amount: number;

  @Column({ length: 3, default: 'BOB' })
  currency: string;

  @Column({ default: 0 })
  payment_count: number;

  @Column({ length: 20, default: 'pending' })
  status: OwnerStatementStatus;

  @Column({ type: 'timestamp', nullable: true })
  transferred_at: Date | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  generated_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
