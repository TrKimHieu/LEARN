import { Module } from '@nestjs/common';
import { FlashcardsController } from './presentation/flashcards.controller';
import { FlashcardsService } from './application/flashcards.service';
import { FlashcardRepository } from './infrastructure/flashcard.repository';

@Module({
  controllers: [FlashcardsController],
  providers: [FlashcardsService, FlashcardRepository],
})
export class FlashcardsModule {}
