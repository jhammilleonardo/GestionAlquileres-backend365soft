import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import type {
  CreateInspectionTemplateDto,
  TemplateItemDto,
  UpdateInspectionTemplateDto,
} from './dto/inspection-template.dto';

export interface InspectionTemplateRow {
  id: number;
  name: string;
  type: string | null;
  items: TemplateItemDto[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Plantillas reutilizables de checklist de inspección (estilo Buildium). Permite
 * estandarizar las áreas e ítems para no recapturarlos en cada inspección.
 */
@Injectable()
export class InspectionTemplatesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findAll(schemaName: string): Promise<InspectionTemplateRow[]> {
    const q = quoteIdent(schemaName);
    return this.dataSource.query<InspectionTemplateRow[]>(
      `SELECT id, name, type, items, is_default, created_at, updated_at
         FROM ${q}.inspection_templates
        ORDER BY is_default DESC, name ASC`,
    );
  }

  async findOne(
    schemaName: string,
    id: number,
  ): Promise<InspectionTemplateRow> {
    const q = quoteIdent(schemaName);
    const [template] = await this.dataSource.query<InspectionTemplateRow[]>(
      `SELECT id, name, type, items, is_default, created_at, updated_at
         FROM ${q}.inspection_templates WHERE id = $1`,
      [id],
    );
    if (!template) {
      throw new NotFoundException(`Plantilla ${id} no encontrada`);
    }
    return template;
  }

  async create(
    schemaName: string,
    dto: CreateInspectionTemplateDto,
    userId: number,
  ): Promise<InspectionTemplateRow> {
    const q = quoteIdent(schemaName);
    const [created] = await this.dataSource.query<InspectionTemplateRow[]>(
      `INSERT INTO ${q}.inspection_templates (name, type, items, created_by)
       VALUES ($1, $2, $3::jsonb, $4)
       RETURNING id, name, type, items, is_default, created_at, updated_at`,
      [dto.name, dto.type ?? null, JSON.stringify(dto.items ?? []), userId],
    );
    return created;
  }

  async update(
    schemaName: string,
    id: number,
    dto: UpdateInspectionTemplateDto,
  ): Promise<InspectionTemplateRow> {
    const q = quoteIdent(schemaName);
    await this.findOne(schemaName, id);

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (dto.name !== undefined) {
      sets.push(`name = $${idx++}`);
      params.push(dto.name);
    }
    if (dto.type !== undefined) {
      sets.push(`type = $${idx++}`);
      params.push(dto.type);
    }
    if (dto.items !== undefined) {
      sets.push(`items = $${idx++}::jsonb`);
      params.push(JSON.stringify(dto.items));
    }
    if (dto.is_default !== undefined) {
      sets.push(`is_default = $${idx++}`);
      params.push(dto.is_default);
    }

    if (!sets.length) {
      return this.findOne(schemaName, id);
    }

    sets.push(`updated_at = now()`);
    params.push(id);

    await this.dataSource.query(
      `UPDATE ${q}.inspection_templates SET ${sets.join(', ')} WHERE id = $${idx}`,
      params,
    );
    return this.findOne(schemaName, id);
  }

  async remove(schemaName: string, id: number): Promise<void> {
    const q = quoteIdent(schemaName);
    const template = await this.findOne(schemaName, id);
    if (template.is_default) {
      throw new BadRequestException(
        'No se puede eliminar la plantilla por defecto',
      );
    }
    await this.dataSource.query(
      `DELETE FROM ${q}.inspection_templates WHERE id = $1`,
      [id],
    );
  }
}
