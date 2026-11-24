import { z } from 'zod';

/** Mã mời 8 ký tự: chữ in hoa và số, bỏ O/0/I/1 dễ nhầm (spec 2026-11-20). */
export const friendCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{8}$/, { message: 'Mã mời gồm 8 ký tự chữ và số.' });

/** Mời bằng mã hoặc bằng email (email luôn nhận cùng một câu trả lời, không lộ tài khoản). */
export const inviteFriendSchema = z.union([
  z.object({ code: friendCodeSchema }).strict(),
  z.object({ email: z.string().trim().toLowerCase().email().max(254) }).strict(),
]);

export const inviteFriendResultSchema = z.object({ message: z.string() });

/** Bạn bè thấy tên hiển thị và XP tuần; `null` khi người đó ẩn mình khỏi xếp hạng. */
export const friendSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  xpThisWeek: z.number().int().nullable(),
  since: z.string(),
});

export const friendRequestSchema = z.object({
  id: z.string(),
  userId: z.string(),
  displayName: z.string(),
  createdAt: z.string(),
});

export const friendsOverviewSchema = z.object({
  myCode: z.string(),
  leaderboardHidden: z.boolean(),
  friends: z.array(friendSchema),
  incoming: z.array(friendRequestSchema),
  outgoing: z.array(friendRequestSchema),
});

export const leaderboardEntrySchema = z.object({
  rank: z.number().int(),
  userId: z.string(),
  displayName: z.string(),
  xp: z.number().int(),
  me: z.boolean(),
});

/** Xếp hạng tuần trong nhóm bạn bè; tuần bắt đầu thứ Hai theo APP_TIMEZONE. */
export const leaderboardSchema = z.object({
  weekStart: z.string(),
  entries: z.array(leaderboardEntrySchema),
});

export const friendSettingsSchema = z.object({ leaderboardHidden: z.boolean() }).strict();

export type InviteFriendInput = z.infer<typeof inviteFriendSchema>;
export type InviteFriendResult = z.infer<typeof inviteFriendResultSchema>;
export type Friend = z.infer<typeof friendSchema>;
export type FriendRequest = z.infer<typeof friendRequestSchema>;
export type FriendsOverview = z.infer<typeof friendsOverviewSchema>;
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type Leaderboard = z.infer<typeof leaderboardSchema>;
export type FriendSettingsInput = z.infer<typeof friendSettingsSchema>;
