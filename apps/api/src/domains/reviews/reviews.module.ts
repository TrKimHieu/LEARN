import { GamificationModule } from '../gamification/gamification.module';
import { Module } from '@nestjs/common';
import { ReviewsController } from './presentation/reviews.controller';
import { ReviewsService } from './application/reviews.service';
import { ReviewRepository } from './infrastructure/review.repository';

@Module({
  imports: [GamificationModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewRepository],
})
export class ReviewsModule {}
