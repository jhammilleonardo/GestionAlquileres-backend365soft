import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { TenantWebsiteService } from './tenant-website.service';
import { UpdateTenantWebsiteDto } from './dto/update-tenant-website.dto';
import { SetPublishedDto } from './dto/set-published.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import type { TenantRequest } from '../common/middleware/tenant-context.middleware';
import { StorageService } from '../common/storage/storage.service';
import { brandingMulterConfig } from '../common/utils/multer.config';
import { assertUploadedFilesMatchContent } from '../common/utils/upload-content-validation';

@ApiTags('Tenant Website')
@ApiBearerAuth()
@Controller(':slug/admin/website')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantWebsiteController {
  constructor(
    private readonly tenantWebsiteService: TenantWebsiteService,
    private readonly storageService: StorageService,
  ) {}

  @Get()
  @RequirePermission('config', 'view')
  @ApiOperation({ summary: 'Obtener configuración del sitio público' })
  getWebsite(@Req() req: TenantRequest) {
    return this.tenantWebsiteService.getOrCreate(req.tenant!.schema_name);
  }

  @Patch()
  @RequirePermission('config', 'edit')
  @ApiOperation({ summary: 'Actualizar configuración del sitio público' })
  updateWebsite(
    @Req() req: TenantRequest,
    @Body() dto: UpdateTenantWebsiteDto,
  ) {
    return this.tenantWebsiteService.update(req.tenant!.schema_name, dto);
  }

  @Patch('publish')
  @RequirePermission('config', 'edit')
  @ApiOperation({ summary: 'Publicar o despublicar el sitio' })
  setPublished(@Req() req: TenantRequest, @Body() dto: SetPublishedDto) {
    return this.tenantWebsiteService.setPublished(
      req.tenant!.schema_name,
      dto.published,
    );
  }

  @Post('logo')
  @RequirePermission('config', 'edit')
  @ApiOperation({ summary: 'Subir el logo de la empresa' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', brandingMulterConfig))
  uploadLogo(
    @Param('slug') slug: string,
    @Req() req: TenantRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.persistBrandingImage(slug, req, file, 'logo_url');
  }

  @Post('hero')
  @RequirePermission('config', 'edit')
  @ApiOperation({ summary: 'Subir la imagen de fondo (hero) del portal' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', brandingMulterConfig))
  uploadHero(
    @Param('slug') slug: string,
    @Req() req: TenantRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.persistBrandingImage(slug, req, file, 'hero_image_url');
  }

  private async persistBrandingImage(
    slug: string,
    req: TenantRequest,
    file: Express.Multer.File,
    field: 'logo_url' | 'hero_image_url',
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    await assertUploadedFilesMatchContent(file);

    const storagePath = await this.storageService.persistUploadedFile(
      file,
      this.storageService.buildStoragePath('branding', slug, file.filename),
      'public',
    );

    return this.tenantWebsiteService.setImageField(
      req.tenant!.schema_name,
      field,
      storagePath.replace(/^\/+/, ''),
    );
  }
}
