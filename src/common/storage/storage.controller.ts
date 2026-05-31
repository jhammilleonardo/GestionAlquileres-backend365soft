import {
  Inject,
  Controller,
  Get,
  Param,
  Req,
  Res,
  UseGuards,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import type { TenantRequest } from '../middleware/tenant-context.middleware';
import { isValidTenantSlug } from '../utils/tenant-slug';
import { StorageService } from './storage.service';

/**
 * Sirve archivos del directorio `storage/` con control de acceso.
 *
 * - `/storage/properties/:slug/:propertyId/:filename` — público: imágenes
 *   del catálogo mostradas en el portal público.
 * - Todo el resto de rutas (maintenance, receipts, applications) requiere
 *   JWT válido y que el `tenantSlug` de la URL coincida con el del token.
 *
 * El nombre de archivo se sanitiza siempre para evitar path traversal.
 */
@Controller('storage')
export class StorageController {
  constructor(
    @Inject(StorageService)
    private readonly storageService: StorageService,
  ) {}

  // ──────────────────────────────────────────────────────────────
  // Público: imágenes de propiedades (catálogo)
  // ──────────────────────────────────────────────────────────────
  @Get('properties/:slug/:propertyId/:filename')
  servePropertyImage(
    @Param('slug') slug: string,
    @Param('propertyId') propertyId: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    this.assertSafeSlug(slug);
    this.assertSafeSegment(propertyId);
    this.assertSafeFilename(filename);

    // Imágenes de catálogo son públicas — permitir carga cross-origin desde el frontend
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    return this.sendFile(
      res,
      this.storageService.buildStoragePath(
        'properties',
        slug,
        propertyId,
        filename,
      ),
      'public',
    );
  }

  // ──────────────────────────────────────────────────────────────
  // Privado: archivos de mantenimiento
  // ──────────────────────────────────────────────────────────────
  @Get('maintenance/:slug/:requestId/:filename')
  @UseGuards(JwtAuthGuard)
  serveMaintenanceFile(
    @Param('slug') slug: string,
    @Param('requestId') requestId: string,
    @Param('filename') filename: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.assertTenantOwnership(req, slug);
    this.assertSafeSegment(requestId);
    this.assertSafeFilename(filename);

    return this.sendFile(
      res,
      this.storageService.buildStoragePath(
        'maintenance',
        slug,
        requestId,
        filename,
      ),
      'private',
    );
  }

  @Get('maintenance/:slug/:requestId/stage/:filename')
  @UseGuards(JwtAuthGuard)
  serveMaintenanceStageFile(
    @Param('slug') slug: string,
    @Param('requestId') requestId: string,
    @Param('filename') filename: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.assertTenantOwnership(req, slug);
    this.assertSafeSegment(requestId);
    this.assertSafeFilename(filename);

    return this.sendFile(
      res,
      this.storageService.buildStoragePath(
        'maintenance',
        slug,
        requestId,
        'stage',
        filename,
      ),
      'private',
    );
  }

  // ──────────────────────────────────────────────────────────────
  // Privado: comprobantes de pago
  // ──────────────────────────────────────────────────────────────
  @Get('receipts/:slug/:filename')
  @UseGuards(JwtAuthGuard)
  serveReceipt(
    @Param('slug') slug: string,
    @Param('filename') filename: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.assertTenantOwnership(req, slug);
    this.assertSafeFilename(filename);

    return this.sendFile(
      res,
      this.storageService.buildStoragePath('receipts', slug, filename),
      'private',
    );
  }

  // ──────────────────────────────────────────────────────────────
  // Privado: documentos de solicitudes de alquiler
  // ──────────────────────────────────────────────────────────────
  @Get('applications/:slug/:applicationId/:filename')
  @UseGuards(JwtAuthGuard)
  serveApplicationDocument(
    @Param('slug') slug: string,
    @Param('applicationId') applicationId: string,
    @Param('filename') filename: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.assertTenantOwnership(req, slug);
    this.assertSafeSegment(applicationId);
    this.assertSafeFilename(filename);

    return this.sendFile(
      res,
      this.storageService.buildStoragePath(
        'applications',
        slug,
        applicationId,
        filename,
      ),
      'private',
    );
  }

  // ──────────────────────────────────────────────────────────────
  // Privado: fotos de inspecciones
  // ──────────────────────────────────────────────────────────────
  @Get('inspections/:slug/:inspectionId/:filename')
  @UseGuards(JwtAuthGuard)
  serveInspectionFile(
    @Param('slug') slug: string,
    @Param('inspectionId') inspectionId: string,
    @Param('filename') filename: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.assertTenantOwnership(req, slug);
    this.assertSafeSegment(inspectionId);
    this.assertSafeFilename(filename);

    return this.sendFile(
      res,
      this.storageService.buildStoragePath(
        'inspections',
        slug,
        inspectionId,
        filename,
      ),
      'private',
    );
  }

  // ──────────────────────────────────────────────────────────────
  // Privado: fotos de evidencia de violaciones
  // ──────────────────────────────────────────────────────────────
  @Get('violations/:slug/:violationId/:filename')
  @UseGuards(JwtAuthGuard)
  serveViolationFile(
    @Param('slug') slug: string,
    @Param('violationId') violationId: string,
    @Param('filename') filename: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.assertTenantOwnership(req, slug);
    this.assertSafeSegment(violationId);
    this.assertSafeFilename(filename);

    return this.sendFile(
      res,
      this.storageService.buildStoragePath('violations', slug, violationId, filename),
      'private',
    );
  }

  // ──────────────────────────────────────────────────────────────
  // Privado: documentos de contratos
  // ──────────────────────────────────────────────────────────────
  @Get('contracts/:slug/:contractId/:filename')
  @UseGuards(JwtAuthGuard)
  serveContractFile(
    @Param('slug') slug: string,
    @Param('contractId') contractId: string,
    @Param('filename') filename: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.assertTenantOwnership(req, slug);
    this.assertSafeSegment(contractId);
    this.assertSafeFilename(filename);

    return this.sendFile(
      res,
      this.storageService.buildStoragePath(
        'contracts',
        slug,
        contractId,
        filename,
      ),
      'private',
    );
  }

  // ──────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────

  private assertTenantOwnership(req: Request, slug: string) {
    this.assertSafeSlug(slug);
    const user = (req as TenantRequest).user;
    if (!user?.tenantSlug || user.tenantSlug !== slug) {
      throw new ForbiddenException('Not authorized for this tenant');
    }
  }

  private assertSafeSlug(slug: string) {
    if (!isValidTenantSlug(slug)) {
      throw new BadRequestException(`Invalid tenant slug: '${slug}'`);
    }
  }

  // Sólo permitimos números o enum simple (evita ../, nulos, separadores).
  private assertSafeSegment(segment: string) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(segment)) {
      throw new BadRequestException(`Invalid path segment: '${segment}'`);
    }
  }

  // El nombre de archivo ya lo genera `crypto.randomBytes` (32 hex + ext);
  // aceptamos sólo el mismo formato.
  private assertSafeFilename(filename: string) {
    if (!/^[a-zA-Z0-9_-]{1,128}\.[a-zA-Z0-9]{1,10}$/.test(filename)) {
      throw new BadRequestException(`Invalid filename: '${filename}'`);
    }
  }

  private async sendFile(
    res: Response,
    storagePath: string,
    visibility: 'public' | 'private',
  ) {
    const access = await this.storageService.resolveReadAccess(
      storagePath,
      visibility,
    );
    if (access.kind === 'redirect') {
      return res.redirect(access.url);
    }

    return res.sendFile(access.absolutePath);
  }
}
