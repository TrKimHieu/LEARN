import { Module } from '@nestjs/common';
import { FeedbackController } from './presentation/feedback.controller';
import { FeedbackService } from './application/feedback.service';
import { FeedbackRepository } from './infrastructure/feedback.repository';

@Module({
  controllers: [FeedbackController],
  providers: [FeedbackService, FeedbackRepository],
})
export class FeedbackModule {}
