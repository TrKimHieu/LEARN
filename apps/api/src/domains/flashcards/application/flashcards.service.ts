import { Injectable } from '@nestjs/common';
import type { Deck, Flashcard } from '@learn/db';
import type {
  CreateDeckInput,
  CreateFlashcardInput,
  DeckDetailResponse,
  DeckListResponse,
  DeckSummary,
  Flashcard as FlashcardDto,
  PatchDeckInput,
  PatchFlashcardInput,
} from '@learn/contracts';
import { ApiError } from '../../../core/exceptions/errors';
import { FlashcardRepository, type DeckCounts } from '../infrastructure/flashcard.repository';

const NO_DECK = 'Không tìm thấy bộ thẻ.';
const NO_CARD = 'Không tìm thấy thẻ.';
const NO_COURSE = 'Không tìm thấy khóa học.';

const toDeckSummary = (deck: Deck, counts: DeckCounts): DeckSummary => ({
  id: deck.id,
  title: deck.title,
  courseId: deck.courseId,
  ...counts,
  createdAt: deck.createdAt.toISOString(),
  updatedAt: deck.updatedAt.toISOString(),
});

const toFlashcard = (card: Flashcard): FlashcardDto => ({
  id: card.id,
  deckId: card.deckId,
  front: card.front,
  back: card.back,
  dueAt: card.dueAt.toISOString(),
  intervalDays: card.intervalDays,
  repetitions: card.repetitions,
  lastReviewedAt: card.lastReviewedAt?.toISOString() ?? null,
  createdAt: card.createdAt.toISOString(),
  updatedAt: card.updatedAt.toISOString(),
});

@Injectable()
export class FlashcardsService {
  constructor(private readonly repo: FlashcardRepository) {}

  async createDeck(userId: string, input: CreateDeckInput): Promise<DeckSummary> {
    if (input.courseId) await this.assertCourse(userId, input.courseId);
    const deck = await this.repo.createDeck(userId, input.title, input.courseId ?? null);
    return this.summary(userId, deck);
  }

  async listDecks(userId: string): Promise<DeckListResponse> {
    const decks = await this.repo.listDecks(userId);
    const counts = await this.repo.countsByDeck(
      userId,
      decks.map((d) => d.id),
    );
    return { decks: decks.map((d) => toDeckSummary(d, counts.get(d.id)!)) };
  }

  async patchDeck(userId: string, deckId: string, input: PatchDeckInput): Promise<DeckSummary> {
    if (input.courseId) await this.assertCourse(userId, input.courseId);
    const deck = await this.repo.updateDeck(userId, deckId, input);
    if (!deck) throw ApiError.notFound(NO_DECK);
    return this.summary(userId, deck);
  }

  async removeDeck(userId: string, deckId: string): Promise<{ id: string }> {
    if (!(await this.repo.softDeleteDeck(userId, deckId))) throw ApiError.notFound(NO_DECK);
    return { id: deckId };
  }

  async deckWithCards(userId: string, deckId: string): Promise<DeckDetailResponse> {
    const deck = await this.repo.findDeck(userId, deckId);
    if (!deck) throw ApiError.notFound(NO_DECK);
    const cards = await this.repo.listCards(userId, deckId);
    return { deck: await this.summary(userId, deck), cards: cards.map(toFlashcard) };
  }

  async createCard(
    userId: string,
    deckId: string,
    input: CreateFlashcardInput,
  ): Promise<FlashcardDto> {
    if (!(await this.repo.findDeck(userId, deckId))) throw ApiError.notFound(NO_DECK);
    return toFlashcard(await this.repo.createCard(userId, deckId, input.front, input.back));
  }

  async patchCard(
    userId: string,
    cardId: string,
    input: PatchFlashcardInput,
  ): Promise<FlashcardDto> {
    // Bộ đích phải của chính người dùng: nếu không, thẻ sẽ lọt sang dữ liệu người khác.
    if (input.deckId && !(await this.repo.findDeck(userId, input.deckId))) {
      throw ApiError.notFound(NO_DECK);
    }
    const card = await this.repo.updateCard(userId, cardId, input);
    if (!card) throw ApiError.notFound(NO_CARD);
    return toFlashcard(card);
  }

  async removeCard(userId: string, cardId: string): Promise<{ id: string }> {
    if (!(await this.repo.deleteCard(userId, cardId))) throw ApiError.notFound(NO_CARD);
    return { id: cardId };
  }

  private async summary(userId: string, deck: Deck): Promise<DeckSummary> {
    const counts = await this.repo.countsByDeck(userId, [deck.id]);
    return toDeckSummary(deck, counts.get(deck.id)!);
  }

  private async assertCourse(userId: string, courseId: string): Promise<void> {
    if (!(await this.repo.courseOwnedBy(userId, courseId))) throw ApiError.notFound(NO_COURSE);
  }
}
