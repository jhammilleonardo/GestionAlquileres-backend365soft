import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { VendorsService } from './vendors.service';
import { ChangeVendorPasswordDto } from './dto/change-vendor-password.dto';
import { VendorMessageResponseDto } from './dto/vendor-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { VendorPortalGuard } from '../common/guards/vendor-portal.guard';
import type { TenantRequest } from '../common/middleware/tenant-context.middleware';

/**
 * Portal del proveedor autenticado (`/:slug/vendor/*`). Opera siempre sobre la
 * cuenta del proveedor del JWT — nunca recibe IDs de otros proveedores.
 */
@ApiTags('Vendors - Portal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, VendorPortalGuard)
@Controller(':slug/vendor')
export class VendorPortalController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Perfil del proveedor autenticado' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiForbiddenResponse({ description: 'Rol distinto de VENDOR' })
  getProfile(@Param('slug') _slug: string, @Request() req: TenantRequest) {
    return this.vendorsService.getPortalProfile(req.user!.vendorId!);
  }

  @Patch('password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambiar la contraseña del proveedor autenticado' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiBody({ type: ChangeVendorPasswordDto })
  @ApiOkResponse({ type: VendorMessageResponseDto })
  @ApiForbiddenResponse({ description: 'Rol distinto de VENDOR' })
  changePassword(
    @Param('slug') _slug: string,
    @Body() dto: ChangeVendorPasswordDto,
    @Request() req: TenantRequest,
  ) {
    return this.vendorsService.changeVendorPassword(
      req.user!.userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
