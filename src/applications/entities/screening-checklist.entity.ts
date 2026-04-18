import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { RentalApplication } from './application.entity';
import { ScreeningFinalStatus } from '../enums/screening-final-status.enum';

@Entity('screening_checklist')
export class ScreeningChecklist {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  application_id: number;

  @ManyToOne(() => RentalApplication)
  @JoinColumn({ name: 'application_id' })
  application: RentalApplication;

  @Column({ default: false })
  documents_verified: boolean;

  @Column({ type: 'varchar', length: 150, nullable: true })
  employer_call_name: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  employer_call_phone: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  employer_call_result: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  previous_landlord_name: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  previous_landlord_phone: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  previous_landlord_result: string | null;

  @Column({ default: false })
  blacklist_checked: boolean;

  @Column({ type: 'varchar', length: 50, nullable: true })
  blacklist_result: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({
    type: 'enum',
    enum: ScreeningFinalStatus,
    nullable: true,
  })
  final_status: ScreeningFinalStatus | null;

  @Column({ type: 'integer', nullable: true })
  reviewed_by: number | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewed_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
