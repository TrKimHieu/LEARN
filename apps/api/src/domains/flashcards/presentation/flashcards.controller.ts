import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  createDeckSchema,
  createFlashcardSchema,
  dueFlashcardsQuerySchema,
  patchDeckSchema,
  patchFlashcardSchema,
  submitFlashcardReviewSchema,
  type CreateDeckInput,
  type CreateFlashcardInput,
  type DueFlashcardsQuery,
  type PatchDeckInput,
  type PatchFlashcardInput,
  type SubmitFlashcardReviewInput,
} from '@learn/contracts';
import { zodBody, zodParam } from '../../../core/exceptions/errors';
import { Auth, CurrentUser, type UserContext } from '../../../core/security';
import { parseIdempotencyKey } from '../../../core/srs/idempotency';
import { FlashcardsService } from '../application/flashcards.service';

const idSchema = z.string().uuid();

@Controller('api/v1')
export class FlashcardsController {
  constructor(private readonly flashcards: FlashcardsService) {}

  @Post('decks')
  @Auth()
  createDeck(
    @CurrentUser() user: UserContext,
    @Body(zodBody(createDeckSchema)) body: CreateDeckInput,
  ) {
    return this.flashcards.createDeck(user.userId, body);
  }

  @Get('decks')
  @Auth()
  listDecks(@CurrentUser() user: UserContext) {
    return this.flashcards.listDecks(user.userId);
  }

  @Patch('decks/:deckId')
  @Auth()
  patchDeck(
    @CurrentUser() user: UserContext,
    @Param('deckId', zodParam(idSchema)) deckId: string,
    @Body(zodBody(patchDeckSchema)) body: PatchDeckInput,
  ) {
    return this.flashcards.patchDeck(user.userId, deckId, body);
  }

  @Delete('decks/:deckId')
  @Auth()
  removeDeck(
    @CurrentUser() user: UserContext,
    @Param('deckId', zodParam(idSchema)) deckId: string,
  ) {
    return this.flashcards.removeDeck(user.userId, deckId);
  }

  @Get('decks/:deckId/cards')
  @Auth()
  deckWithCards(
    @CurrentUser() user: UserContext,
    @Param('deckId', zodParam(idSchema)) deckId: string,
  ) {
    return this.flashcards.deckWithCards(user.userId, deckId);
  }

  @Post('decks/:deckId/cards')
  @Auth()
  createCard(
    @CurrentUser() user: UserContext,
    @Param('deckId', zodParam(idSchema)) deckId: string,
    @Body(zodBody(createFlashcardSchema)) body: CreateFlashcardInput,
  ) {
    return this.flashcards.createCard(user.userId, deckId, body);
  }

  @Patch('cards/:cardId')
  @Auth()
  patchCard(
    @CurrentUser() user: UserContext,
    @Param('cardId', zodParam(idSchema)) cardId: string,
    @Body(zodBody(patchFlashcardSchema)) body: PatchFlashcardInput,
  ) {
    return this.flashcards.patchCard(user.userId, cardId, body);
  }

  @Delete('cards/:cardId')
  @Auth()
  removeCard(
    @CurrentUser() user: UserContext,
    @Param('cardId', zodParam(idSchema)) cardId: string,
  ) {
    return this.flashcards.removeCard(user.userId, cardId);
  }

  @Get('decks/:deckId/due')
  @Auth()
  dueCards(
    @CurrentUser() user: UserContext,
    @Param('deckId', zodParam(idSchema)) deckId: string,
    @Query(zodBody(dueFlashcardsQuerySchema)) query: DueFlashcardsQuery,
  ) {
    return this.flashcards.dueCards(user.userId, deckId, query.limit);
  }

  @Post('cards/:cardId/review')
  @Auth()
  review(
    @CurrentUser() user: UserContext,
    @Param('cardId', zodParam(idSchema)) cardId: string,
    @Body(zodBody(submitFlashcardReviewSchema)) body: SubmitFlashcardReviewInput,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.flashcards.review(user.userId, cardId, body, parseIdempotencyKey(idempotencyKey));
  }
}
