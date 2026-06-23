import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OptionalPositiveIntPipe } from '../common/pipes/optional-positive-int.pipe';

interface JwtUser {
  userId: number;
}

// ─── Portal inquilino ────────────────────────────────────────────────────────

@ApiTags('Reviews - Tenant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller(':slug/tenant')
export class TenantReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post('reservations/:id/review')
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @ApiOperation({ summary: 'Reseñar una reserva completada' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la reserva' })
  async create(
    @Param('id', ParseIntPipe) reservationId: number,
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reviewsService.createForReservation(
      reservationId,
      user.userId,
      dto,
    );
  }

  @Get('reviews')
  @ApiOperation({ summary: 'Mis reseñas' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  async findMine(@CurrentUser() user: JwtUser) {
    return this.reviewsService.findMine(user.userId);
  }
}

// ─── Admin ────────────────────────────────────────────────────────────────────

@ApiTags('Reviews - Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller(':slug/admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @RequirePermission('reservations', 'view')
  @ApiOperation({ summary: 'Listar reseñas (filtro opcional por propiedad)' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  async findAll(
    @Query('property_id', OptionalPositiveIntPipe) propertyId?: number,
  ) {
    return this.reviewsService.findAll(propertyId);
  }
}

// ─── Catálogo público ──────────────────────────────────────────────────────────

@ApiTags('Reviews - Catalog')
@Controller(':slug/catalog/properties/:id/rating')
export class PublicRatingController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get()
  @ApiOperation({ summary: 'Rating agregado de una propiedad' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la propiedad' })
  async rating(@Param('id', ParseIntPipe) propertyId: number) {
    return this.reviewsService.getPropertyRating(propertyId);
  }
}
