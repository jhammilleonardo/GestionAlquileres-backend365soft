import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Contract } from './entities/contract.entity';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { ContractStatus } from './enums/contract-status.enum';
import { PdfService } from './pdf.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { LifecycleNotificationsService } from '../lifecycle-notifications/lifecycle-notifications.service';
import { ContractTemplatesService } from '../contract-templates/contract-templates.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { RenewContractDto } from './dto/renew-contract.dto';

export interface ContractResult {
  id: number;
  contract_number: string;
  tenant_id: number;
  property_id: number;
  start_date: string | Date;
  end_date: string | Date;
  duration_months?: number | null;
  monthly_rent: number;
  currency: string;
  payment_day: number;
  deposit_amount: number;
  payment_method?: string | null;
  late_fee_percentage?: number | null;
  grace_days?: number | null;
  unit_id?: number | null;
  included_services?: string[] | string | null;
  tenant_responsibilities?: string | null;
  owner_responsibilities?: string | null;
  prohibitions?: string | null;
  coexistence_rules?: string | null;
  renewal_terms?: string | null;
  termination_terms?: string | null;
  jurisdiction?: string | null;
  auto_renew?: boolean | null;
  renewal_notice_days?: number | null;
  auto_increase_percentage?: number | null;
  bank_account_number?: string | null;
  bank_account_type?: string | null;
  bank_name?: string | null;
  bank_account_holder?: string | null;
  status: ContractStatus;
  terms_conditions?: string | null;
  created_at: Date;
  updated_at: Date;
  // Campos de JOIN — SQL retorna null cuando no hay coincidencia
  property_title?: string | null;
  property_description?: string | null;
  property_status?: string | null;
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  country?: string | null;
  tenant_name?: string | null;
  tenant_email?: string | null;
  tenant_phone?: string | null;
}

