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

export interface ContractResult {
  id: number;
  contract_number: string;
  tenant_id: number;
  property_id: number;
  start_date: string | Date;
  end_date: string | Date;
  duration_months?: number;
  monthly_rent: number;
  currency: string;
  payment_day: number;
  deposit_amount: number;
  payment_method?: string;
  late_fee_percentage?: number;
  grace_days?: number;
  included_services?: any; // JSON
  tenant_responsibilities?: string;
  owner_responsibilities?: string;
  prohibitions?: string;
  coexistence_rules?: string;
  renewal_terms?: string;
  termination_terms?: string;
  jurisdiction?: string;
  auto_renew?: boolean;
  renewal_notice_days?: number;
  auto_increase_percentage?: number;
  bank_account_number?: string;
  bank_account_type?: string;
  bank_name?: string;
  bank_account_holder?: string;
  status: ContractStatus;
  terms_conditions?: string;
  created_at: Date;
  updated_at: Date;
  property_title?: string;
  property_description?: string;
  property_status?: string;
  street_address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  tenant_name?: string;
  tenant_email?: string;
  tenant_phone?: string;
}

@Injectable()
export class ContractsService {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
    private pdfService: PdfService,
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
    if (adminUserId && createContractDto.tenant_id === adminUserId) {
      throw new BadRequestException(
        'No puedes crear un contrato para ti mismo. Los administradores no pueden ser inquilinos.',
      );
    }

    // 2. Validar que el inquilino existe y tenga rol INQUILINO
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

    // 4. Validar que la propiedad esté disponible
    const property = await this.dataSource.query<{ status: string }[]>(
      'SELECT status FROM properties WHERE id = $1',
      [createContractDto.property_id],
    );

    if (property.length === 0) {
      throw new NotFoundException(
        `Propiedad con ID ${createContractDto.property_id} no encontrada`,
      );
    }

    if (property[0].status !== 'DISPONIBLE') {
      throw new BadRequestException(
        'La propiedad no está disponible para un nuevo contrato',
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
        bank_account_number, bank_account_type, bank_name, bank_account_holder, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, NOW(), NOW())
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
      ],
    );

    const savedContract = insertResult[0];

    // 5. Registrar en historial
    await this.logHistory(
      savedContract.id,
      'status',
      null,
      ContractStatus.BORRADOR,
      0,
      'Creación de contrato',
    );

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
    const contract = (await this.findOne(id)) as Contract;

    // Obtener información del tenant (empresa) desde el schema public
    const tenantInfo = await this.dataSource.query<
      { company_name: string; logo_url?: string }[]
    >('SELECT company_name, logo_url FROM public.tenant WHERE slug = $1', [
      tenantSlug,
    ]);

    const pdfPath = await this.pdfService.generateContractPdf(contract, {
      name: tenantInfo[0]?.company_name || 'Empresa Administradora',
      address: 'Dirección de la administración',
    });

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

  async renew(id: number, userId: number = 0) {
    const oldContract = await this.findOne(id);

    if (
      oldContract.status !== ContractStatus.ACTIVO &&
      oldContract.status !== ContractStatus.POR_VENCER
    ) {
      throw new BadRequestException(
        'Solo se pueden renovar contratos activos o por vencer',
      );
    }

    // Calcular nuevas fechas
    const newStartDate = new Date(oldContract.end_date as string);
    newStartDate.setDate(newStartDate.getDate() + 1);

    const newEndDate = new Date(newStartDate);
    newEndDate.setMonth(
      newEndDate.getMonth() + ((oldContract.duration_months as number) || 12),
    );

    // Aplicar aumento si existe
    const newRent =
      oldContract.monthly_rent *
      (1 + ((oldContract.auto_increase_percentage as number) || 0) / 100);

    const newContractNumber = await this.generateContractNumber();

    // Insertar nuevo contrato usando SQL directo
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
        oldContract.duration_months,
        newRent,
        oldContract.currency,
        oldContract.payment_day,
        oldContract.deposit_amount,
        oldContract.payment_method,
        oldContract.late_fee_percentage,
        oldContract.grace_days,
        oldContract.included_services
          ? JSON.stringify(oldContract.included_services)
          : null,
        oldContract.tenant_responsibilities,
        oldContract.owner_responsibilities,
        oldContract.prohibitions,
        oldContract.coexistence_rules,
        oldContract.renewal_terms,
        oldContract.termination_terms,
        oldContract.jurisdiction,
        oldContract.auto_renew,
        oldContract.renewal_notice_days,
        oldContract.auto_increase_percentage,
        oldContract.id,
        oldContract.bank_account_number,
        oldContract.bank_account_type,
        oldContract.bank_name,
        oldContract.bank_account_holder,
        ContractStatus.BORRADOR,
      ],
    );

    const savedContract = insertResult[0];

    // Actualizar estado del anterior
    await this.dataSource.query(
      'UPDATE contracts SET status = $1 WHERE id = $2',
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

    return savedContract;
  }
}
