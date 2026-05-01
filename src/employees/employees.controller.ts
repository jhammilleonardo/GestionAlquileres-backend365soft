import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';

@ApiTags('Admin - Employees')
@ApiBearerAuth()
@Controller(':slug/admin/employees')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get('my-permissions')
  @Roles('ADMIN', 'SUPERADMIN', 'EMPLEADO', 'TECNICO')
  @ApiOperation({
    summary: 'Permisos del usuario logueado — usado por el sidebar',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async getMyPermissions(@Request() req: any, @CurrentTenant() tenant: any) {
    return this.employeesService.getMyPermissions(tenant.schema_name, req.user);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar empleados con rol, permisos y última conexión',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async findAll(@CurrentTenant() tenant: any) {
    return this.employeesService.findAll(tenant.schema_name);
  }

  @Post()
  @ApiOperation({
    summary: 'Crear empleado con datos básicos y permisos iniciales',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async create(
    @CurrentTenant() tenant: any,
    @Body() createEmployeeDto: CreateEmployeeDto,
    @Request() req,
  ) {
    return this.employeesService.create(
      tenant.schema_name,
      createEmployeeDto,
      req.user.userId,
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar datos del empleado' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', description: 'ID del empleado', type: Number })
  async update(
    @Param('id') id: string,
    @CurrentTenant() tenant: any,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
  ) {
    return this.employeesService.update(
      tenant.schema_name,
      +id,
      updateEmployeeDto,
    );
  }

  @Patch(':id/permissions')
  @ApiOperation({ summary: 'Actualizar permisos del empleado por módulo' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', description: 'ID del empleado', type: Number })
  async updatePermissions(
    @Param('id') id: string,
    @CurrentTenant() tenant: any,
    @Body() updatePermissionsDto: UpdatePermissionsDto,
    @Request() req,
  ) {
    return this.employeesService.updatePermissions(
      tenant.schema_name,
      +id,
      updatePermissionsDto.permissions,
      req.user?.userId ?? 0,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desactivar acceso del empleado (soft delete)' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', description: 'ID del empleado', type: Number })
  async remove(
    @Param('id') id: string,
    @CurrentTenant() tenant: any,
    @Request() req,
  ) {
    return this.employeesService.remove(
      tenant.schema_name,
      +id,
      req.user?.userId ?? 0,
    );
  }
}