@Injectable()
export class ContractsService {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
    private pdfService: PdfService,
    private notificationsService: NotificationsService,
    private lifecycleNotificationsService: LifecycleNotificationsService,
    private contractTemplatesService: ContractTemplatesService,
    private auditLogsService: AuditLogsService,
  ) {}

  private async generateContractNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `CTR-${year}-`;

    const lastContract = await this.dataSource.query<
      { contract_number: string }[]
    >(
      `SELECT contract_number FROM contracts
       WHERE contract_number LIKE $1
       ORDER BY contract_number DESC LIMIT 1`,
      [`${prefix}%`],
    );

    let nextNumber = 1;
    if (lastContract.length > 0) {
      const parts = lastContract[0].contract_number.split('-');
      nextNumber = parseInt(parts[2], 10) + 1;
    }

    return `${prefix}${nextNumber.toString().padStart(4, '0')}`;
  }

  async create(createContractDto: CreateContractDto, adminUserId?: number) {
    // 1. Validar que el admin no se esté creando un contrato a sí mismo
    // Esta validación NO aplica cuando el contrato viene de una solicitud aprobada,
    // ya que el solicitante es siempre un inquilino distinto al admin que aprueba.
    if (
      !createContractDto.application_id &&
      adminUserId &&
      createContractDto.tenant_id === adminUserId
    ) {
      throw new BadRequestException(
        'No puedes crear un contrato para ti mismo. Los administradores no pueden ser inquilinos.',
      );
    }

    // 2. Validar que el inquilino existe y tenga rol INQUILINO
    // Si viene de una solicitud aprobada, el usuario ya fue validado como INQUILINO
    // al registrarse, por lo que omitimos la verificación de rol para evitar
    // problemas con el connection pool de TypeORM y el schema multi-tenant.
    if (!createContractDto.application_id) {
      const tenant = await this.dataSource.query<{ role: string }[]>(
        'SELECT role FROM "user" WHERE id = $1',
        [createContractDto.tenant_id],
      );

      if (tenant.length === 0) {
        throw new NotFoundException(
          `Usuario con ID ${createContractDto.tenant_id} no encontrado`,
        );
      }

      if (tenant[0].role !== 'INQUILINO') {
        throw new BadRequestException(
          'El contrato solo puede ser asignado a usuarios con rol INQUILINO',
        );
      }
    }

    // 2.1. Si NO viene de una solicitud, validar que el inquilino tenga una solicitud aprobada
    if (!createContractDto.application_id) {
      const approvedApplication = await this.dataSource.query<{ id: number }[]>(
        `SELECT id FROM rental_applications
         WHERE applicant_id = $1 AND status = 'APROBADA'
         ORDER BY created_at DESC
         LIMIT 1`,
        [createContractDto.tenant_id],
      );

      if (approvedApplication.length === 0) {
        throw new BadRequestException(
          'No se puede crear un contrato manual para este inquilino. ' +
            'El inquilino debe tener al menos una solicitud de alquiler aprobada antes de poder crear un contrato. ' +
            'Utilice el flujo de solicitudes para aprobar al inquilino primero.',
        );
      }
    } else {
      // Si viene de una solicitud, validar que la solicitud existe y pertenece al inquilino
      const application = await this.dataSource.query<
        { id: number; applicant_id: number }[]
      >('SELECT id, applicant_id FROM rental_applications WHERE id = $1', [
        createContractDto.application_id,
      ]);

      if (application.length === 0) {
        throw new NotFoundException(
          `La solicitud con ID ${createContractDto.application_id} no existe`,
        );
      }

      if (application[0].applicant_id !== createContractDto.tenant_id) {
        throw new BadRequestException(
          'La solicitud no pertenece al inquilino especificado',
        );
      }
    }

    // 3. Validar que el inquilino no tenga ya un contrato activo
    const activeContract = await this.dataSource.query<{ id: number }[]>(
      'SELECT id FROM contracts WHERE tenant_id = $1 AND status = $2',
      [createContractDto.tenant_id, ContractStatus.ACTIVO],
    );

    if (activeContract.length > 0) {
      throw new BadRequestException(
        `El inquilino ya tiene un contrato activo (ID: ${activeContract[0].id}). No se puede crear otro contrato mientras exista uno activo.`,
      );
    }

    // 4. Validar que la propiedad exista (si viene de una solicitud aprobada
    // ya se validó el estado al crear la solicitud, no se vuelve a bloquear)
    const property = await this.dataSource.query<{ status: string }[]>(
      'SELECT status FROM properties WHERE id = $1',
      [createContractDto.property_id],
    );

    if (property.length === 0) {
      throw new NotFoundException(
        `Propiedad con ID ${createContractDto.property_id} no encontrada`,
      );
    }

    // Solo bloquear si la propiedad está en estado INACTIVO o MANTENIMIENTO
    // Si viene de una solicitud aprobada (application_id), saltear la validación de estado
    if (
      !createContractDto.application_id &&
      !['DISPONIBLE', 'RESERVADO'].includes(property[0].status)
    ) {
      throw new BadRequestException(
        `La propiedad no está disponible para un nuevo contrato (estado actual: ${property[0].status})`,
      );
    }

    // 2. Generar número de contrato
    const contractNumber = await this.generateContractNumber();

    // 3. Calcular duración en meses
    const startDate = new Date(createContractDto.start_date);
    const endDate = new Date(createContractDto.end_date);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const durationMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30.44));

    // 4. Insertar usando SQL directo (respeta search_path del tenant)
    const insertResult = await this.dataSource.query<Contract[]>(
      `INSERT INTO contracts
       (contract_number, tenant_id, property_id, status, start_date, end_date, duration_months,
        key_delivery_date, monthly_rent, currency, payment_day, deposit_amount, payment_method,
        late_fee_percentage, grace_days, included_services, tenant_responsibilities,
        owner_responsibilities, prohibitions, coexistence_rules, renewal_terms, termination_terms,
        jurisdiction, auto_renew, renewal_notice_days, auto_increase_percentage,
        bank_account_number, bank_account_type, bank_name, bank_account_holder, application_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, NOW(), NOW())
       RETURNING *`,
      [
        contractNumber,
        createContractDto.tenant_id,
        createContractDto.property_id,
        ContractStatus.BORRADOR,
        createContractDto.start_date,
        createContractDto.end_date,
        durationMonths,
        createContractDto.key_delivery_date || null,
        createContractDto.monthly_rent,
        createContractDto.currency || 'BOB',
        createContractDto.payment_day || 5,
        createContractDto.deposit_amount || 0,
        createContractDto.payment_method || null,
        createContractDto.late_fee_percentage || 0,
        createContractDto.grace_days || 0,
        createContractDto.included_services
          ? JSON.stringify(createContractDto.included_services)
          : null,
        createContractDto.tenant_responsibilities || null,
        createContractDto.owner_responsibilities || null,
        createContractDto.prohibitions || null,
        createContractDto.coexistence_rules || null,
        createContractDto.renewal_terms || null,
        createContractDto.termination_terms || null,
        createContractDto.jurisdiction || 'Bolivia',
        createContractDto.auto_renew || false,
        createContractDto.renewal_notice_days || 30,
        createContractDto.auto_increase_percentage || 0,
        createContractDto.bank_account_number || null,
        createContractDto.bank_account_type || null,
        createContractDto.bank_name || null,
        createContractDto.bank_account_holder || null,
        createContractDto.application_id || null,
      ],
    );

    const savedContract = insertResult[0];

    // 5. Actualizar el estado de la propiedad a OCUPADO
    await this.dataSource.query(
      `UPDATE properties SET status = 'OCUPADO', updated_at = NOW() WHERE id = $1`,
      [createContractDto.property_id],
    );

    // 6. Registrar en historial
    await this.logHistory(
      savedContract.id,
      'status',
      null,
      ContractStatus.BORRADOR,
      0,
      'Creación de contrato',
    );

    // 7. Audit log
    await this.auditLogsService.log({
      userId: adminUserId ?? 0,
      action: AuditAction.CREATED,
      entityType: 'contract',
      entityId: savedContract.id,
      newValues: {
        contract_number: contractNumber,
        tenant_id: savedContract.tenant_id,
        property_id: savedContract.property_id,
        status: ContractStatus.BORRADOR,
      },
    });

    // 8. Notificaciones: al inquilino y a los admins
    try {
      const tenantId: number = createContractDto.tenant_id;
      await this.notificationsService.createForUser(
        tenantId,
        NotificationEventType.CONTRACT_CREATED,
        'Nuevo contrato disponible',
        `Se ha creado el contrato ${contractNumber}. Por favor revísalo y fírmalo.`,
        { contract_id: savedContract.id, contract_number: contractNumber },
      );

      const admins = await this.dataSource.query<{ id: number }[]>(
        `SELECT id FROM "user" WHERE role = 'ADMIN' LIMIT 5`,
      );
      const adminIds = admins.map((a) => a.id);
      if (adminIds.length > 0) {
        await this.notificationsService.notifyAdmins(
          adminIds,
          NotificationEventType.CONTRACT_CREATED,
          'Nuevo contrato creado',
          `Se ha creado el contrato ${contractNumber} para el inquilino ID ${tenantId}`,
          { contract_id: savedContract.id, contract_number: contractNumber },
        );
      }
    } catch {
      // No propagar errores de notificación
    }

    return savedContract;
  }

  async findAll(filters: {
    status?: ContractStatus;
    tenant_id?: number;
    property_id?: number;
  }) {
    // Construir query dinámicamente
    let query = 'SELECT c.*, ';
    query += 'p.title as property_title, p.status as property_status, ';
    query += 'pa.street_address, pa.city, pa.country, ';
    query +=
      'u.name as tenant_name, u.email as tenant_email, u.phone as tenant_phone ';
    query += 'FROM contracts c ';
    query += 'LEFT JOIN properties p ON c.property_id = p.id ';
    query +=
      "LEFT JOIN property_addresses pa ON c.property_id = pa.property_id AND pa.address_type = 'address_1' ";
    query += 'LEFT JOIN "user" u ON c.tenant_id = u.id ';
    query += 'WHERE 1=1';

    const params: any[] = [];
    let paramCount = 0;

    if (filters.status) {
      paramCount++;
      query += ` AND c.status = $${paramCount}`;
      params.push(filters.status);
    }

    if (filters.tenant_id) {
      paramCount++;
      query += ` AND c.tenant_id = $${paramCount}`;
      params.push(filters.tenant_id);
    }

    if (filters.property_id) {
      paramCount++;
      query += ` AND c.property_id = $${paramCount}`;
      params.push(filters.property_id);
    }

    query += ' ORDER BY c.created_at DESC';

    return await this.dataSource.query<ContractResult[]>(query, params);
  }

  async findOne(id: number) {
    const result = await this.dataSource.query<ContractResult[]>(
      `SELECT c.*,
              p.title as property_title, p.description as property_description,
              p.status as property_status,
              pa.street_address, pa.city, pa.state, pa.zip_code, pa.country,
              u.name as tenant_name, u.email as tenant_email, u.phone as tenant_phone
       FROM contracts c
       LEFT JOIN properties p ON c.property_id = p.id
       LEFT JOIN property_addresses pa ON c.property_id = pa.property_id AND pa.address_type = 'address_1'
       LEFT JOIN "user" u ON c.tenant_id = u.id
       WHERE c.id = $1`,
      [id],
    );

    if (result.length === 0) {
      throw new NotFoundException(`Contrato con ID ${id} no encontrado`);
    }

    return result[0];
  }

  async update(
    id: number,
    updateContractDto: UpdateContractDto,
    userId: number = 0,
  ) {
    const contract = await this.findOne(id);
    const oldStatus = contract.status;

    // Construir query de actualización dinámicamente
    const updates: string[] = [];
    const values: (string | number | boolean | null)[] = [];
    let paramCount = 0;

    const fieldMapping: Record<string, string> = {
      monthly_rent: 'monthly_rent',
      currency: 'currency',
      payment_day: 'payment_day',
      deposit_amount: 'deposit_amount',
      payment_method: 'payment_method',
      late_fee_percentage: 'late_fee_percentage',
      grace_days: 'grace_days',
      tenant_responsibilities: 'tenant_responsibilities',
      owner_responsibilities: 'owner_responsibilities',
      prohibitions: 'prohibitions',
      coexistence_rules: 'coexistence_rules',
      renewal_terms: 'renewal_terms',
      termination_terms: 'termination_terms',
      jurisdiction: 'jurisdiction',
      auto_renew: 'auto_renew',
      renewal_notice_days: 'renewal_notice_days',
      auto_increase_percentage: 'auto_increase_percentage',
      bank_account_number: 'bank_account_number',
      bank_account_type: 'bank_account_type',
      bank_name: 'bank_name',
      bank_account_holder: 'bank_account_holder',
      status: 'status',
      included_services: 'included_services',
    };

    for (const key of Object.keys(updateContractDto)) {
      const val = updateContractDto[key as keyof UpdateContractDto];
      if (val !== undefined && fieldMapping[key]) {
        paramCount++;
        const field = fieldMapping[key];

        if (key === 'included_services') {
          updates.push(`${field} = $${paramCount}`);
          values.push(JSON.stringify(val));
        } else if (key === 'auto_renew') {
          updates.push(`${field} = $${paramCount}`);
          values.push(!!val);
        } else {
          updates.push(`${field} = $${paramCount}`);
          values.push(val as string | number | boolean | null);
        }
      }
    }

    if (updates.length > 0) {
      paramCount++;
      updates.push(`updated_at = NOW()`);

      const query = `UPDATE contracts SET ${updates.join(', ')} WHERE id = $${paramCount}`;
      values.push(id);

      await this.dataSource.query(query, values);
    }

    // Recargar para obtener el contrato actualizado
    const updatedContract = await this.findOne(id);

    if (updateContractDto.status && updateContractDto.status !== oldStatus) {
      await this.logHistory(
        id,
        'status',
        oldStatus,
        updateContractDto.status,
        userId,
        updateContractDto.update_reason || 'Cambio de estado',
      );

      // Si pasa a ACTIVO, marcar la propiedad como OCUPADA
      if (updateContractDto.status === ContractStatus.ACTIVO) {
        await this.dataSource.query(
          "UPDATE properties SET status = 'OCUPADO' WHERE id = $1",
          [contract.property_id],
        );
      }

      // Si pasa a FINALIZADO, marcar como DISPONIBLE
      if (
        [
          ContractStatus.FINALIZADO,
          ContractStatus.VENCIDO,
          ContractStatus.CANCELADO,
        ].includes(updateContractDto.status)
      ) {
        await this.dataSource.query(
          "UPDATE properties SET status = 'DISPONIBLE' WHERE id = $1",
          [contract.property_id],
        );
      }

      // Notificar al inquilino sobre el cambio de estado relevante
      try {
        if (updateContractDto.status === ContractStatus.ACTIVO) {
          await this.lifecycleNotificationsService.onContractActivated(id);
        } else {
          const statusNotifMap: Partial<
            Record<
              ContractStatus,
              { type: NotificationEventType; title: string; msg: string }
            >
          > = {
            [ContractStatus.FINALIZADO]: {
              type: NotificationEventType.CONTRACT_EXPIRING,
              title: 'Contrato finalizado',
              msg: 'Tu contrato ha finalizado',
            },
            [ContractStatus.CANCELADO]: {
              type: NotificationEventType.CONTRACT_EXPIRING,
              title: 'Contrato cancelado',
              msg: 'Tu contrato ha sido cancelado',
            },
          };
          const notif = statusNotifMap[updateContractDto.status];
          if (notif) {
            await this.notificationsService.createForUser(
              contract.tenant_id,
              notif.type,
              notif.title,
              notif.msg,
              { contract_id: id, new_status: updateContractDto.status },
            );
          }
        }
      } catch {
        // No propagar errores de notificación
      }

      await this.auditLogsService.log({
        userId,
        action: AuditAction.STATUS_CHANGED,
        entityType: 'contract',
        entityId: id,
        oldValues: { status: oldStatus },
        newValues: {
          status: updateContractDto.status,
          reason: updateContractDto.update_reason,
        },
      });
    }

    return updatedContract;
  }

  async signContract(id: number, userId: number, ip: string) {
    const contract = await this.findOne(id);

    if (contract.tenant_id !== userId) {
      throw new BadRequestException(
        'No tienes permiso para firmar este contrato',
      );
    }

    if (
      contract.status !== ContractStatus.BORRADOR &&
      contract.status !== ContractStatus.PENDIENTE
    ) {
      throw new BadRequestException(
        'El contrato no está en un estado que permita firma',
      );
    }

    const oldStatus = contract.status;

    await this.dataSource.query(
      `UPDATE contracts
       SET status = $1,
           tenant_signature_date = NOW(),
           activation_date = NOW(),
           signed_ip = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [ContractStatus.ACTIVO, ip, id],
    );

    await this.logHistory(
      id,
      'status',
      oldStatus,
      ContractStatus.ACTIVO,
      userId,
      'Firma digital del inquilino (Aceptación de términos)',
    );

    // Marcar propiedad como ocupada
    await this.dataSource.query(
      "UPDATE properties SET status = 'OCUPADO' WHERE id = $1",
      [contract.property_id],
    );

    // Notificar a los admins que el contrato fue firmado
    try {
      const admins = await this.dataSource.query<{ id: number }[]>(
        `SELECT id FROM "user" WHERE role = 'ADMIN' LIMIT 5`,
      );
      const adminIds = admins.map((a) => a.id);
      if (adminIds.length > 0) {
        await this.notificationsService.notifyAdmins(
          adminIds,
          NotificationEventType.CONTRACT_SIGNED,
          'Contrato firmado',
          `El inquilino ID ${userId} ha firmado el contrato ID ${id}`,
          { contract_id: id },
        );
      }
    } catch {
      // No propagar errores de notificación
    }

    // Enviar bienvenida al inquilino con datos del portal
    try {
      await this.lifecycleNotificationsService.onContractActivated(id);
    } catch {
      // No propagar errores de notificación
    }

    await this.auditLogsService.log({
      userId,
      action: AuditAction.SIGNED,
      entityType: 'contract',
      entityId: id,
      oldValues: { status: oldStatus },
      newValues: { status: ContractStatus.ACTIVO },
      ipAddress: ip,
    });

    return await this.findOne(id);
  }

  async getMetrics() {
    const activeContracts = await this.dataSource.query<{ total: string }[]>(
      "SELECT COUNT(*) as total FROM contracts WHERE status = 'ACTIVO'",
    );

    const totalContracts = await this.dataSource.query<{ total: string }[]>(
      'SELECT COUNT(*) as total FROM contracts',
    );

    const draftContracts = await this.dataSource.query<{ total: string }[]>(
      "SELECT COUNT(*) as total FROM contracts WHERE status = 'BORRADOR'",
    );

    const expiringSoon = await this.dataSource.query<{ total: string }[]>(
      `SELECT COUNT(*) as total FROM contracts
       WHERE status = 'ACTIVO'
       AND end_date <= CURRENT_DATE + INTERVAL '30 days'`,
    );

    const monthlyRevenue = await this.dataSource.query<{ total: string }[]>(
      "SELECT SUM(monthly_rent) as total FROM contracts WHERE status = 'ACTIVO'",
    );

    const activeCount = parseInt(activeContracts[0].total || '1', 10) || 1;
    const revenue = parseFloat(monthlyRevenue[0].total || '0');

    return {
      total_contracts: parseInt(totalContracts[0].total, 10),
      active_contracts: parseInt(activeContracts[0].total, 10),
      draft_contracts: parseInt(draftContracts[0].total, 10),
      contracts_expiring_soon: parseInt(expiringSoon[0].total, 10),
      monthly_revenue: revenue,
      avg_rent: activeCount > 0 ? revenue / activeCount : 0,
    };
  }

  private async logHistory(
    contractId: number,
    field: string,
    oldValue: unknown,
    newValue: unknown,
    userId: number,
    reason?: string,
  ) {
    await this.dataSource.query(
      `INSERT INTO contract_history
       (contract_id, field_modified, old_value, new_value, modified_by, reason, change_date)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        contractId,
        field,
        oldValue || null,
        newValue || null,
        userId,
        reason || null,
      ],
    );
  }

  async generatePdf(id: number, tenantSlug: string, baseUrl: string = '') {
    const contract = await this.findOne(id);

    // Información del tenant (empresa arrendadora) desde schema public
    const tenantInfo = await this.dataSource.query<
      { company_name: string; logo_url?: string }[]
    >('SELECT company_name, logo_url FROM public.tenant WHERE slug = $1', [
      tenantSlug,
    ]);
    const landlordName =
      tenantInfo[0]?.company_name ?? 'Empresa Administradora';

    // Detectar idioma del tenant para seleccionar plantilla
    const configRows = await this.dataSource.query<{ language: string }[]>(
      'SELECT language FROM tenant_config LIMIT 1',
    );
    const language = configRows[0]?.language ?? 'es';

    // Intentar usar plantilla configurable; si no existe, usar generador hardcodeado
    const template =
      await this.contractTemplatesService.findActiveForLanguage(language);

    let pdfPath: string;

    if (template) {
      const fullAddress = [
        contract.street_address,
        contract.city,
        contract.state,
        contract.country,
      ]
        .filter(Boolean)
        .join(', ');

      // Obtener número de unidad si el contrato tiene unit_id
      let unitNumber = '';
      const contractUnitId = (contract as ContractResult & { unit_id?: number })
        .unit_id;
      if (contractUnitId) {
        const unitRows = await this.dataSource.query<{ unit_number: string }[]>(
          'SELECT unit_number FROM units WHERE id = $1',
          [contractUnitId],
        );
        unitNumber = unitRows[0]?.unit_number ?? '';
      }

      const vars = {
        contract_number: contract.contract_number ?? '',
        tenant_name: contract.tenant_name ?? '',
        tenant_email: contract.tenant_email ?? '',
        tenant_phone:
          (contract as ContractResult & { tenant_phone?: string })
            .tenant_phone ?? '',
        property_title: contract.property_title ?? '',
        property_address: fullAddress || 'No especificada',
        unit_number: unitNumber,
        rent_amount: String(contract.monthly_rent ?? 0),
        currency: contract.currency ?? '',
        start_date: new Date(contract.start_date).toLocaleDateString(),
        end_date: new Date(contract.end_date).toLocaleDateString(),
        payment_day: String(contract.payment_day ?? 5),
        deposit_amount: String(contract.deposit_amount ?? 0),
        late_fee_percentage: String(contract.late_fee_percentage ?? 0),
        grace_days: String(contract.grace_days ?? 0),
        jurisdiction: contract.jurisdiction ?? '',
        duration_months: String(contract.duration_months ?? 12),
        landlord_name: landlordName,
        issue_date: new Date().toLocaleDateString(),
      };

      const populated = this.contractTemplatesService.substituteVariables(
        template.content,
        vars,
      );
      pdfPath = await this.pdfService.generateContractPdfFromTemplate(
        contract.contract_number,
        populated,
      );
    } else {
      pdfPath = await this.pdfService.generateContractPdf(contract, {
        name: landlordName,
        address: 'Dirección de la administración',
      });
    }

    // Actualizar URL del PDF con ruta relativa para acceso estático
    const relativePath = pdfPath.split('uploads')[1].replace(/\\/g, '/');
    const pdfUrl = `/uploads${relativePath}`;
    const fullPdfUrl = `${baseUrl}${pdfUrl}`;

    await this.dataSource.query(
      'UPDATE contracts SET pdf_url = $1 WHERE id = $2',
      [pdfUrl, id],
    );

    return {
      path: pdfPath,
      url: pdfUrl,
      fullUrl: fullPdfUrl,
    };
  }

  async renew(
    id: number,
    dto: RenewContractDto = {},
    userId: number = 0,
  ): Promise<ContractResult> {
    const oldContract = await this.findOne(id);

    if (
      oldContract.status !== ContractStatus.ACTIVO &&
      oldContract.status !== ContractStatus.POR_VENCER
    ) {
      throw new BadRequestException(
        'Solo se pueden renovar contratos activos o por vencer',
      );
    }

    const baseStartDate = new Date(oldContract.end_date as string);
    baseStartDate.setDate(baseStartDate.getDate() + 1);
    const newStartDate = dto.start_date
      ? new Date(dto.start_date)
      : baseStartDate;

    const durationMonths =
      dto.duration_months ?? (oldContract.duration_months as number) ?? 12;

    const newEndDate = new Date(newStartDate);
    newEndDate.setMonth(newEndDate.getMonth() + durationMonths);

    const autoIncrease =
      dto.auto_increase_percentage ??
      (oldContract.auto_increase_percentage as number) ??
      0;
    const newRent =
      dto.monthly_rent ?? oldContract.monthly_rent * (1 + autoIncrease / 100);

    const newContractNumber = await this.generateContractNumber();

    const insertResult = await this.dataSource.query<ContractResult[]>(
      `INSERT INTO contracts
       (tenant_id, property_id, contract_number, start_date, end_date, duration_months,
        monthly_rent, currency, payment_day, deposit_amount, payment_method,
        late_fee_percentage, grace_days, included_services, tenant_responsibilities,
        owner_responsibilities, prohibitions, coexistence_rules, renewal_terms, termination_terms,
        jurisdiction, auto_renew, renewal_notice_days, auto_increase_percentage,
        previous_contract_id, bank_account_number, bank_account_type, bank_name, bank_account_holder,
        status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, NOW(), NOW())
       RETURNING *`,
      [
        oldContract.tenant_id,
        oldContract.property_id,
        newContractNumber,
        newStartDate.toISOString().split('T')[0],
        newEndDate.toISOString().split('T')[0],
        durationMonths,
        newRent,
        dto.currency ?? oldContract.currency,
        dto.payment_day ?? oldContract.payment_day,
        dto.deposit_amount ?? oldContract.deposit_amount,
        dto.payment_method ?? oldContract.payment_method,
        dto.late_fee_percentage ?? oldContract.late_fee_percentage,
        dto.grace_days ?? oldContract.grace_days,
        (dto.included_services ?? oldContract.included_services)
          ? JSON.stringify(
              dto.included_services ?? oldContract.included_services,
            )
          : null,
        dto.tenant_responsibilities ?? oldContract.tenant_responsibilities,
        dto.owner_responsibilities ?? oldContract.owner_responsibilities,
        dto.prohibitions ?? oldContract.prohibitions,
        dto.coexistence_rules ?? oldContract.coexistence_rules,
        dto.renewal_terms ?? oldContract.renewal_terms,
        dto.termination_terms ?? oldContract.termination_terms,
        dto.jurisdiction ?? oldContract.jurisdiction,
        dto.auto_renew ?? oldContract.auto_renew,
        dto.renewal_notice_days ?? oldContract.renewal_notice_days,
        autoIncrease,
        oldContract.id,
        oldContract.bank_account_number,
        oldContract.bank_account_type,
        oldContract.bank_name,
        oldContract.bank_account_holder,
        ContractStatus.BORRADOR,
      ],
    );

    const savedContract = insertResult[0];

    await this.dataSource.query(
      'UPDATE contracts SET status = $1, updated_at = NOW() WHERE id = $2',
      [ContractStatus.RENOVADO, id],
    );

    await this.logHistory(
      id,
      'status',
      oldContract.status,
      ContractStatus.RENOVADO,
      userId,
      'Contrato renovado',
    );
    await this.logHistory(
      savedContract.id,
      'status',
      null,
      ContractStatus.BORRADOR,
      userId,
      'Creado por renovación',
    );

    await this.auditLogsService.log({
      userId,
      action: AuditAction.RENEWED,
      entityType: 'contract',
      entityId: id,
      oldValues: { status: oldContract.status },
      newValues: {
        newContractId: savedContract.id,
        newContractNumber,
        status: ContractStatus.RENOVADO,
      },
    });

    return savedContract;
  }

  async getContractHistory(id: number): Promise<ContractResult[]> {
    const contract = await this.findOne(id);

    const baseQuery = `
      SELECT c.*,
             p.title as property_title, p.status as property_status,
             pa.street_address, pa.city, pa.country,
             u.name as tenant_name, u.email as tenant_email, u.phone as tenant_phone
      FROM contracts c
      LEFT JOIN properties p ON c.property_id = p.id
      LEFT JOIN property_addresses pa
        ON c.property_id = pa.property_id AND pa.address_type = 'address_1'
      LEFT JOIN "user" u ON c.tenant_id = u.id
    `;

    if (contract.unit_id) {
      return this.dataSource.query<ContractResult[]>(
        `${baseQuery} WHERE c.unit_id = $1 ORDER BY c.start_date ASC`,
        [contract.unit_id],
      );
    }

    return this.dataSource.query<ContractResult[]>(
      `${baseQuery} WHERE c.property_id = $1 ORDER BY c.start_date ASC`,
      [contract.property_id],
    );
  }
}
