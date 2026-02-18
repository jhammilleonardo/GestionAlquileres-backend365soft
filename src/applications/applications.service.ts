import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
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
    updateDto: UpdateApplicationStatusDto,
    adminId: number,
  ) {
    // 1. Obtener la solicitud con datos de la propiedad
    const application = await this.findOne(id);

    if (application.status === ApplicationStatus.APROBADA) {
      throw new BadRequestException('Esta solicitud ya ha sido aprobada');
    }

    // 2. Actualizar estado de la solicitud a APROBADA
    const updatedApplication = await this.updateStatus(id, {
      status: ApplicationStatus.APROBADA,
      admin_feedback:
        updateDto.admin_feedback ||
        `Solicitud aprobada para la propiedad "${String(application.property_title)}".`,
    });

    // 3. Crear el contrato usando LOS DATOS DE LA SOLICITUD
    const startDate = new Date();
    const endDate = new Date();
    endDate.setFullYear(startDate.getFullYear() + 1);

    try {
      const contractData = {
        property_id: Number(application.property_id),
        tenant_id: Number(application.applicant_id),
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        monthly_rent: 0,
        currency: 'BOB',
        payment_day: 5,
        deposit_amount: 0,
      };

      const contract = await this.contractsService.create(
        contractData,
        adminId,
      );

      return {
        message: 'Solicitud aprobada con éxito',
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
          message:
            'Se ha creado un borrador de contrato automáticamente. Favor revisar y activar.',
        },
      };
    } catch (error: any) {
      return {
        message: 'Solicitud aprobada, pero el contrato no se pudo auto-generar',
        application: updatedApplication,
        reason: (error as Error)?.message || 'Error de validación en contratos',
      };
    }
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
