import type { MaintenanceStage } from './enums/maintenance-stage.enum';
import type { ContractStatus } from '../contracts/enums/contract-status.enum';
import type {
  MaintenancePriority,
  MaintenanceRequestType,
  MaintenanceStatus,
} from './dto/maintenance-filters.dto';

export interface CountRow {
  count: string;
}

export interface CountByStatusRow extends CountRow {
  status: MaintenanceStatus;
}

export interface CountByPriorityRow extends CountRow {
  priority: MaintenancePriority;
}

export interface IdRow {
  id: number;
}

export interface UserNameRow {
  name: string | null;
}

export interface PropertySummaryRow {
  id: number;
  title: string;
}

export interface MaintenanceContractRow {
  id: number;
  tenant_id: number;
  property_id: number;
  property_title?: string;
  contract_number: string;
  status: ContractStatus;
}

export interface MaintenanceAttachmentRow {
  id: number;
  maintenance_request_id?: number;
  message_id?: number | null;
  file_url: string;
  file_name: string;
  file_type: string;
  file_size?: number;
  uploaded_by?: number;
  created_at?: Date | string;
}

export interface MaintenanceMessageRow {
  id: number;
  maintenance_request_id: number;
  user_id: number;
  message: string;
  send_to_resident: boolean;
  attachments: MaintenanceAttachmentRow[];
  created_at?: Date | string;
  sender_name?: string | null;
  sender_role?: string | null;
}

export interface MaintenanceRequestRow {
  id: number;
  ticket_number: string;
  request_type: MaintenanceRequestType;
  category: string | null;
  title: string;
  description: string;
  permission_to_enter: string;
  has_pets: boolean;
  entry_notes: string | null;
  status: MaintenanceStatus;
  priority: MaintenancePriority;
  due_date: Date | string | null;
  assigned_to: number | null;
  vendor_id: number | null;
  tenant_id: number;
  contract_id: number;
  property_id: number;
  current_stage: MaintenanceStage | string;
  owner_authorized: boolean;
  completed_at: Date | string | null;
  vendor_rating: number | null;
  vendor_rating_comment: string | null;
  vendor_rated_at: Date | string | null;
  vendor_rated_by: number | null;
  property?: PropertySummaryRow | null;
  contract?: { id: number; contract_number: string } | null;
  tenant?: {
    id: number;
    name: string;
    email: string;
    phone: string | null;
  } | null;
  messages?: MaintenanceMessageRow[];
  attachments?: MaintenanceAttachmentRow[];
}

export interface MaintenanceStageHistoryRow {
  id: number;
  request_id: number;
  from_stage: string | null;
  to_stage: string;
  changed_by_user_id: number;
  changed_by_name?: string | null;
  notes?: string | null;
  photos: string[];
  created_at?: Date | string;
}

export interface MaintenanceStats {
  total: number;
  byStatus: Partial<Record<MaintenanceStatus, number>>;
  byPriority: Partial<Record<MaintenancePriority, number>>;
  newRequests: number;
  urgentRequests: number;
}

export interface TenantMaintenanceStats {
  total: number;
  active: number;
  completed: number;
}

export interface VendorRow {
  id: number;
  is_active: boolean;
}
