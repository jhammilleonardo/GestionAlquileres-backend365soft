import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CreateContractTemplateDto } from './dto/create-contract-template.dto';
import { UpdateContractTemplateDto } from './dto/update-contract-template.dto';

export interface TemplateVariables {
  contract_number: string;
  tenant_name: string;
  tenant_email: string;
  tenant_phone: string;
  property_title: string;
  property_address: string;
  unit_number: string;
  rent_amount: string;
  currency: string;
  start_date: string;
  end_date: string;
  payment_day: string;
  deposit_amount: string;
  late_fee_percentage: string;
  grace_days: string;
  jurisdiction: string;
  duration_months: string;
  landlord_name: string;
  issue_date: string;
}

export interface ContractTemplateRow {
  id: number;
  language: string;
  name: string;
  content: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class ContractTemplatesService {
  private readonly logger = new Logger(ContractTemplatesService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateContractTemplateDto): Promise<ContractTemplateRow> {
    const isActive = dto.is_active ?? true;
    const rows = await this.dataSource.query<ContractTemplateRow[]>(
      `INSERT INTO contract_templates (language, name, content, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING *`,
      [dto.language, dto.name, dto.content, isActive],
    );
    this.logger.log(`Plantilla creada: ${rows[0].name} (${rows[0].language})`);
    return rows[0];
  }

  async findAll(language?: string): Promise<ContractTemplateRow[]> {
    if (language) {
      return this.dataSource.query<ContractTemplateRow[]>(
        `SELECT * FROM contract_templates WHERE language = $1 ORDER BY created_at DESC`,
        [language],
      );
    }
    return this.dataSource.query<ContractTemplateRow[]>(
      `SELECT * FROM contract_templates ORDER BY created_at DESC`,
    );
  }

  async findOne(id: number): Promise<ContractTemplateRow> {
    const rows = await this.dataSource.query<ContractTemplateRow[]>(
      `SELECT * FROM contract_templates WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) {
      throw new NotFoundException(`Plantilla con ID ${id} no encontrada`);
    }
    return rows[0];
  }

  async findActiveForLanguage(
    language: string,
  ): Promise<ContractTemplateRow | null> {
    const rows = await this.dataSource.query<ContractTemplateRow[]>(
      `SELECT * FROM contract_templates
       WHERE language = $1 AND is_active = true
       ORDER BY created_at DESC
       LIMIT 1`,
      [language],
    );
    return rows[0] ?? null;
  }

  async update(
    id: number,
    dto: UpdateContractTemplateDto,
  ): Promise<ContractTemplateRow> {
    await this.findOne(id);

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (dto.language !== undefined) {
      fields.push(`language = $${idx++}`);
      values.push(dto.language);
    }
    if (dto.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(dto.name);
    }
    if (dto.content !== undefined) {
      fields.push(`content = $${idx++}`);
      values.push(dto.content);
    }
    if (dto.is_active !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(dto.is_active);
    }

    if (fields.length === 0) {
      throw new BadRequestException('No hay campos para actualizar');
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const rows = await this.dataSource.query<ContractTemplateRow[]>(
      `UPDATE contract_templates SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    return rows[0];
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.dataSource.query(
      `DELETE FROM contract_templates WHERE id = $1`,
      [id],
    );
  }

  /**
   * Sustituye todas las variables {{nombre}} en el contenido de la plantilla.
   * Las variables sin valor en el mapa se dejan como cadena vacía.
   */
  substituteVariables(content: string, vars: TemplateVariables): string {
    return content.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
      const value = vars[key as keyof TemplateVariables];
      // Variable vacía (cadena vacía) → se sustituye. Desconocida → se conserva el placeholder.
      return value !== undefined ? value : match;
    });
  }
}
