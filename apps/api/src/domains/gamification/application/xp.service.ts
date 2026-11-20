import { Injectable } from '@nestjs/common';
import { newId } from '@learn/db';
import type { Prisma } from '@learn/db';
import { env } from '../../../environment';
import { PrismaService } from '../../../infra/services';
import { localDayKey } from '../../learning/application/day-key';
import { DAILY_XP_CAP, grantable, weekStartKey, type XpSource } from './xp-rules';

export interface XpSummary {
  xpToday: number;
  xpThisWeek: number;
  xpTotal: number;
  dailyXpCap: number;
}

@Injectable()
export class XpService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ghi XP trong transaction của hành động học. Khoá tư vấn theo người dùng để hai hành động song
   * song không cùng đọc tổng hôm nay rồi cùng vượt trần. Khoá duy nhất (user, nguồn, mã, ngày) chặn
   * cộng hai lần một nguồn trong ngày (kể cả khi transaction thử lại). Trả số XP thật sự cộng.
   */
  async award(
    tx: Prisma.TransactionClient,
    input: { userId: string; source: XpSource; refId: string; amount: number },
    now = new Date(),
  ): Promise<number> {
    const day = localDayKey(now, env.APP_TIMEZONE);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'xp:' + input.userId}))`;
    const today = await tx.xpEvent.aggregate({
      where: { userId: input.userId, day },
      _sum: { amount: true },
    });
    const amount = grantable(input.amount, today._sum.amount ?? 0);
    if (amount <= 0) return 0;
    const { count } = await tx.xpEvent.createMany({
      data: [{ id: newId(), userId: input.userId, source: input.source, refId: input.refId, day, amount }],
      skipDuplicates: true,
    });
    return count > 0 ? amount : 0;
  }

  async summary(userId: string, now = new Date()): Promise<XpSummary> {
    const today = localDayKey(now, env.APP_TIMEZONE);
    const [day, week, total] = await Promise.all([
      this.prisma.client.xpEvent.aggregate({ where: { userId, day: today }, _sum: { amount: true } }),
      this.prisma.client.xpEvent.aggregate({
        where: { userId, day: { gte: weekStartKey(today) } },
        _sum: { amount: true },
      }),
      this.prisma.client.xpEvent.aggregate({ where: { userId }, _sum: { amount: true } }),
    ]);
    return {
      xpToday: day._sum.amount ?? 0,
      xpThisWeek: week._sum.amount ?? 0,
      xpTotal: total._sum.amount ?? 0,
      dailyXpCap: DAILY_XP_CAP,
    };
  }
}
