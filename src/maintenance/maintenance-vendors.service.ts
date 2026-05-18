import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { MaintenanceRequest } from './entities/maintenance-request.entity';
import { MaintenanceLookupService } from './maintenance-lookup.service';
import type { MaintenanceRequestRow, VendorRow } from './maintenance.types';

@Injectable()
export class MaintenanceVendorsService {
  private readonly logger = new Logger(MaintenanceVendorsService.name);

  constructor(
    @InjectRepository(MaintenanceRequest)
    private readonly maintenanceRepository: Repository<MaintenanceRequest>,
    private readonly dataSource: DataSource,
    private readonly maintenanceLookupService: MaintenanceLookupService,
  ) {}

  async assignVendor(
    requestId: number,
    vendorId: number | null,
    assignedTo: number | null,
  ): Promise<MaintenanceRequestRow> {
    const request = await this.maintenanceLookupService.findOne(requestId);

    if (vendorId !== null && assignedTo !== null) {
      throw new BadRequestException(
        'No se puede asignar vendor externo y técnico interno al mismo tiempo',
      );
    }

    if (vendorId !== null) {
      await this.ensureVendorCanBeAssigned(vendorId);
    }

    await this.dataSource.query(
      `UPDATE maintenance_requests
       SET vendor_id = $1,
           assigned_to = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [vendorId, assignedTo ?? request.assigned_to, requestId],
    );

    this.logger.log(
      `Request ${requestId} assigned to ${vendorId ? `vendor ${vendorId}` : `tech ${assignedTo}`}`,
    );
    return this.maintenanceLookupService.findOne(requestId);
  }

  async rateVendor(
    requestId: number,
    rating: number,
    comment: string | undefined,
    userId: number,
  ): Promise<MaintenanceRequestRow> {
    const request = await this.maintenanceLookupService.findOne(requestId);

    if (!request.vendor_id) {
      throw new BadRequestException(
        'Esta orden no tiene un proveedor externo asignado',
      );
    }

    if (request.vendor_rated_at) {
      throw new BadRequestException(
        'Este proveedor ya fue calificado para esta orden',
      );
    }

    if (!['COMPLETED', 'CLOSED'].includes(request.status)) {
      throw new BadRequestException(
        'Solo se puede calificar al proveedor cuando la orden está COMPLETED o CLOSED',
      );
    }

    await this.maintenanceRepository.update(requestId, {
      vendor_rating: rating,
      vendor_rating_comment: comment ?? null,
      vendor_rated_at: new Date(),
      vendor_rated_by: userId,
    });

    await this.dataSource.query(
      `UPDATE vendors
         SET average_rating = (
           SELECT ROUND(AVG(vendor_rating)::numeric, 2)
           FROM maintenance_requests
           WHERE vendor_id = $1 AND vendor_rating IS NOT NULL
         ),
         updated_at = now()
         WHERE id = $1`,
      [request.vendor_id],
    );

    this.logger.log(
      `Vendor ${request.vendor_id} rated ${rating}/5 for request ${requestId}`,
    );
    return this.maintenanceLookupService.findOne(requestId);
  }

  private async ensureVendorCanBeAssigned(vendorId: number): Promise<void> {
    const vendor = await this.dataSource.query<VendorRow[]>(
      `SELECT id, is_active FROM vendors WHERE id = $1`,
      [vendorId],
    );

    if (vendor.length === 0) {
      throw new NotFoundException(`Proveedor con ID ${vendorId} no encontrado`);
    }

    if (!vendor[0].is_active) {
      throw new BadRequestException('El proveedor está desactivado');
    }
  }
}
