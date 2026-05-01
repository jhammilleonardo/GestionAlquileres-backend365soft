import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  UseGuards,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { existsSync } from 'fs';
import { join, normalize, resolve, sep } from 'path';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { isValidTenantSlug } from '../utils/tenant-slug';

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
  private readonly storageRoot = resolve(process.cwd(), 'storage');

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

    return this.sendFile(res, ['properties', slug, propertyId, filename]);
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

    return this.sendFile(res, ['maintenance', slug, requestId, filename]);
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

    return this.sendFile(res, [
      'maintenance',
      slug,
      requestId,
      'stage',
      filename,
    ]);
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

    return this.sendFile(res, ['receipts', slug, filename]);
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

    return this.sendFile(res, ['applications', slug, applicationId, filename]);
  }

  // ──────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────

  private assertTenantOwnership(req: Request, slug: string) {
    this.assertSafeSlug(slug);
    const user = (req as any).user;
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

  private sendFile(res: Response, segments: string[]) {
    const relative = normalize(join(...segments));
    const absolute = resolve(this.storageRoot, relative);

    // Defensa adicional: garantizar que la ruta final sigue dentro de storage/
    if (!absolute.startsWith(this.storageRoot + sep)) {
      throw new ForbiddenException('Invalid path');
    }

    if (!existsSync(absolute)) {
      throw new NotFoundException('File not found');
    }

    return res.sendFile(absolute);
  }
}
