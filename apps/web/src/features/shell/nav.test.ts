import { describe, expect, it } from 'vitest';
import { CREATE_ITEMS, DESKTOP_NAV_ITEMS, navItemsFor } from './nav';

describe('nav', () => {
  it('exposes all six learner destinations on desktop', () => {
    expect(DESKTOP_NAV_ITEMS.map(item => item.href)).toEqual([
      '/dashboard', '/courses', '/decks', '/focus', '/progress', '/friends',
    ]);
  });
  it('learner nav is Học, Khóa học, Thẻ, Tôi', () => {
    expect(navItemsFor('LEARNER').map((i) => i.label)).toEqual([
      'Học',
      'Khóa học',
      'Thẻ',
      'Tôi',
    ]);
  });
  it('create menu offers course, deck, AI cards', () => {
    expect(CREATE_ITEMS.map((i) => i.href)).toEqual([
      '/courses/new',
      '/decks?new=1',
      '/decks/generate',
    ]);
  });
});
