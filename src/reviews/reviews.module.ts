import { Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import {
  TenantReviewsController,
  AdminReviewsController,
  PublicRatingController,
} from './reviews.controller';

@Module({
  providers: [ReviewsService],
  controllers: [
    TenantReviewsController,
    AdminReviewsController,
    PublicRatingController,
  ],
  exports: [ReviewsService],
})
export class ReviewsModule {}
