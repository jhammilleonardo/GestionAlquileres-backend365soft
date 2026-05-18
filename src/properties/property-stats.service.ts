import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';

interface PropertyStatsRow {
  total: string | number;
  available: string | number;
  occupied: string | number;
  maintenance: string | number;
  reserved: string | number;
  inactive: string | number;
}

export interface PropertyStats {
  total: number;
  available: number;
  occupied: number;
  maintenance: number;
  reserved: number;
  inactive: number;
}

@Injectable()
export class PropertyStatsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getStats(schemaName?: string | null): Promise<PropertyStats> {
    const [total] = await this.dataSource.query<PropertyStatsRow[]>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'DISPONIBLE') AS available,
              COUNT(*) FILTER (WHERE status = 'OCUPADO') AS occupied,
              COUNT(*) FILTER (WHERE status = 'MANTENIMIENTO') AS maintenance,
              COUNT(*) FILTER (WHERE status = 'RESERVADO') AS reserved,
              COUNT(*) FILTER (WHERE status = 'INACTIVO') AS inactive
       FROM ${this.propertyTable(schemaName)}`,
    );

    return {
      total: Number(total.total),
      available: Number(total.available),
      occupied: Number(total.occupied),
      maintenance: Number(total.maintenance),
      reserved: Number(total.reserved),
      inactive: Number(total.inactive),
    };
  }

  private propertyTable(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.properties` : 'properties';
  }
}
