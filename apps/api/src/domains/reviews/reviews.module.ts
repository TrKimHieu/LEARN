import { GamificationModule } from '../gamification/gamification.module';
import { FlashcardsModule } from '../flashcards/flashcards.module';
import { Module } from '@nestjs/common';
import { ReviewsController } from './presentation/reviews.controller';
import { ReviewsService } from './application/reviews.service';
import { ReviewRepository } from './infrastructure/review.repository';

@Module({
  imports: [GamificationModule, FlashcardsModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewRepository],
})
export class ReviewsModule {}
