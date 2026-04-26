import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('contract_templates')
export class ContractTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 5 })
  language: string; // 'es' | 'en'

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
