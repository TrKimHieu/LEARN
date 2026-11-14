import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Deck, Flashcard, Prisma } from '@learn/db';
import type {
  CreateDeckInput,
  CreateFlashcardInput,
  DeckDetailResponse,
  DeckListResponse,
  DeckSummary,
  DueFlashcardsResponse,
  Flashcard as FlashcardDto,
  FlashcardReviewResult,
  PatchDeckInput,
  PatchFlashcardInput,
  SubmitFlashcardReviewInput,
} from '@learn/contracts';
import { ApiError } from '../../../core/exceptions/errors';
import { idempotencyKeyReused, isIdempotencyKeyViolation } from '../../../core/srs/idempotency';
import { reviewCard } from '../../../core/srs/review';
import { PrismaService } from '../../../infra/services';
import { FlashcardRepository, type DeckCounts } from '../infrastructure/flashcard.repository';

const NO_DECK = 'Không tìm thấy bộ thẻ.';
const NO_CARD = 'Không tìm thấy thẻ.';
const NO_COURSE = 'Không tìm thấy khóa học.';

/** Dấu vân tay body, để cùng key nhưng khác thẻ/mức nhớ/giờ chấm thì trả 409. */
const reviewFingerprint = (cardId: string, input: SubmitFlashcardReviewInput): string =>
  createHash('sha256')
    .update(JSON.stringify([cardId, input.grade, input.reviewedAt]))
    .digest('hex');

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
  constructor(
    private readonly repo: FlashcardRepository,
    private readonly prisma: PrismaService,
  ) {}

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

  /** Thẻ đến hạn của một bộ, hoặc mọi bộ khi `deckId = null` (hạn sớm nhất trước), kèm tổng số và hạn kế tiếp. */
  async dueCards(
    userId: string,
    deckId: string | null,
    limit: number,
  ): Promise<DueFlashcardsResponse> {
    if (deckId && !(await this.repo.findDeck(userId, deckId))) throw ApiError.notFound(NO_DECK);
    const now = new Date();
    const [cards, dueCount, nextDueAt] = await Promise.all([
      this.repo.listDue(userId, deckId, now, limit),
      this.repo.countDue(userId, deckId, now),
      this.repo.nextDueAt(userId, deckId, now),
    ]);
    return {
      cards: cards.map((c) => ({
        id: c.id,
        deckId: c.deckId,
        front: c.front,
        back: c.back,
        dueAt: c.dueAt.toISOString(),
        intervalDays: c.intervalDays,
        repetitions: c.repetitions,
      })),
      dueCount,
      nextDueAt: nextDueAt?.toISOString() ?? null,
    };
  }

  async review(
    userId: string,
    cardId: string,
    input: SubmitFlashcardReviewInput,
    idempotencyKey: string | null,
  ): Promise<FlashcardReviewResult> {
    const requestHash = idempotencyKey ? reviewFingerprint(cardId, input) : null;
    if (idempotencyKey && requestHash) {
      const prior = await this.replay(userId, idempotencyKey, requestHash);
      if (prior) return prior;
    }
    if (!(await this.repo.findCard(userId, cardId))) throw ApiError.notFound(NO_CARD);

    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const card = await this.repo.lockCard(tx, userId, cardId);
        if (!card) throw ApiError.notFound(NO_CARD);

        const outcome = reviewCard(card, input.grade, new Date(input.reviewedAt), new Date());
        if (outcome.applied) {
          await this.repo.updateSchedule(tx, card.id, {
            ...outcome.state,
            dueAt: outcome.dueAt,
            lastReviewedAt: outcome.reviewedAt,
          });
        }
        const result: FlashcardReviewResult = {
          cardId,
          dueAt: outcome.dueAt.toISOString(),
          intervalDays: outcome.state.intervalDays,
          repetitions: outcome.state.repetitions,
          easeFactor: outcome.state.easeFactor,
          applied: outcome.applied,
        };
        await this.repo.createReview(tx, {
          userId,
          flashcardId: cardId,
          grade: input.grade,
          reviewedAt: outcome.reviewedAt,
          idempotencyKey,
          requestHash,
          response: result as unknown as Prisma.InputJsonValue,
        });
        return result;
      });
    } catch (e) {
      // Lượt song song cùng key đã ghi trước: trả kết quả của lượt đó thay vì lỗi.
      if (idempotencyKey && requestHash && isIdempotencyKeyViolation(e)) {
        const prior = await this.replay(userId, idempotencyKey, requestHash);
        if (prior) return prior;
      }
      throw e;
    }
  }

  /** Kết quả đã lưu của lượt chấm cùng key; `null` khi chưa có. Khác nội dung → 409. */
  private async replay(
    userId: string,
    key: string,
    requestHash: string,
  ): Promise<FlashcardReviewResult | null> {
    const prior = await this.repo.findReviewByKey(userId, key);
    if (!prior) return null;
    if (prior.requestHash !== requestHash || !prior.response) throw idempotencyKeyReused();
    return prior.response as unknown as FlashcardReviewResult;
  }

  private async summary(userId: string, deck: Deck): Promise<DeckSummary> {
    const counts = await this.repo.countsByDeck(userId, [deck.id]);
    return toDeckSummary(deck, counts.get(deck.id)!);
  }

  private async assertCourse(userId: string, courseId: string): Promise<void> {
    if (!(await this.repo.courseOwnedBy(userId, courseId))) throw ApiError.notFound(NO_COURSE);
  }
}
