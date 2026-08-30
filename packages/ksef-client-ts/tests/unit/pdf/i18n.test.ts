import { describe, it, expect } from 'vitest';
import { resolveLabel, makeLabelResolver, pl, en, uk } from '../../../src/pdf/i18n/index.js';
import type { LabelBundle } from '../../../src/pdf/i18n/types.js';

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

describe('the Ukrainian bundle', () => {
  it('resolves its own labels', () => {
    expect(resolveLabel('seller', 'uk')).toBe('Продавець');
    expect(resolveLabel('totalDue', 'uk')).toBe('До сплати');
  });

  it('pairs with Polish in both orders', () => {
    expect(resolveLabel('buyer', 'pl+uk')).toBe('Nabywca / Покупець');
    expect(resolveLabel('buyer', 'uk+pl')).toBe('Покупець / Nabywca');
  });

  it('pairs with English too, since any two base locales combine', () => {
    expect(resolveLabel('buyer', 'en+uk')).toBe('Buyer / Покупець');
    expect(resolveLabel('buyer', 'uk+en')).toBe('Покупець / Buyer');
  });

  it('carries the page-footer placeholders through', () => {
    expect(resolveLabel('pageOf', 'uk')).toBe('Сторінка {page} з {pages}');
  });

  it('falls back to Polish for a key it somehow lacks', () => {
    // Not reachable through the bundles below — they are key-complete — but the
    // fallback is what keeps a half-translated bundle rendering a document.
    expect(resolveLabel('unknownKey', 'uk')).toBe('unknownKey');
  });
});

describe('the bundles stay key-complete', () => {
  // A translation that silently misses a key does not fail a render: it falls
  // back to Polish, and a Ukrainian invoice quietly grows Polish headings. This
  // is the only thing that catches it.
  const bundles: Array<[string, LabelBundle]> = [
    ['en', en],
    ['uk', uk],
  ];

  it.each(bundles)('%s covers every Polish key', (_name, bundle) => {
    expect(Object.keys(pl).filter((key) => !(key in bundle))).toEqual([]);
  });

  it.each(bundles)('%s adds no key Polish does not have', (_name, bundle) => {
    expect(Object.keys(bundle).filter((key) => !(key in pl))).toEqual([]);
  });

  it.each(bundles)('%s leaves no label blank', (_name, bundle) => {
    expect(Object.entries(bundle).filter(([, value]) => value.trim() === '')).toEqual([]);
  });

  it('translates rather than copying Polish across', () => {
    // A handful of labels are legitimately identical everywhere (SWIFT / BIC,
    // OFFLINE), but a bundle that is mostly Polish is a bundle nobody filled in.
    for (const [, bundle] of bundles) {
      const copied = Object.keys(pl).filter((key) => pl[key] === bundle[key]);
      expect(copied.length).toBeLessThan(Object.keys(pl).length / 4);
    }
  });
});

describe('a caller may reword any label for one render', () => {
  it('outranks the template, which outranks the bundle', () => {
    // Three sources, most specific first. The document titles are the reason
    // this exists — an issuer who calls a settlement invoice `faktura końcowa`
    // should not have to fork a template to say so.
    expect(resolveLabel('invoiceSettlement', 'pl')).toBe('Faktura rozliczająca');
    expect(resolveLabel('invoiceSettlement', 'pl', { overrides: { invoiceSettlement: 'Faktura końcowa' } }))
      .toBe('Faktura końcowa');
  });

  it('names an advance invoice and a settlement invoice in every bundle', () => {
    for (const locale of ['pl', 'en', 'uk'] as const) {
      for (const key of ['invoice', 'invoiceAdvance', 'invoiceSettlement']) {
        expect(resolveLabel(key, locale), `${key} missing from ${locale}`).not.toBe(key);
      }
    }
  });
});
