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
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import type { TenantRequest } from '../middleware/tenant-context.middleware';
import { isValidTenantSlug } from '../utils/tenant-slug';
import { quoteIdent } from '../utils/sql-identifier';
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
    @InjectDataSource()
    private readonly dataSource: DataSource,
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
  // Público: logo e imagen de fondo del portal (branding del tenant)
  // ──────────────────────────────────────────────────────────────
  @Get('branding/:slug/:filename')
  serveBrandingImage(
    @Param('slug') slug: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    this.assertSafeSlug(slug);
    this.assertSafeFilename(filename);

    // Branding es público — permitir carga cross-origin desde el frontend
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    return this.sendFile(
      res,
      this.storageService.buildStoragePath('branding', slug, filename),
      'public',
    );
  }

  // ──────────────────────────────────────────────────────────────
  // Privado: archivos de mantenimiento
  // ──────────────────────────────────────────────────────────────
  @Get('maintenance/:slug/:requestId/:filename')
  @UseGuards(JwtAuthGuard)
  async serveMaintenanceFile(
    @Param('slug') slug: string,
    @Param('requestId') requestId: string,
    @Param('filename') filename: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.assertTenantOwnership(req, slug);
    this.assertSafeSegment(requestId);
    this.assertSafeFilename(filename);
    await this.assertMaintenanceFileAccess(req, slug, requestId, filename);

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
  async serveMaintenanceStageFile(
    @Param('slug') slug: string,
    @Param('requestId') requestId: string,
    @Param('filename') filename: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.assertTenantOwnership(req, slug);
    this.assertSafeSegment(requestId);
    this.assertSafeFilename(filename);
    await this.assertMaintenanceFileAccess(
      req,
      slug,
      requestId,
      filename,
      true,
    );

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
  async serveReceipt(
    @Param('slug') slug: string,
    @Param('filename') filename: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.assertTenantOwnership(req, slug);
    this.assertSafeFilename(filename);
    await this.assertReceiptFileAccess(req, slug, filename);

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
  async serveApplicationDocument(
    @Param('slug') slug: string,
    @Param('applicationId') applicationId: string,
    @Param('filename') filename: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.assertTenantOwnership(req, slug);
    this.assertSafeSegment(applicationId);
    this.assertSafeFilename(filename);
    await this.assertApplicationDocumentAccess(
      req,
      slug,
      applicationId,
      filename,
    );

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
  async serveInspectionFile(
    @Param('slug') slug: string,
    @Param('inspectionId') inspectionId: string,
    @Param('filename') filename: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.assertTenantOwnership(req, slug);
    this.assertSafeSegment(inspectionId);
    this.assertSafeFilename(filename);
    await this.assertInspectionFileAccess(req, slug, inspectionId, filename);

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
  async serveViolationFile(
    @Param('slug') slug: string,
    @Param('violationId') violationId: string,
    @Param('filename') filename: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.assertTenantOwnership(req, slug);
    this.assertSafeSegment(violationId);
    this.assertSafeFilename(filename);
    await this.assertViolationFileAccess(req, slug, violationId, filename);

    return this.sendFile(
      res,
      this.storageService.buildStoragePath(
        'violations',
        slug,
        violationId,
        filename,
      ),
      'private',
    );
  }

  // ──────────────────────────────────────────────────────────────
  // Privado: adjuntos de mensajería interna
  // ──────────────────────────────────────────────────────────────
  @Get('messages/:slug/:userId/:filename')
  @UseGuards(JwtAuthGuard)
  async serveMessageFile(
    @Param('slug') slug: string,
    @Param('userId') userId: string,
    @Param('filename') filename: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.assertTenantOwnership(req, slug);
    this.assertSafeSegment(userId);
    this.assertSafeFilename(filename);
    await this.assertMessageFileAccess(req, slug, userId, filename);

    return this.sendFile(
      res,
      this.storageService.buildStoragePath('messages', slug, userId, filename),
      'private',
    );
  }

  // ──────────────────────────────────────────────────────────────
  // Privado: documentos de contratos
  // ──────────────────────────────────────────────────────────────
  @Get('contracts/:slug/:contractId/:filename')
  @UseGuards(JwtAuthGuard)
  async serveContractFile(
    @Param('slug') slug: string,
    @Param('contractId') contractId: string,
    @Param('filename') filename: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.assertTenantOwnership(req, slug);
    this.assertSafeSegment(contractId);
    this.assertSafeFilename(filename);
    await this.assertContractFileAccess(req, slug, contractId, filename);

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

  private async assertMaintenanceFileAccess(
    req: Request,
    slug: string,
    requestId: string,
    filename: string,
    isStageFile = false,
  ): Promise<void> {
    const user = this.getRequestUser(req);
    const schema = await this.getTenantSchemaOrThrow(slug);
    const q = quoteIdent(schema);
    const resourceId = this.parseNumericSegment(requestId);
    const fileUrl = isStageFile
      ? `/storage/maintenance/${slug}/${requestId}/stage/${filename}`
      : `/storage/maintenance/${slug}/${requestId}/${filename}`;

    const rows = await this.dataSource.query<
      Array<{
        tenant_id: number;
        assigned_to: number | null;
        vendor_id: number | null;
        owner_allowed: boolean;
        file_registered: boolean;
      }>
    >(
      `SELECT
         mr.tenant_id,
         mr.assigned_to,
         mr.vendor_id,
         EXISTS (
           SELECT 1
           FROM ${q}.property_owners po
           WHERE po.property_id = mr.property_id
             AND po.rental_owner_id = $3
         ) AS owner_allowed,
         EXISTS (
           SELECT 1
           FROM ${q}.maintenance_attachments ma
           WHERE ma.maintenance_request_id = mr.id
             AND ma.file_url = $2
         ) AS file_registered
       FROM ${q}.maintenance_requests mr
       WHERE mr.id = $1
       LIMIT 1`,
      [resourceId, fileUrl, user.rentalOwnerId ?? null],
    );

    const row = rows[0];
    if (!row?.file_registered) {
      throw new ForbiddenException('Not authorized for this file');
    }

    if (
      this.isTenantStaff(user.role) ||
      row.tenant_id === user.userId ||
      row.assigned_to === user.userId ||
      (user.vendorId != null && row.vendor_id === user.vendorId) ||
      row.owner_allowed
    ) {
      return;
    }

    throw new ForbiddenException('Not authorized for this file');
  }

  private async assertReceiptFileAccess(
    req: Request,
    slug: string,
    filename: string,
  ): Promise<void> {
    const user = this.getRequestUser(req);
    const schema = await this.getTenantSchemaOrThrow(slug);
    const q = quoteIdent(schema);
    const storagePath = `storage/receipts/${slug}/${filename}`;
    const routePath = `/storage/receipts/${slug}/${filename}`;

    const rows = await this.dataSource.query<
      Array<{
        tenant_id: number;
        contract_tenant_id: number | null;
        expense_property_id: number | null;
        owner_allowed: boolean;
      }>
    >(
      `SELECT
         ref.tenant_id,
         ref.contract_tenant_id,
         ref.expense_property_id,
         EXISTS (
           SELECT 1
           FROM ${q}.property_owners po
           WHERE po.property_id = COALESCE(ref.payment_property_id, ref.expense_property_id)
             AND po.rental_owner_id = $3
         ) AS owner_allowed
       FROM (
         SELECT
           p.tenant_id,
           c.tenant_id AS contract_tenant_id,
           p.property_id AS payment_property_id,
           NULL::integer AS expense_property_id
         FROM ${q}.payments p
         LEFT JOIN ${q}.contracts c ON c.id = p.contract_id
         WHERE p.proof_file IN ($1, $2)
            OR p.receipt_file IN ($1, $2)
         UNION ALL
         SELECT
           NULL::integer AS tenant_id,
           NULL::integer AS contract_tenant_id,
           NULL::integer AS payment_property_id,
           e.property_id AS expense_property_id
         FROM ${q}.expenses e
         WHERE e.receipt_url IN ($1, $2)
       ) ref
       LIMIT 1`,
      [storagePath, routePath, user.rentalOwnerId ?? null],
    );

    const row = rows[0];
    if (
      row &&
      (this.isTenantStaff(user.role) ||
        row.tenant_id === user.userId ||
        row.contract_tenant_id === user.userId ||
        row.owner_allowed)
    ) {
      return;
    }

    throw new ForbiddenException('Not authorized for this file');
  }

  private async assertApplicationDocumentAccess(
    req: Request,
    slug: string,
    applicationId: string,
    filename: string,
  ): Promise<void> {
    const user = this.getRequestUser(req);
    const schema = await this.getTenantSchemaOrThrow(slug);
    const q = quoteIdent(schema);
    const resourceId = this.parseNumericSegment(applicationId);
    const fileUrl = `/storage/applications/${slug}/${applicationId}/${filename}`;

    const rows = await this.dataSource.query<
      Array<{ applicant_id: number; file_registered: boolean }>
    >(
      `SELECT
         ra.applicant_id,
         EXISTS (
           SELECT 1
           FROM jsonb_array_elements(COALESCE(ra.documents, '[]'::jsonb)) AS doc
           WHERE doc->>'url' = $2
         ) AS file_registered
       FROM ${q}.rental_applications ra
       WHERE ra.id = $1
       LIMIT 1`,
      [resourceId, fileUrl],
    );

    const row = rows[0];
    if (
      row?.file_registered &&
      (this.isTenantStaff(user.role) || row.applicant_id === user.userId)
    ) {
      return;
    }

    throw new ForbiddenException('Not authorized for this file');
  }

  private async assertInspectionFileAccess(
    req: Request,
    slug: string,
    inspectionId: string,
    filename: string,
  ): Promise<void> {
    const user = this.getRequestUser(req);
    const schema = await this.getTenantSchemaOrThrow(slug);
    const q = quoteIdent(schema);
    const resourceId = this.parseNumericSegment(inspectionId);
    const fileUrl = `/storage/inspections/${slug}/${inspectionId}/${filename}`;

    const rows = await this.dataSource.query<
      Array<{
        tenant_id: number | null;
        inspector_user_id: number | null;
        created_by: number;
        owner_allowed: boolean;
        file_registered: boolean;
      }>
    >(
      `SELECT
         c.tenant_id,
         i.inspector_user_id,
         i.created_by,
         EXISTS (
           SELECT 1
           FROM ${q}.property_owners po
           WHERE po.property_id = i.property_id
             AND po.rental_owner_id = $3
         ) AS owner_allowed,
         EXISTS (
           SELECT 1
           FROM ${q}.inspection_items ii,
                jsonb_array_elements_text(COALESCE(ii.photos, '[]'::jsonb)) AS photo
           WHERE ii.inspection_id = i.id
             AND photo = $2
         ) AS file_registered
       FROM ${q}.inspections i
       LEFT JOIN ${q}.contracts c ON c.id = i.contract_id
       WHERE i.id = $1
       LIMIT 1`,
      [resourceId, fileUrl, user.rentalOwnerId ?? null],
    );

    const row = rows[0];
    if (
      row?.file_registered &&
      (this.isTenantStaff(user.role) ||
        row.tenant_id === user.userId ||
        row.inspector_user_id === user.userId ||
        row.created_by === user.userId ||
        row.owner_allowed)
    ) {
      return;
    }

    throw new ForbiddenException('Not authorized for this file');
  }

  private async assertViolationFileAccess(
    req: Request,
    slug: string,
    violationId: string,
    filename: string,
  ): Promise<void> {
    const user = this.getRequestUser(req);
    const schema = await this.getTenantSchemaOrThrow(slug);
    const q = quoteIdent(schema);
    const resourceId = this.parseNumericSegment(violationId);
    const fileUrl = `/storage/violations/${slug}/${violationId}/${filename}`;

    const rows = await this.dataSource.query<
      Array<{
        tenant_id: number;
        owner_allowed: boolean;
        file_registered: boolean;
      }>
    >(
      `SELECT
         v.tenant_id,
         EXISTS (
           SELECT 1
           FROM ${q}.property_owners po
           WHERE po.property_id = v.property_id
             AND po.rental_owner_id = $3
         ) AS owner_allowed,
         EXISTS (
           SELECT 1
           FROM jsonb_array_elements_text(COALESCE(v.evidence_photos, '[]'::jsonb)) AS photo
           WHERE photo = $2
         ) AS file_registered
       FROM ${q}.violations v
       WHERE v.id = $1
       LIMIT 1`,
      [resourceId, fileUrl, user.rentalOwnerId ?? null],
    );

    const row = rows[0];
    if (
      row?.file_registered &&
      (this.isTenantStaff(user.role) ||
        row.tenant_id === user.userId ||
        row.owner_allowed)
    ) {
      return;
    }

    throw new ForbiddenException('Not authorized for this file');
  }

  private async assertContractFileAccess(
    req: Request,
    slug: string,
    contractId: string,
    filename: string,
  ): Promise<void> {
    const user = this.getRequestUser(req);
    const schema = await this.getTenantSchemaOrThrow(slug);
    const q = quoteIdent(schema);
    const resourceId = this.parseNumericSegment(contractId);
    const fileUrl = `/storage/contracts/${slug}/${contractId}/${filename}`;

    const rows = await this.dataSource.query<
      Array<{
        tenant_id: number;
        owner_allowed: boolean;
        file_registered: boolean;
      }>
    >(
      `SELECT
         c.tenant_id,
         EXISTS (
           SELECT 1
           FROM ${q}.property_owners po
           WHERE po.property_id = c.property_id
             AND po.rental_owner_id = $3
         ) AS owner_allowed,
         (c.pdf_url = $2) AS file_registered
       FROM ${q}.contracts c
       WHERE c.id = $1
       LIMIT 1`,
      [resourceId, fileUrl, user.rentalOwnerId ?? null],
    );

    const row = rows[0];
    if (
      row?.file_registered &&
      (this.isTenantStaff(user.role) ||
        row.tenant_id === user.userId ||
        row.owner_allowed)
    ) {
      return;
    }

    throw new ForbiddenException('Not authorized for this file');
  }

  private async assertMessageFileAccess(
    req: Request,
    slug: string,
    userId: string,
    filename: string,
  ): Promise<void> {
    const user = this.getRequestUser(req);
    const schema = await this.getTenantSchemaOrThrow(slug);

    const fileUrl = `/storage/messages/${slug}/${userId}/${filename}`;
    const q = quoteIdent(schema);
    const rows = await this.dataSource.query<Array<{ allowed: number }>>(
      `SELECT 1 AS allowed
       FROM ${q}.internal_message_attachments ima
       LEFT JOIN ${q}.internal_messages im ON im.id = ima.message_id
       WHERE ima.file_url = $1
         AND (
           ima.uploaded_by = $2
           OR im.sender_id = $2
           OR im.recipient_id = $2
         )
       LIMIT 1`,
      [fileUrl, user.userId],
    );

    if (!rows[0]) {
      throw new ForbiddenException('Not authorized for this file');
    }
  }

  private getRequestUser(req: Request) {
    const user = (req as TenantRequest).user;
    if (!user?.userId) {
      throw new ForbiddenException('Not authorized for this file');
    }
    return user;
  }

  private async getTenantSchemaOrThrow(slug: string): Promise<string> {
    const [tenant] = await this.dataSource.query<
      Array<{ schema_name: string }>
    >(
      'SELECT schema_name FROM public.tenant WHERE slug = $1 AND is_active = true',
      [slug],
    );

    if (!tenant) {
      throw new ForbiddenException('Not authorized for this file');
    }

    return tenant.schema_name;
  }

  private isTenantStaff(role: string | undefined): boolean {
    return role === 'ADMIN' || role === 'SUPERADMIN' || role === 'EMPLEADO';
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

  private parseNumericSegment(segment: string): number {
    if (!/^\d+$/.test(segment)) {
      throw new BadRequestException(
        `Invalid numeric path segment: '${segment}'`,
      );
    }
    return Number(segment);
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
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'none'; script-src 'none'; sandbox",
    );
    res.setHeader(
      'Cache-Control',
      visibility === 'public'
        ? 'public, max-age=604800, immutable'
        : 'private, no-store, max-age=0',
    );

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
