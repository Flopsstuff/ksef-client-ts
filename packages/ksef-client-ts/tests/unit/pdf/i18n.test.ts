import { describe, it, expect } from 'vitest';
import { resolveLabel, makeLabelResolver } from '../../../src/pdf/i18n/index.js';

describe('resolveLabel', () => {
  it('resolves a Polish label from the pl bundle', () => {
    expect(resolveLabel('seller', 'pl')).toBe('Sprzedawca');
  });

  it('resolves an English label from the en bundle', () => {
    expect(resolveLabel('seller', 'en')).toBe('Seller');
  });

  it('joins pl and en with the default " / " separator for pl+en', () => {
    expect(resolveLabel('seller', 'pl+en')).toBe('Sprzedawca / Seller');
  });

  it('honours a custom bilingual separator', () => {
    expect(resolveLabel('seller', 'pl+en', { bilingualSeparator: '\n' })).toBe(
      'Sprzedawca\nSeller',
    );
  });

  it('lets an override win over the bundle (pl)', () => {
    expect(resolveLabel('seller', 'pl', { overrides: { seller: 'Wystawca' } })).toBe('Wystawca');
  });

  it('lets an override win over the bundle (en)', () => {
    expect(resolveLabel('seller', 'en', { overrides: { seller: 'Vendor' } })).toBe('Vendor');
  });

  it('applies overrides to both halves of a bilingual label', () => {
    expect(
      resolveLabel('seller', 'pl+en', { overrides: { seller: 'X' } }),
    ).toBe('X / X');
  });

  it('joins en and pl in that order for en+pl', () => {
    expect(resolveLabel('seller', 'en+pl')).toBe('Seller / Sprzedawca');
  });

  it('en+pl is exactly pl+en reversed', () => {
    const [a, b] = resolveLabel('seller', 'pl+en').split(' / ');
    expect(resolveLabel('seller', 'en+pl')).toBe(`${b} / ${a}`);
  });

  it('honours the separator for en+pl', () => {
    expect(resolveLabel('seller', 'en+pl', { bilingualSeparator: ' | ' })).toBe('Seller | Sprzedawca');
  });

  it('applies overrides to both halves of en+pl too', () => {
    expect(resolveLabel('seller', 'en+pl', { overrides: { seller: 'X' } })).toBe('X / X');
  });

  it('falls back to the raw key when the key is unknown in every bundle', () => {
    expect(resolveLabel('totally-unknown-key', 'en')).toBe('totally-unknown-key');
  });

  it('falls back to the raw key for a bilingual unknown key on both sides', () => {
    expect(resolveLabel('totally-unknown-key', 'pl+en')).toBe(
      'totally-unknown-key / totally-unknown-key',
    );
  });
});

describe('makeLabelResolver', () => {
  it('returns a bound resolver capturing the locale', () => {
    const resolve = makeLabelResolver('en');
    expect(resolve('buyer')).toBe('Buyer');
    expect(resolve('seller')).toBe('Seller');
  });

  it('captures bilingual options in the bound resolver', () => {
    const resolve = makeLabelResolver('pl+en', { bilingualSeparator: ' | ' });
    expect(resolve('buyer')).toBe('Nabywca | Buyer');
  });

  it('captures overrides in the bound resolver', () => {
    const resolve = makeLabelResolver('pl', { overrides: { buyer: 'Klient' } });
    expect(resolve('buyer')).toBe('Klient');
  });
});
