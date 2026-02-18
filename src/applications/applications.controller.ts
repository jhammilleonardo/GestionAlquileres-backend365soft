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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApplicationStatus } from './enums/application-status.enum';

@ApiTags('Rental Applications')
@ApiBearerAuth()
@Controller(':slug/applications')
@UseGuards(JwtAuthGuard)
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @ApiOperation({
    summary: 'Enviar una nueva solicitud de alquiler (Inquilino)',
  })
  async create(
    @CurrentUser() user: { userId: number },
    @Body() createApplicationDto: CreateApplicationDto,
  ): Promise<any> {
    return this.applicationsService.create(createApplicationDto, user.userId);
  }

  @Get('my-applications')
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
  })
  async approveAndCreateContract(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateApplicationStatusDto,
    @CurrentUser() user: { userId: number },
  ) {
    return await this.applicationsService.approveAndCreateContract(
      id,
      updateDto,
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
}
