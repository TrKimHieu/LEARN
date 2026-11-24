import { describe, expect, it, vi } from 'vitest';
import { FriendsService } from '../friends.service';
import { EMAIL_INVITE_MESSAGE } from '../friends-rules';

function service(opts: {
  target: { id: string } | null;
  existing?: { status: string; requesterId: string };
}) {
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    friendship: {
      findFirst: vi.fn(async () => (opts.existing ? { id: 'f1', ...opts.existing } : null)),
      count: vi.fn(async () => 0),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
  };
  const client = {
    user: { findFirst: vi.fn(async () => opts.target) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { svc: new FriendsService({ client } as never), tx };
}

describe('FriendsService.invite bằng email', () => {
  it('cùng một câu dù email có tài khoản, không có, hay đã là bạn', async () => {
    const none = service({ target: null });
    const found = service({ target: { id: 'u2' } });
    const already = service({
      target: { id: 'u2' },
      existing: { status: 'ACCEPTED', requesterId: 'u2' },
    });
    for (const { svc } of [none, found, already]) {
      await expect(svc.invite('u1', { email: 'x@example.com' })).resolves.toEqual({
        message: EMAIL_INVITE_MESSAGE,
      });
    }
    expect(found.tx.friendship.create).toHaveBeenCalledOnce();
    expect(none.tx.friendship.create).not.toHaveBeenCalled();
  });

  it('người kia đã mời mình thì chấp nhận luôn', async () => {
    const { svc, tx } = service({
      target: { id: 'u2' },
      existing: { status: 'PENDING', requesterId: 'u2' },
    });
    await expect(svc.invite('u1', { code: 'ABCDEFGH' })).resolves.toEqual({
      message: 'Đã kết bạn.',
    });
    expect(tx.friendship.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ACCEPTED' }) }),
    );
  });

  it('mời chính mình bằng mã thì báo lỗi', async () => {
    const { svc } = service({ target: { id: 'u1' } });
    await expect(svc.invite('u1', { code: 'ABCDEFGH' })).rejects.toMatchObject({ status: 400 });
  });
});
