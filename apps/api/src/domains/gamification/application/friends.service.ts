import { Injectable } from '@nestjs/common';
import { newId, Prisma } from '@learn/db';
import type {
  FriendRequest,
  FriendsOverview,
  InviteFriendInput,
  InviteFriendResult,
  Leaderboard,
} from '@learn/contracts';
import { env } from '../../../environment';
import { ApiError } from '../../../core/exceptions/errors';
import { PrismaService } from '../../../infra/services';
import { localDayKey } from '../../../core/day-key';
import { weekStartKey } from './xp-rules';
import { EMAIL_INVITE_MESSAGE, MAX_FRIENDS, newFriendCode, rankWeekly } from './friends-rules';

const PENDING = 'PENDING';
const ACCEPTED = 'ACCEPTED';
const person = {
  select: { id: true, displayName: true, deletedAt: true, leaderboardHidden: true },
};

/**
 * Bạn học (spec 2026-11-20). Mọi truy vấn lọc theo người đang đăng nhập; người không phải bạn
 * không bao giờ thấy XP của nhau. Mời bằng email luôn trả cùng một câu để không dò được tài khoản.
 */
@Injectable()
export class FriendsService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  private assertEnabled() {
    if (!env.FRIENDS_ENABLED) throw ApiError.notFound();
  }

  async overview(userId: string, now = new Date()): Promise<FriendsOverview> {
    this.assertEnabled();
    const me = await this.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { friendCode: true, leaderboardHidden: true },
    });
    const myCode = me.friendCode ?? (await this.setNewCode(userId));
    const rows = await this.db.friendship.findMany({
      where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: { requester: person, addressee: person },
      orderBy: { createdAt: 'desc' },
    });

    const friends: Array<{ userId: string; displayName: string; hidden: boolean; since: Date }> =
      [];
    const incoming: FriendRequest[] = [];
    const outgoing: FriendRequest[] = [];
    for (const r of rows) {
      const mine = r.requesterId === userId;
      const other = mine ? r.addressee : r.requester;
      if (other.deletedAt) continue;
      if (r.status === ACCEPTED) {
        friends.push({
          userId: other.id,
          displayName: other.displayName,
          hidden: other.leaderboardHidden,
          since: r.acceptedAt ?? r.createdAt,
        });
      } else {
        (mine ? outgoing : incoming).push({
          id: r.id,
          userId: other.id,
          displayName: other.displayName,
          createdAt: r.createdAt.toISOString(),
        });
      }
    }

    const xp = await this.weeklyXp(
      friends.filter((f) => !f.hidden).map((f) => f.userId),
      now,
    );
    return {
      myCode,
      leaderboardHidden: me.leaderboardHidden,
      friends: friends
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'))
        .map((f) => ({
          userId: f.userId,
          displayName: f.displayName,
          xpThisWeek: f.hidden ? null : (xp.get(f.userId)?.xp ?? 0),
          since: f.since.toISOString(),
        })),
      incoming,
      outgoing,
    };
  }

  async rotateCode(userId: string): Promise<{ myCode: string }> {
    this.assertEnabled();
    return { myCode: await this.setNewCode(userId) };
  }

  async invite(userId: string, input: InviteFriendInput): Promise<InviteFriendResult> {
    this.assertEnabled();
    if ('code' in input) {
      const target = await this.db.user.findFirst({
        where: { friendCode: input.code, deletedAt: null },
        select: { id: true },
      });
      if (!target) throw ApiError.notFound('Không tìm thấy mã mời này.');
      if (target.id === userId) throw ApiError.badRequest('Đây là mã mời của chính bạn.');
      return { message: await this.connect(userId, target.id) };
    }

    const target = await this.db.user.findFirst({
      where: { email: input.email, deletedAt: null },
      select: { id: true },
    });
    if (target?.id === userId) throw ApiError.badRequest('Đây là email của chính bạn.');
    if (target) {
      // Lỗi trạng thái (đã là bạn, đủ 100 bạn) không được lộ ra qua email.
      await this.connect(userId, target.id).catch((e: unknown) => {
        if (!(e instanceof ApiError)) throw e;
      });
    }
    return { message: EMAIL_INVITE_MESSAGE };
  }

  async accept(userId: string, requestId: string): Promise<{ ok: true }> {
    this.assertEnabled();
    const req = await this.db.friendship.findFirst({
      where: { id: requestId, addresseeId: userId, status: PENDING },
      select: { requesterId: true },
    });
    if (!req) throw ApiError.notFound('Không tìm thấy lời mời.');
    await this.db.$transaction(async (tx) => {
      await this.lockPair(tx, userId, req.requesterId);
      await this.assertRoom(tx, userId);
      const { count } = await tx.friendship.updateMany({
        where: { id: requestId, status: PENDING },
        data: { status: ACCEPTED, acceptedAt: new Date() },
      });
      if (count === 0) throw ApiError.notFound('Không tìm thấy lời mời.');
    });
    return { ok: true };
  }

  /** Từ chối lời mời đến hoặc huỷ lời mời đã gửi. */
  async dropRequest(userId: string, requestId: string): Promise<{ ok: true }> {
    this.assertEnabled();
    const { count } = await this.db.friendship.deleteMany({
      where: {
        id: requestId,
        status: PENDING,
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
    });
    if (count === 0) throw ApiError.notFound('Không tìm thấy lời mời.');
    return { ok: true };
  }

  async remove(userId: string, friendId: string): Promise<{ ok: true }> {
    this.assertEnabled();
    const { count } = await this.db.friendship.deleteMany({
      where: {
        status: ACCEPTED,
        OR: [
          { requesterId: userId, addresseeId: friendId },
          { requesterId: friendId, addresseeId: userId },
        ],
      },
    });
    if (count === 0) throw ApiError.notFound('Không tìm thấy bạn học.');
    return { ok: true };
  }

  async leaderboard(userId: string, now = new Date()): Promise<Leaderboard> {
    this.assertEnabled();
    const rows = await this.db.friendship.findMany({
      where: { status: ACCEPTED, OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: { requester: person, addressee: person },
    });
    const me = await this.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, displayName: true },
    });
    const people = new Map([[me.id, me.displayName]]);
    for (const r of rows) {
      const other = r.requesterId === userId ? r.addressee : r.requester;
      if (!other.deletedAt && !other.leaderboardHidden) people.set(other.id, other.displayName);
    }
    const xp = await this.weeklyXp([...people.keys()], now);
    return {
      weekStart: weekStartKey(localDayKey(now, env.APP_TIMEZONE)),
      entries: rankWeekly(
        [...people].map(([id, displayName]) => ({
          userId: id,
          displayName,
          xp: xp.get(id)?.xp ?? 0,
          lastAt: xp.get(id)?.lastAt ?? null,
        })),
        userId,
      ),
    };
  }

  async updateSettings(userId: string, leaderboardHidden: boolean) {
    this.assertEnabled();
    await this.db.user.update({ where: { id: userId }, data: { leaderboardHidden } });
    return { leaderboardHidden };
  }

  /** Gửi lời mời; nếu người kia đã mời mình thì chấp nhận luôn. Trả câu báo cho người dùng. */
  private connect(me: string, other: string): Promise<string> {
    return this.db.$transaction(async (tx) => {
      await this.lockPair(tx, me, other);
      const existing = await tx.friendship.findFirst({
        where: {
          OR: [
            { requesterId: me, addresseeId: other },
            { requesterId: other, addresseeId: me },
          ],
        },
      });
      if (existing?.status === ACCEPTED) throw ApiError.conflict('Hai bạn đã là bạn học.');
      if (existing?.requesterId === me) return 'Bạn đã gửi lời mời này rồi.';
      await this.assertRoom(tx, me);
      if (existing) {
        await tx.friendship.update({
          where: { id: existing.id },
          data: { status: ACCEPTED, acceptedAt: new Date() },
        });
        return 'Đã kết bạn.';
      }
      await tx.friendship.create({
        data: { id: newId(), requesterId: me, addresseeId: other, status: PENDING },
      });
      return 'Đã gửi lời mời kết bạn.';
    });
  }

  /** Khoá theo cặp người để hai lời mời ngược chiều cùng lúc không tạo hai dòng. */
  private async lockPair(tx: Prisma.TransactionClient, a: string, b: string) {
    const key = a < b ? `friend:${a}:${b}` : `friend:${b}:${a}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }

  private async assertRoom(tx: Prisma.TransactionClient, userId: string) {
    const count = await tx.friendship.count({
      where: { status: ACCEPTED, OR: [{ requesterId: userId }, { addresseeId: userId }] },
    });
    if (count >= MAX_FRIENDS)
      throw ApiError.conflict(`Mỗi người có tối đa ${MAX_FRIENDS} bạn học.`);
  }

  private async weeklyXp(userIds: string[], now: Date) {
    const out = new Map<string, { xp: number; lastAt: Date | null }>();
    if (userIds.length === 0) return out;
    const groups = await this.db.xpEvent.groupBy({
      by: ['userId'],
      where: {
        userId: { in: userIds },
        day: { gte: weekStartKey(localDayKey(now, env.APP_TIMEZONE)) },
      },
      _sum: { amount: true },
      _max: { createdAt: true },
    });
    for (const g of groups) out.set(g.userId, { xp: g._sum.amount ?? 0, lastAt: g._max.createdAt });
    return out;
  }

  /** Sinh mã mới, thử lại khi trùng (32^8 khả năng nên gần như không bao giờ cần). */
  private async setNewCode(userId: string): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      const code = newFriendCode();
      try {
        await this.db.user.update({ where: { id: userId }, data: { friendCode: code } });
        return code;
      } catch (e) {
        const dup = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
        if (!dup || attempt >= 4) throw e;
      }
    }
  }
}
