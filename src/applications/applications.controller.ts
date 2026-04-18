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
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ApplicationsService } from './applications.service';
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

@ApiTags('Rental Applications')
@ApiBearerAuth()
@Controller(':slug/applications')
@UseGuards(JwtAuthGuard)
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('INQUILINO')
  @ApiOperation({
    summary: 'Enviar una nueva solicitud de alquiler (Inquilino)',
  })
  async create(
    @Param('slug') slug: string,
    @CurrentUser() user: { userId: number; role: string },
    @Body() createApplicationDto: CreateApplicationDto,
  ): Promise<any> {
    return this.applicationsService.create(createApplicationDto, user.userId, slug);
  }

  @Get('my-applications')
  @UseGuards(RolesGuard)
  @Roles('INQUILINO')
  @ApiOperation({ summary: 'Ver mis solicitudes enviadas (Inquilino)' })
  async findMyApplications(
    @CurrentUser() user: { userId: number },
  ): Promise<any> {
    return this.applicationsService.findByApplicant(user.userId);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Listar todas las solicitudes (Admin)' })
  async findAll(@Query('status') status?: ApplicationStatus): Promise<any> {
    return this.applicationsService.findAll(status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de una solicitud' })
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<any> {
    return this.applicationsService.findOne(id);
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
  async approveAndCreateContract(
    @Param('id', ParseIntPipe) id: number,
    @Body() approveDto: ApproveApplicationDto,
    @CurrentUser() user: { userId: number },
  ) {
    return await this.applicationsService.approveAndCreateContract(
      id,
      approveDto,
      user.userId,
    );
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Actualizar estado de una solicitud (Admin)' })
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateApplicationStatusDto,
  ): Promise<any> {
    return this.applicationsService.updateStatus(id, updateDto);
  }

  @Post(':id/documents')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @UseInterceptors(FilesInterceptor('files', 10, applicationDocumentMulterConfig))
  @ApiOperation({
    summary: 'Subir documentos a una solicitud (Admin)',
    description:
      'Acepta hasta 10 archivos (carnet anverso, reverso, boletas de sueldo, comprobante de domicilio). ' +
      'Enviar un campo "types" como array paralelo a "files" para indicar el tipo de cada documento.',
  })
  async uploadDocuments(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('types') rawTypes: string | string[],
  ): Promise<any> {
    if (!files || files.length === 0) {
      throw new BadRequestException('Se requiere al menos un archivo');
    }
    const types = Array.isArray(rawTypes) ? rawTypes : rawTypes ? [rawTypes] : [];
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
  async completeScreening(
    @Param('id', ParseIntPipe) id: number,
    @Body() screeningDto: UpdateScreeningDto,
    @CurrentUser() user: { userId: number },
  ): Promise<any> {
    return this.applicationsService.completeScreening(id, screeningDto, user.userId);
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
  async markScreeningFeePaid(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<any> {
    return this.applicationsService.markScreeningFeePaid(id);
  }
}
