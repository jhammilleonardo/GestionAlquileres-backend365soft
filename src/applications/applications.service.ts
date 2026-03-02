import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { ApproveApplicationDto } from './dto/approve-application.dto';
import { ApplicationStatus } from './enums/application-status.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { UsersService, UserWithoutPassword } from '../users/users.service';
import { ContractsService } from '../contracts/contracts.service';

export interface ApplicationResult {
  id: number;
  property_id: number;
  applicant_id: number;
  status: ApplicationStatus;
  personal_data: any;
  employment_data: any;
  rental_history: any;
  references: any;
  documents: any;
  additional_notes?: string;
  admin_feedback?: string;
  created_at: Date;
  updated_at: Date;
  property_title?: string;
  applicant_name?: string;
  applicant_email?: string;
}

interface PropertyResult {
  id: number;
  title: string;
  status: string;
}

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly contractsService: ContractsService,
  ) {}

  async approveAndCreateContract(
    id: number,
    approveDto: ApproveApplicationDto,
    adminId: number,
  ) {
    // 1. Obtener la solicitud con datos de la propiedad
    const application = await this.findOne(id);

    if (application.status === ApplicationStatus.APROBADA) {
      throw new BadRequestException('Esta solicitud ya ha sido aprobada');
    }

    // 2. Calcular fechas y valores por defecto
    const startDate = approveDto.start_date
      ? new Date(approveDto.start_date)
      : new Date();
    const endDate = approveDto.end_date
      ? new Date(approveDto.end_date)
      : new Date(Date.UTC(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate()));

    // Calcular deposit_amount si no se proporcionó (1 mes de renta por defecto)
    const depositAmount = approveDto.deposit_amount ?? approveDto.monthly_rent;

    // 3. Actualizar estado de la solicitud a APROBADA
    const updatedApplication = await this.updateStatus(id, {
      status: ApplicationStatus.APROBADA,
      admin_feedback:
        approveDto.admin_feedback ||
        `Solicitud aprobada para la propiedad "${String(application.property_title)}".`,
    });

    // 4. Crear el contrato usando LOS DATOS DEL DTO
    // Si falla, revertir el estado de la solicitud y propagar el error real
    const contractData: any = {
      property_id: Number(application.property_id),
      tenant_id: Number(application.applicant_id),
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      monthly_rent: approveDto.monthly_rent,
      currency: approveDto.currency || 'BOB',
      payment_day: approveDto.payment_day || 5,
      deposit_amount: depositAmount,
      application_id: id, // Vincular contrato con la solicitud
    };

    // Campos opcionales del contrato
    if (approveDto.payment_method) contractData.payment_method = approveDto.payment_method;
    if (approveDto.late_fee_percentage !== undefined) contractData.late_fee_percentage = approveDto.late_fee_percentage;
    if (approveDto.grace_days !== undefined) contractData.grace_days = approveDto.grace_days;
    if (approveDto.included_services) contractData.included_services = approveDto.included_services;
    if (approveDto.key_delivery_date) contractData.key_delivery_date = approveDto.key_delivery_date;
    if (approveDto.tenant_responsibilities) contractData.tenant_responsibilities = approveDto.tenant_responsibilities;
    if (approveDto.owner_responsibilities) contractData.owner_responsibilities = approveDto.owner_responsibilities;
    if (approveDto.prohibitions) contractData.prohibitions = approveDto.prohibitions;
    if (approveDto.coexistence_rules) contractData.coexistence_rules = approveDto.coexistence_rules;
    if (approveDto.renewal_terms) contractData.renewal_terms = approveDto.renewal_terms;
    if (approveDto.termination_terms) contractData.termination_terms = approveDto.termination_terms;
    if (approveDto.jurisdiction) contractData.jurisdiction = approveDto.jurisdiction;
    if (approveDto.auto_renew !== undefined) contractData.auto_renew = approveDto.auto_renew;
    if (approveDto.renewal_notice_days !== undefined) contractData.renewal_notice_days = approveDto.renewal_notice_days;
    if (approveDto.auto_increase_percentage !== undefined) contractData.auto_increase_percentage = approveDto.auto_increase_percentage;
    if (approveDto.bank_account_number) contractData.bank_account_number = approveDto.bank_account_number;
    if (approveDto.bank_account_type) contractData.bank_account_type = approveDto.bank_account_type;
    if (approveDto.bank_name) contractData.bank_name = approveDto.bank_name;
    if (approveDto.bank_account_holder) contractData.bank_account_holder = approveDto.bank_account_holder;

    let contract: any;
    try {
      contract = await this.contractsService.create(contractData, adminId);
    } catch (contractError: unknown) {
      // Revertir el estado de la solicitud al estado anterior
      await this.dataSource.query(
        `UPDATE rental_applications SET status = $1, updated_at = NOW() WHERE id = $2`,
        [application.status, id],
      );
      const reason =
        contractError instanceof Error
          ? contractError.message
          : 'Error al crear el contrato';
      throw new BadRequestException(
        `No se pudo aprobar la solicitud: ${reason}`,
      );
    }

    return {
      message: 'Solicitud aprobada y contrato creado con éxito',
      application: {
        id: updatedApplication.id,
        status: updatedApplication.status,
        property: application.property_title,
        applicant: application.applicant_name,
      },
      contract_generated: {
        id: contract.id,
        number: contract.contract_number,
        status: contract.status,
        monthly_rent: contract.monthly_rent,
        currency: contract.currency,
        deposit_amount: contract.deposit_amount,
        message:
          'Se ha creado un borrador de contrato automáticamente. El inquilino podrá firmarlo desde su portal.',
      },
    };
  }

  async create(createApplicationDto: CreateApplicationDto, userId: number) {
    // 1. Validar que la propiedad existe y está disponible
    const propertyResult = await this.dataSource.query<any[]>(
      'SELECT id, title, status FROM properties WHERE id = $1',
      [createApplicationDto.property_id],
    );

    if (propertyResult.length === 0) {
      throw new NotFoundException('La propiedad no existe');
    }

    const property = propertyResult[0] as PropertyResult;
    if (property.status !== 'DISPONIBLE') {
      throw new BadRequestException(
        'La propiedad no está disponible para alquiler',
      );
    }

    // 2. Crear la solicitud
    const result = await this.dataSource.query<ApplicationResult[]>(
      `INSERT INTO rental_applications 
       (property_id, applicant_id, status, personal_data, employment_data, rental_history, "references", documents, additional_notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       RETURNING *`,
      [
        createApplicationDto.property_id,
        userId,
        ApplicationStatus.PENDIENTE,
        JSON.stringify(createApplicationDto.personal_data),
        JSON.stringify(createApplicationDto.employment_data),
        JSON.stringify(createApplicationDto.rental_history),
        JSON.stringify(createApplicationDto.references),
        JSON.stringify(createApplicationDto.documents || []),
        createApplicationDto.additional_notes || null,
      ],
    );

    const application = result[0];

    // Notificar a los administradores
    try {
      const admins = await (
        this.usersService as unknown as {
          findAdmins: () => Promise<UserWithoutPassword[]>;
        }
      ).findAdmins();
      const adminIds = admins.map((admin) => Number(admin.id));

      if (adminIds.length > 0) {
        await this.notificationsService.notifyAdmins(
          adminIds,
          'application.created' as NotificationEventType,
          'Nueva solicitud de alquiler',
          `Se ha recibido una nueva solicitud para la propiedad: ${String(property.title)}`,
          {
            applicationId: Number(application.id),
            propertyId: Number(property.id),
          },
        );
      }
    } catch (e) {
      console.error('Error al notificar admins:', e);
    }

    return application;
  }

  async findAll(status?: ApplicationStatus) {
    let query = `
      SELECT ra.*, p.title as property_title, u.name as applicant_name, u.email as applicant_email
      FROM rental_applications ra
      JOIN properties p ON ra.property_id = p.id
      JOIN "user" u ON ra.applicant_id = u.id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (status) {
      query += ' AND ra.status = $1';
      params.push(status);
    }

    query += ' ORDER BY ra.created_at DESC';

    const result = await this.dataSource.query<ApplicationResult[]>(
      query,
      params,
    );
    return result;
  }

  async findOne(id: number) {
    const result = await this.dataSource.query<ApplicationResult[]>(
      `SELECT ra.*, p.title as property_title, u.name as applicant_name, u.email as applicant_email
       FROM rental_applications ra
       JOIN properties p ON ra.property_id = p.id
       JOIN "user" u ON ra.applicant_id = u.id
       WHERE ra.id = $1`,
      [id],
    );

    if (result.length === 0) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    return result[0];
  }

  async findByApplicant(userId: number) {
    const result = await this.dataSource.query<ApplicationResult[]>(
      `SELECT ra.*, p.title as property_title
       FROM rental_applications ra
       JOIN properties p ON ra.property_id = p.id
       WHERE ra.applicant_id = $1
       ORDER BY ra.created_at DESC`,
      [userId],
    );
    return result;
  }

  async updateStatus(id: number, updateDto: UpdateApplicationStatusDto) {
    const application = await this.findOne(id);

    const result = await this.dataSource.query<ApplicationResult[]>(
      `UPDATE rental_applications 
       SET status = $1, admin_feedback = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [updateDto.status, updateDto.admin_feedback || null, id],
    );

    const updatedApplication = result[0];

    // Notificar al solicitante sobre el cambio de estado
    try {
      const applicantId = Number(application.applicant_id);

      await this.notificationsService.createForUser(
        applicantId,
        'application.status.changed' as NotificationEventType,
        'Actualización de tu solicitud',
        `Tu solicitud para la propiedad ${String(application.property_title)} ha cambiado a: ${String(updateDto.status)}`,
        {
          applicationId: id,
          status: updateDto.status,
          feedback: updateDto.admin_feedback,
        },
      );
    } catch (e) {
      console.error('Error al notificar al inquilino:', e);
    }

    return updatedApplication;
  }
}
