import type { ApplicationResult } from './applications.service';
import { ScreeningFinalStatus } from './enums/screening-final-status.enum';

export interface ScreeningChecklistRow {
  id: number;
  application_id: number;
  documents_verified: boolean;
  employer_call_name: string | null;
  employer_call_phone: string | null;
  employer_call_result: string | null;
  previous_landlord_name: string | null;
  previous_landlord_phone: string | null;
  previous_landlord_result: string | null;
  blacklist_checked: boolean;
  blacklist_result: string | null;
  notes: string | null;
  final_status: ScreeningFinalStatus | null;
  reviewed_by: number | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ApplicationScreeningResult {
  message: string;
  screening: ScreeningChecklistRow;
  contract?: Record<string, unknown>;
}

export interface ScreeningDecisionParams {
  id: number;
  application: ApplicationResult;
  checklist: ScreeningChecklistRow;
  adminId: number;
  tenantSlug: string;
  schemaName: string;
}
