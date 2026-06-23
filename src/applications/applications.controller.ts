import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Query,
  ParseIntPipe,
  HttpCode,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApplicationResult, ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { ApproveApplicationDto } from './dto/approve-application.dto';
import { UpdateScreeningDto } from './dto/update-screening.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApplicationStatus } from './enums/application-status.enum';
import { applicationDocumentMulterConfig } from '../common/utils/multer.config';
import { assertUploadedFilesMatchContent } from '../common/utils/upload-content-validation';
import type { ApplicationApprovalResult } from './application-approval.types';
import type { ApplicationDocumentRef } from './application-documents.service';
import type { ApplicationScreeningResult } from './application-screening.types';
import {
  ApplicationApprovalResponseDto,
  ApplicationDocumentsUploadResponseDto,
  ApplicationMessageResponseDto,
  ApplicationScreeningResponseDto,
  RentalApplicationResponseDto,
} from './dto/application-response.dto';

interface ApplicationRequestUser {
  userId: number;
  role?: string;
}

@ApiTags('Rental Applications')
@ApiBearerAuth()
@Controller(':slug/applications')
@UseGuards(JwtAuthGuard)
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(RolesGuard)
  @Roles('INQUILINO')
  @ApiOperation({
    summary: 'Enviar una nueva solicitud de alquiler (Inquilino)',
    description:
      'Crea una solicitud para una propiedad disponible. El applicant_id se toma del JWT.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiBody({ type: CreateApplicationDto })
  @ApiCreatedResponse({ type: RentalApplicationResponseDto })
  @ApiBadRequestResponse({
    description:
      'Usuario no inquilino, propiedad no disponible o datos inválidos',
  })
  @ApiUnauthorizedResponse({ description: 'JWT inválido o ausente' })
  @ApiForbiddenResponse({ description: 'Rol distinto de INQUILINO' })
  async create(
    @Param('slug') slug: string,
    @CurrentUser() user: ApplicationRequestUser,
    @Body() createApplicationDto: CreateApplicationDto,
  ): Promise<ApplicationResult> {
    return this.applicationsService.create(
      createApplicationDto,
      user.userId,
      slug,
    );
  }

  @Get('my-applications')
  @UseGuards(RolesGuard)
  @Roles('INQUILINO')
  @ApiOperation({ summary: 'Ver mis solicitudes enviadas (Inquilino)' })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiOkResponse({ type: RentalApplicationResponseDto, isArray: true })
  async findMyApplications(
    @Param('slug') slug: string,
    @CurrentUser() user: ApplicationRequestUser,
  ): Promise<ApplicationResult[]> {
    return this.applicationsService.findByApplicant(user.userId, slug);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Listar todas las solicitudes (Admin)' })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiQuery({ name: 'status', required: false, enum: ApplicationStatus })
  @ApiOkResponse({ type: RentalApplicationResponseDto, isArray: true })
  @ApiForbiddenResponse({ description: 'Rol distinto de ADMIN/SUPERADMIN' })
  async findAll(
    @Param('slug') slug: string,
    @Query('status') status?: ApplicationStatus,
  ): Promise<ApplicationResult[]> {
    return this.applicationsService.findAll(slug, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de una solicitud' })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: RentalApplicationResponseDto })
  @ApiNotFoundResponse({ description: 'Solicitud no encontrada' })
  async findOne(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ApplicationRequestUser,
  ): Promise<ApplicationResult> {
    const application = await this.applicationsService.findOne(id, slug);
    const canViewAny =
      user?.role === 'ADMIN' ||
      user?.role === 'SUPERADMIN' ||
      user?.role === 'EMPLEADO';

    if (!canViewAny && application.applicant_id !== user?.userId) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    return application;
  }

  @Patch(':id/approve')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiOperation({
    summary: 'Aprobar solicitud y crear contrato automáticamente (Admin)',
    description:
      'Aprobar una solicitud crea automáticamente un contrato con los datos proporcionados. El monthly_rent es obligatorio.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: ApproveApplicationDto })
  @ApiOkResponse({ type: ApplicationApprovalResponseDto })
  @ApiBadRequestResponse({
    description: 'Solicitud ya aprobada, inválida o error al crear contrato',
  })
  @ApiNotFoundResponse({ description: 'Solicitud no encontrada' })
  async approveAndCreateContract(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() approveDto: ApproveApplicationDto,
    @CurrentUser() user: ApplicationRequestUser,
  ): Promise<ApplicationApprovalResult> {
    return this.applicationsService.approveAndCreateContract(
      id,
      approveDto,
      user.userId,
      slug,
    );
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Actualizar estado de una solicitud (Admin)' })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateApplicationStatusDto })
  @ApiOkResponse({ type: RentalApplicationResponseDto })
  @ApiNotFoundResponse({ description: 'Solicitud no encontrada' })
  async updateStatus(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateApplicationStatusDto,
  ): Promise<ApplicationResult> {
    return this.applicationsService.updateStatus(id, updateDto, slug);
  }

  @Post(':id/documents')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @UseInterceptors(
    FilesInterceptor('files', 10, applicationDocumentMulterConfig),
  )
  @ApiOperation({
    summary: 'Subir documentos a una solicitud (Admin)',
    description:
      'Acepta hasta 10 archivos (carnet anverso, reverso, boletas de sueldo, comprobante de domicilio). ' +
      'Enviar un campo "types" como array paralelo a "files" para indicar el tipo de cada documento.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiParam({ name: 'id', type: Number })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          maxItems: 10,
          items: { type: 'string', format: 'binary' },
        },
        types: {
          oneOf: [
            { type: 'string', example: 'carnet_anverso' },
            {
              type: 'array',
              items: { type: 'string' },
              example: ['carnet_anverso', 'boleta_sueldo'],
            },
          ],
        },
      },
    },
  })
  @ApiOkResponse({ type: ApplicationDocumentsUploadResponseDto })
  @ApiBadRequestResponse({ description: 'Se requiere al menos un archivo' })
  @ApiNotFoundResponse({ description: 'Solicitud no encontrada' })
  async uploadDocuments(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('types') rawTypes: string | string[],
  ): Promise<{ message: string; documents: ApplicationDocumentRef[] }> {
    if (!files || files.length === 0) {
      throw new BadRequestException('Se requiere al menos un archivo');
    }
    await assertUploadedFilesMatchContent(files);
    const types = Array.isArray(rawTypes)
      ? rawTypes
      : rawTypes
        ? [rawTypes]
        : [];
    return this.applicationsService.uploadDocuments(id, files, types, slug);
  }

  @Patch(':id/screening')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiOperation({
    summary: 'Completar checklist de screening de una solicitud (Admin)',
    description:
      'Upsert del checklist de verificación. Cuando final_status es APPROVED, genera el contrato automáticamente. ' +
      'Cuando es REJECTED o REQUIRES_COSIGNER, notifica al inquilino.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateScreeningDto })
  @ApiOkResponse({ type: ApplicationScreeningResponseDto })
  @ApiBadRequestResponse({
    description: 'monthly_rent requerido cuando final_status es APPROVED',
  })
  @ApiNotFoundResponse({ description: 'Solicitud no encontrada' })
  async completeScreening(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() screeningDto: UpdateScreeningDto,
    @CurrentUser() user: ApplicationRequestUser,
  ): Promise<ApplicationScreeningResult> {
    return this.applicationsService.completeScreening(
      id,
      screeningDto,
      user.userId,
      slug,
    );
  }

  @Patch(':id/screening-fee')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiOperation({
    summary: 'Registrar pago del fee de screening (Admin)',
    description:
      'Marca screening_fee_paid = true. Para EE.UU.: el admin confirma que cobró los $50 antes de proceder.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: ApplicationMessageResponseDto })
  @ApiNotFoundResponse({ description: 'Solicitud no encontrada' })
  async markScreeningFeePaid(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ message: string }> {
    return this.applicationsService.markScreeningFeePaid(id, slug);
  }
}
