import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { ApplicationApprovalService } from './application-approval.service';
import { ApplicationStatusService } from './application-status.service';
import {
  ApplicationScreeningResult,
  ScreeningDecisionParams,
} from './application-screening.types';
import { UpdateScreeningDto } from './dto/update-screening.dto';
import { ApplicationStatus } from './enums/application-status.enum';
import { ScreeningFinalStatus } from './enums/screening-final-status.enum';

@Injectable()
export class ApplicationScreeningDecisionService {
  private readonly logger = new Logger(
    ApplicationScreeningDecisionService.name,
  );

  constructor(
    private readonly applicationStatusService: ApplicationStatusService,
    private readonly applicationApprovalService: ApplicationApprovalService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async handleFinalStatus(
    dto: UpdateScreeningDto,
    params: ScreeningDecisionParams,
  ): Promise<ApplicationScreeningResult> {
    if (dto.final_status === ScreeningFinalStatus.APPROVED) {
      return this.handleApproved(dto, params);
    }

    if (dto.final_status === ScreeningFinalStatus.REJECTED) {
      return this.handleRejected(dto, params);
    }

    return this.handleRequiresCosigner(dto, params);
  }

  private async handleApproved(
    dto: UpdateScreeningDto,
    params: ScreeningDecisionParams,
  ): Promise<ApplicationScreeningResult> {
    if (!dto.monthly_rent) {
      throw new BadRequestException(
        'Se requiere monthly_rent para aprobar una solicitud y generar el contrato',
      );
    }

    const result =
      await this.applicationApprovalService.approveAndCreateContract(
        params.id,
        {
          monthly_rent: dto.monthly_rent,
          currency: dto.currency,
          payment_day: dto.payment_day,
          deposit_amount: dto.deposit_amount,
          admin_feedback:
            dto.admin_feedback ?? `Solicitud aprobada tras screening completo.`,
        },
        params.adminId,
        params.tenantSlug,
      );

    return {
      message: 'Solicitud aprobada: contrato generado automáticamente',
      screening: params.checklist,
      contract: result.contract_generated as Record<string, unknown>,
    };
  }

  private async handleRejected(
    dto: UpdateScreeningDto,
    params: ScreeningDecisionParams,
  ): Promise<ApplicationScreeningResult> {
    await this.applicationStatusService.updateStatus(
      params.id,
      {
        status: ApplicationStatus.RECHAZADA,
        admin_feedback:
          dto.admin_feedback ??
          'Solicitud rechazada tras el proceso de screening.',
      },
      params.tenantSlug,
    );

    await this.notifyApplicantSafely({
      params,
      title: 'Resultado de tu solicitud de alquiler',
      message: `Tu solicitud para la propiedad ${String(
        params.application.property_title,
      )} ha sido rechazada. ${dto.admin_feedback ?? ''}`.trim(),
      finalStatus: ScreeningFinalStatus.REJECTED,
    });

    return {
      message: 'Solicitud rechazada. Inquilino notificado.',
      screening: params.checklist,
    };
  }

  private async handleRequiresCosigner(
    dto: UpdateScreeningDto,
    params: ScreeningDecisionParams,
  ): Promise<ApplicationScreeningResult> {
    await this.applicationStatusService.updateStatus(
      params.id,
      {
        status: ApplicationStatus.EN_REVISION,
        admin_feedback:
          dto.admin_feedback ??
          'Se requiere un co-firmante para continuar con la solicitud.',
      },
      params.tenantSlug,
    );

    await this.notifyApplicantSafely({
      params,
      title: 'Acción requerida en tu solicitud',
      message: `Tu solicitud para la propiedad ${String(
        params.application.property_title,
      )} requiere un co-firmante. Comunícate con la administración.`,
      finalStatus: ScreeningFinalStatus.REQUIRES_COSIGNER,
    });

    return {
      message:
        'Solicitud marcada como requiere co-firmante. Inquilino notificado.',
      screening: params.checklist,
    };
  }

  private async notifyApplicantSafely(args: {
    params: ScreeningDecisionParams;
    title: string;
    message: string;
    finalStatus: ScreeningFinalStatus;
  }): Promise<void> {
    try {
      await this.notificationsService.createForUserInSchema(
        args.params.schemaName,
        Number(args.params.application.applicant_id),
        'application.status.changed' as NotificationEventType,
        args.title,
        args.message,
        { applicationId: args.params.id, final_status: args.finalStatus },
        args.params.tenantSlug,
      );
    } catch (error) {
      this.logger.error(
        'Error al notificar resultado de screening al inquilino',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
