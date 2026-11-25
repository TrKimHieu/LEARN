import { describe, expect, it } from 'vitest';
import { planAction } from './plan-action';

const FREE = { code: 'FREE', priceCents: 0, isFutureExtension: false };
const PRO = { code: 'PRO', priceCents: 900, isFutureExtension: false };
const TEAM = { code: 'TEAM', priceCents: 0, isFutureExtension: true };
const all = (code: string | null, authed: boolean) =>
  [FREE, PRO, TEAM].map((p) => planAction(p, code, authed));

describe('planAction', () => {
  it('guest: Pro asks to log in, Team is soon', () => {
    expect(all(null, false)).toEqual(['none', 'login', 'soon']);
  });
  it('free user can upgrade to Pro', () => {
    expect(all('FREE', true)).toEqual(['current', 'upgrade', 'soon']);
  });
  it('authed without subscription counts as FREE', () => {
    expect(all(null, true)).toEqual(['current', 'upgrade', 'soon']);
  });
  it('pro user can cancel Pro; Free card has no button', () => {
    expect(all('PRO', true)).toEqual(['none', 'cancel', 'soon']);
  });
});
