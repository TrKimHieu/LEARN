import { GamificationModule } from '../gamification/gamification.module';
import { Module } from '@nestjs/common';
import { FlashcardsController } from './presentation/flashcards.controller';
import { FlashcardsService } from './application/flashcards.service';
import { FlashcardRepository } from './infrastructure/flashcard.repository';

@Module({
  imports: [GamificationModule],
  controllers: [FlashcardsController],
  providers: [FlashcardsService, FlashcardRepository],
  exports: [FlashcardsService],
})
export class FlashcardsModule {}
