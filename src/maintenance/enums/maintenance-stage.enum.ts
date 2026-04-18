export enum MaintenanceStage {
  REPORTED = 'REPORTED',
  ASSIGNED = 'ASSIGNED',
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  REPORTED_TO_OWNER = 'REPORTED_TO_OWNER',
}

export const STAGE_ORDER: MaintenanceStage[] = [
  MaintenanceStage.REPORTED,
  MaintenanceStage.ASSIGNED,
  MaintenanceStage.SCHEDULED,
  MaintenanceStage.IN_PROGRESS,
  MaintenanceStage.COMPLETED,
  MaintenanceStage.REPORTED_TO_OWNER,
];

export const TECHNICIAN_ALLOWED_TARGET_STAGES: MaintenanceStage[] = [
  MaintenanceStage.IN_PROGRESS,
  MaintenanceStage.COMPLETED,
];
