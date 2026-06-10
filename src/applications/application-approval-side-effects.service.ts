import { Injectable, Logger } from '@nestjs/common';
import { ContractsService } from '../contracts/contracts.service';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { ApplicationStatus } from './enums/application-status.enum';
import { ApplicationApprovalSideEffectsParams } from './application-approval.types';

@Injectable()
export class ApplicationApprovalSideEffectsService {
  private readonly logger = new Logger(
    ApplicationApprovalSideEffectsService.name,
  );

  constructor(
    private readonly contractsService: ContractsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async emitPostApprovalSideEffects(
    params: ApplicationApprovalSideEffectsParams,
  ): Promise<void> {
    await this.contractsService.emitContractCreatedSideEffects({
      adminUserId: params.adminId,
      contract: params.contract,
      contractNumber: params.contract.contract_number,
      createContractDto: params.contractData,
      schemaName: params.schemaName,
      schemaPrefix: params.schemaPrefix,
      tenantSlug: params.tenantSlug,
    });

    try {
      await this.notificationsService.createForUserInSchema(
        params.schemaName,
        Number(params.application.applicant_id),
        'application.status.changed' as NotificationEventType,
        'Actualización de tu solicitud',
        `Tu solicitud para la propiedad ${String(params.application.property_title)} ha cambiado a: ${String(ApplicationStatus.APROBADA)}`,
        {
          applicationId: params.application.id,
          property_title: params.application.property_title,
          status: ApplicationStatus.APROBADA,
          feedback: params.updateDto.admin_feedback,
        },
        params.tenantSlug,
      );
    } catch (error) {
      this.logger.error(
        'Error al notificar aprobación al inquilino',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
