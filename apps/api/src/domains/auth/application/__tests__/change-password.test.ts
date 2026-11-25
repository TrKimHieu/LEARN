import { describe, it, expect, vi } from 'vitest';
import { hashPassword } from '@learn/db';
import { AuthService } from '../auth.service';

async function setup() {
  const calls: string[] = [];
  const user = {
    id: 'u1',
    email: 'a@b.c',
    role: 'LEARNER',
    displayName: 'A',
    locale: 'vi',
    emailVerifiedAt: null,
    createdAt: new Date(0),
    passwordHash: await hashPassword('old-password'),
  };
  const users = {
    findById: vi.fn(async () => user),
    updatePasswordHash: vi.fn(async () => calls.push('updatePasswordHash')),
  };
  const refreshTokens = {
    revokeAllForUser: vi.fn(async (_u: string, tx?: unknown) =>
      calls.push(`revokeAll:${tx ? 'tx' : '-'}`),
    ),
    create: vi.fn(async (_h: unknown, tx?: unknown) => calls.push(`create:${tx ? 'tx' : '-'}`)),
  };
  const prisma = {
    client: { $transaction: async (fn: (tx: unknown) => unknown) => fn({ tx: true }) },
  };
  const security = { signAccessToken: vi.fn(async () => 'access') };
  const none = {} as never;
  const service = new AuthService(
    users as never,
    refreshTokens as never,
    none,
    none,
    prisma as never,
    security as never,
    none,
    none,
    none,
    none,
    none,
  );
  return { service, users, refreshTokens, calls };
}

describe('AuthService.changePassword', () => {
  it('thu hồi mọi phiên rồi cấp phiên mới trong cùng transaction', async () => {
    const t = await setup();
    const r = await t.service.changePassword(
      'u1',
      'old-password',
      'new-password-1',
      'ua',
      '1.2.3.4',
    );
    expect(t.calls).toEqual(['updatePasswordHash', 'revokeAll:tx', 'create:tx']);
    expect(r.accessToken).toBe('access');
    expect(r.refreshToken).toEqual(expect.any(String));
    expect(r.user).toMatchObject({ id: 'u1' });
  });

  it('sai mật khẩu hiện tại → 401, không đổi hash, không thu hồi phiên', async () => {
    const t = await setup();
    await expect(t.service.changePassword('u1', 'wrong', 'new-password-1')).rejects.toMatchObject({
      status: 401,
    });
    expect(t.users.updatePasswordHash).not.toHaveBeenCalled();
    expect(t.refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });
});
