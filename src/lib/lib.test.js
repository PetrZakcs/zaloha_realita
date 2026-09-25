import { keysLabel } from './plural';
import { buildCatalog, ALL_CARDS } from './cards';

test('keysLabel uses Czech plural forms', () => {
  expect(keysLabel(0)).toBe('0 klíčů');
  expect(keysLabel(1)).toBe('1 klíč');
  expect(keysLabel(3)).toBe('3 klíče');
  expect(keysLabel(5)).toBe('5 klíčů');
  expect(keysLabel(undefined)).toBe('0 klíčů');
});

test('buildCatalog appends mystery box pool items without duplicating static cards', () => {
  const pool = [
    { card_key: 'box-common-1', title: 'Signál', rarity: 'common' },
    { card_key: ALL_CARDS[0].key, title: 'Duplicate', rarity: 'rare' },
  ];
  const catalog = buildCatalog(pool);
  expect(catalog).toHaveLength(ALL_CARDS.length + 1);
  expect(catalog[catalog.length - 1]).toMatchObject({ key: 'box-common-1', title: 'Signál' });
});
