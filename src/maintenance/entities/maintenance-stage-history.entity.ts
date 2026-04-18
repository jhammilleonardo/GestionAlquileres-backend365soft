import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('maintenance_stage_history')
export class MaintenanceStageHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  request_id: number;

  @Column({ type: 'varchar', nullable: true })
  from_stage: string | null;

  @Column()
  to_stage: string;

  @Column()
  changed_by_user_id: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'jsonb', default: '[]' })
  photos: string[];

  @CreateDateColumn()
  created_at: Date;
}
