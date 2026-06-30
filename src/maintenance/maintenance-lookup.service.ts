import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MaintenanceFiltersDto } from './dto/maintenance-filters.dto';
import type {
  MaintenanceAttachmentRow,
  MaintenanceMessageRow,
  MaintenanceRequestRow,
} from './maintenance.types';

type QueryParam = string | number | boolean | null | Date;

@Injectable()
export class MaintenanceLookupService {
  constructor(private readonly dataSource: DataSource) {}

  async findAll(
    filters?: MaintenanceFiltersDto,
  ): Promise<MaintenanceRequestRow[]> {
    let query = `
      SELECT
        mr.*,
        json_build_object('id', p.id, 'title', p.title) as property,
        json_build_object('id', c.id, 'contract_number', c.contract_number) as contract,
        json_build_object('id', r.id, 'checkin_date', r.checkin_date, 'checkout_date', r.checkout_date, 'status', r.status) as reservation,
        json_build_object('id', u.id, 'name', u.name, 'email', u.email, 'phone', u.phone) as tenant
      FROM maintenance_requests mr
      LEFT JOIN properties p ON p.id = mr.property_id
      LEFT JOIN contracts c ON c.id = mr.contract_id
      LEFT JOIN reservations r ON r.id = mr.reservation_id
      LEFT JOIN "user" u ON u.id = mr.tenant_id
      WHERE 1=1
    `;
    const params: QueryParam[] = [];
    let paramIndex = 1;

    if (filters?.status) {
      query += ` AND mr.status = $${paramIndex++}`;
      params.push(filters.status);
    }

    if (filters?.priority) {
      query += ` AND mr.priority = $${paramIndex++}`;
      params.push(filters.priority);
    }

    if (filters?.request_type) {
      query += ` AND mr.request_type = $${paramIndex++}`;
      params.push(filters.request_type);
    }

    if (filters?.tenant_id) {
      query += ` AND mr.tenant_id = $${paramIndex++}`;
      params.push(filters.tenant_id);
    }

    if (filters?.property_id) {
      query += ` AND mr.property_id = $${paramIndex++}`;
      params.push(filters.property_id);
    }

    if (filters?.contract_id) {
      query += ` AND mr.contract_id = $${paramIndex++}`;
      params.push(filters.contract_id);
    }

    if (filters?.assigned_to) {
      query += ` AND mr.assigned_to = $${paramIndex++}`;
      params.push(filters.assigned_to);
    }

    if (filters?.vendor_id) {
      query += ` AND mr.vendor_id = $${paramIndex++}`;
      params.push(filters.vendor_id);
    }

    query += ` ORDER BY mr.updated_at DESC`;

    return this.dataSource.query<MaintenanceRequestRow[]>(query, params);
  }

  async findByTenant(tenantId: number): Promise<MaintenanceRequestRow[]> {
    return this.dataSource.query<MaintenanceRequestRow[]>(
      `SELECT
        mr.*,
        json_build_object('id', p.id, 'title', p.title) as property,
        json_build_object('id', c.id, 'contract_number', c.contract_number) as contract,
        json_build_object('id', r.id, 'checkin_date', r.checkin_date, 'checkout_date', r.checkout_date, 'status', r.status) as reservation
      FROM maintenance_requests mr
      LEFT JOIN properties p ON p.id = mr.property_id
      LEFT JOIN contracts c ON c.id = mr.contract_id
      LEFT JOIN reservations r ON r.id = mr.reservation_id
      WHERE mr.tenant_id = $1
      ORDER BY mr.updated_at DESC`,
      [tenantId],
    );
  }

  async findOne(id: number): Promise<MaintenanceRequestRow> {
    const requests = await this.dataSource.query<MaintenanceRequestRow[]>(
      `SELECT
        mr.*,
        json_build_object(
          'id', p.id,
          'title', p.title,
          'latitude', p.latitude,
          'longitude', p.longitude,
          'address', addr.street_address,
          'city', addr.city,
          'state', addr.state,
          'zip_code', addr.zip_code,
          'country', addr.country
        ) as property,
        json_build_object('id', c.id, 'contract_number', c.contract_number) as contract,
        json_build_object('id', r.id, 'checkin_date', r.checkin_date, 'checkout_date', r.checkout_date, 'status', r.status) as reservation,
        json_build_object('id', u.id, 'name', u.name, 'email', u.email, 'phone', u.phone) as tenant
      FROM maintenance_requests mr
      LEFT JOIN properties p ON p.id = mr.property_id
      LEFT JOIN LATERAL (
        SELECT street_address, city, state, zip_code, country
        FROM property_addresses pa
        WHERE pa.property_id = p.id
        ORDER BY pa.id ASC
        LIMIT 1
      ) addr ON true
      LEFT JOIN contracts c ON c.id = mr.contract_id
      LEFT JOIN reservations r ON r.id = mr.reservation_id
      LEFT JOIN "user" u ON u.id = mr.tenant_id
      WHERE mr.id = $1`,
      [id],
    );

    if (!requests || requests.length === 0) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    const maintenance = requests[0];
    maintenance.messages = await this.getMessagesByRequest(id);
    maintenance.attachments = await this.getDirectAttachments(id);

    return maintenance;
  }

  async getMessages(
    requestId: number,
    userId?: number,
  ): Promise<MaintenanceMessageRow[]> {
    const messages = await this.getMessagesByRequest(requestId);

    const request = await this.findOne(requestId);
    if (userId && request.tenant_id === userId) {
      return messages.filter((message) => message.send_to_resident);
    }

    return messages;
  }

  private async getMessagesByRequest(
    requestId: number,
  ): Promise<MaintenanceMessageRow[]> {
    return this.dataSource.query<MaintenanceMessageRow[]>(
      `SELECT
        mm.*,
        u.name AS sender_name,
        u.role AS sender_role,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ma.id,
              'file_url', ma.file_url,
              'file_name', ma.file_name,
              'file_type', ma.file_type,
              'created_at', ma.created_at
            )
          ) FILTER (WHERE ma.id IS NOT NULL),
          '[]'
        ) as attachments
      FROM maintenance_messages mm
      LEFT JOIN maintenance_attachments ma ON ma.message_id = mm.id
      LEFT JOIN "user" u ON u.id = mm.user_id
      WHERE mm.maintenance_request_id = $1
      GROUP BY mm.id, u.name, u.role
      ORDER BY mm.created_at ASC`,
      [requestId],
    );
  }

  private async getDirectAttachments(
    requestId: number,
  ): Promise<MaintenanceAttachmentRow[]> {
    return this.dataSource.query<MaintenanceAttachmentRow[]>(
      `SELECT * FROM maintenance_attachments
      WHERE maintenance_request_id = $1 AND message_id IS NULL`,
      [requestId],
    );
  }
}
