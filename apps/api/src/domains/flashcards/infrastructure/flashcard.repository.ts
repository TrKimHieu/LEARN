import { Injectable } from '@nestjs/common';
import { newId, Prisma } from '@learn/db';
import { PrismaService, type Db } from '../../../infra/services';

export interface DeckCounts {
  cardCount: number;
  newCount: number;
  learningCount: number;
  dueCount: number;
}

const EMPTY_COUNTS: DeckCounts = { cardCount: 0, newCount: 0, learningCount: 0, dueCount: 0 };

/**
 * Mọi truy vấn lọc chủ sở hữu và `deletedAt` ngay trong `where` (chống IDOR, AGENTS.md): không có
 * chỗ nào tải theo id rồi mới so chủ sở hữu.
 */
@Injectable()
export class FlashcardRepository {
  constructor(private readonly prisma: PrismaService) {}

  courseOwnedBy(userId: string, courseId: string) {
    return this.prisma.client.course.findFirst({
      where: { id: courseId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
  }

  createDeck(userId: string, title: string, courseId: string | null) {
    return this.prisma.client.deck.create({ data: { id: newId(), userId, title, courseId } });
  }

  listDecks(userId: string) {
    return this.prisma.client.deck.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
  }

  findDeck(userId: string, deckId: string) {
    return this.prisma.client.deck.findFirst({ where: { id: deckId, userId, deletedAt: null } });
  }

  /** Trả `null` khi bộ không thuộc người dùng hoặc đã xóa (cùng điều kiện với `findDeck`). */
  async updateDeck(
    userId: string,
    deckId: string,
    data: { title?: string; courseId?: string | null },
  ) {
    const res = await this.prisma.client.deck.updateMany({
      where: { id: deckId, userId, deletedAt: null },
      data,
    });
    return res.count === 0 ? null : this.findDeck(userId, deckId);
  }

  async softDeleteDeck(userId: string, deckId: string): Promise<boolean> {
    const res = await this.prisma.client.deck.updateMany({
      where: { id: deckId, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return res.count > 0;
  }

  /** Số thẻ theo bộ trong một truy vấn; bộ không có thẻ nào lấy 0. */
  async countsByDeck(userId: string, deckIds: string[]): Promise<Map<string, DeckCounts>> {
    const out = new Map<string, DeckCounts>(deckIds.map((id) => [id, { ...EMPTY_COUNTS }]));
    if (deckIds.length === 0) return out;
    const rows = await this.prisma.client.$queryRaw<Array<{ deckId: string } & DeckCounts>>(
      Prisma.sql`
        SELECT "deckId",
               COUNT(*)::int AS "cardCount",
               (COUNT(*) FILTER (WHERE "lastReviewedAt" IS NULL))::int AS "newCount",
               (COUNT(*) FILTER (WHERE "lastReviewedAt" IS NOT NULL))::int AS "learningCount",
               (COUNT(*) FILTER (WHERE "dueAt" <= NOW()))::int AS "dueCount"
        FROM "Flashcard"
        WHERE "userId" = ${userId} AND "deckId" IN (${Prisma.join(deckIds)})
        GROUP BY "deckId"`,
    );
    for (const { deckId, ...counts } of rows) out.set(deckId, counts);
    return out;
  }

  listCards(userId: string, deckId: string) {
    return this.prisma.client.flashcard.findMany({
      where: { deckId, userId, deck: { deletedAt: null } },
      orderBy: { createdAt: 'asc' },
    });
  }

  createCard(userId: string, deckId: string, front: string, back: string) {
    return this.prisma.client.flashcard.create({
      data: { id: newId(), userId, deckId, front, back, dueAt: new Date() },
    });
  }

  findCard(userId: string, cardId: string) {
    return this.prisma.client.flashcard.findFirst({
      where: { id: cardId, userId, deck: { deletedAt: null } },
    });
  }

  async updateCard(
    userId: string,
    cardId: string,
    data: { front?: string; back?: string; deckId?: string },
  ) {
    const res = await this.prisma.client.flashcard.updateMany({
      where: { id: cardId, userId, deck: { deletedAt: null } },
      data,
    });
    return res.count === 0 ? null : this.findCard(userId, cardId);
  }

  async deleteCard(userId: string, cardId: string): Promise<boolean> {
    const res = await this.prisma.client.flashcard.deleteMany({
      where: { id: cardId, userId, deck: { deletedAt: null } },
    });
    return res.count > 0;
  }

  private dueWhere(userId: string, deckId: string, now: Date): Prisma.FlashcardWhereInput {
    return { userId, deckId, deck: { deletedAt: null }, dueAt: { lte: now } };
  }

  /** Thẻ đến hạn của một bộ, hạn sớm nhất trước. */
  listDue(userId: string, deckId: string, now: Date, limit: number) {
    return this.prisma.client.flashcard.findMany({
      where: this.dueWhere(userId, deckId, now),
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
  }

  countDue(userId: string, deckId: string, now: Date) {
    return this.prisma.client.flashcard.count({ where: this.dueWhere(userId, deckId, now) });
  }

  async nextDueAt(userId: string, deckId: string, now: Date): Promise<Date | null> {
    const next = await this.prisma.client.flashcard.findFirst({
      where: { userId, deckId, deck: { deletedAt: null }, dueAt: { gt: now } },
      orderBy: { dueAt: 'asc' },
      select: { dueAt: true },
    });
    return next?.dueAt ?? null;
  }

  /** Khoá hàng thẻ (`FOR UPDATE`) rồi đọc: hai lượt chấm cùng thẻ xếp hàng, mỗi lượt thấy trạng thái lượt trước. */
  async lockCard(tx: Prisma.TransactionClient, userId: string, cardId: string) {
    await tx.$queryRaw`
      SELECT "id" FROM "Flashcard" WHERE "id" = ${cardId} AND "userId" = ${userId} FOR UPDATE
    `;
    return tx.flashcard.findFirst({
      where: { id: cardId, userId, deck: { deletedAt: null } },
    });
  }

  findReviewByKey(userId: string, idempotencyKey: string, db: Db = this.prisma.client) {
    return db.flashcardReview.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      select: { requestHash: true, response: true },
    });
  }

  async createReview(
    tx: Prisma.TransactionClient,
    row: {
      userId: string;
      flashcardId: string;
      grade: string;
      reviewedAt: Date;
      idempotencyKey: string | null;
      requestHash: string | null;
      response: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await tx.flashcardReview.create({ data: { id: newId(), ...row } });
  }

  async updateSchedule(
    tx: Prisma.TransactionClient,
    id: string,
    data: {
      easeFactor: number;
      intervalDays: number;
      repetitions: number;
      lapses: number;
      dueAt: Date;
      lastReviewedAt: Date;
    },
  ): Promise<void> {
    await tx.flashcard.update({ where: { id }, data });
  }
}
