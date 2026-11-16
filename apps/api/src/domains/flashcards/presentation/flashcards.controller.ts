import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  createDeckSchema,
  acceptFlashcardDraftsSchema,
  createFlashcardSchema,
  dueFlashcardsQuerySchema,
  flashcardDraftQuerySchema,
  patchDeckSchema,
  patchFlashcardDraftSchema,
  patchFlashcardSchema,
  submitFlashcardReviewSchema,
  type AcceptFlashcardDraftsInput,
  type CreateDeckInput,
  type CreateFlashcardInput,
  type DueFlashcardsQuery,
  type FlashcardDraftQuery,
  type PatchDeckInput,
  type PatchFlashcardDraftInput,
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

  /** Ôn hôm nay: thẻ đến hạn của mọi bộ. */
  @Get('flashcards/due')
  @Auth()
  dueAllCards(
    @CurrentUser() user: UserContext,
    @Query(zodBody(dueFlashcardsQuerySchema)) query: DueFlashcardsQuery,
  ) {
    return this.flashcards.dueCards(user.userId, null, query.limit);
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

  @Get('flashcards/drafts')
  @Auth()
  listDrafts(
    @CurrentUser() user: UserContext,
    @Query(zodBody(flashcardDraftQuerySchema)) query: FlashcardDraftQuery,
  ) {
    return this.flashcards.listDrafts(user.userId, query.aiJobId);
  }

  // Literal `accept` trước `drafts/:draftId` để không bị tham số động nuốt.
  @Post('flashcards/drafts/accept')
  @Auth()
  acceptDrafts(
    @CurrentUser() user: UserContext,
    @Body(zodBody(acceptFlashcardDraftsSchema)) body: AcceptFlashcardDraftsInput,
  ) {
    return this.flashcards.acceptDrafts(user.userId, body);
  }

  @Patch('flashcards/drafts/:draftId')
  @Auth()
  patchDraft(
    @CurrentUser() user: UserContext,
    @Param('draftId', zodParam(idSchema)) draftId: string,
    @Body(zodBody(patchFlashcardDraftSchema)) body: PatchFlashcardDraftInput,
  ) {
    return this.flashcards.patchDraft(user.userId, draftId, body);
  }

  @Delete('flashcards/drafts/:draftId')
  @Auth()
  removeDraft(
    @CurrentUser() user: UserContext,
    @Param('draftId', zodParam(idSchema)) draftId: string,
  ) {
    return this.flashcards.removeDraft(user.userId, draftId);
  }
}
