import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { has, list } from '../../../src/pdf/accessor.js';
import { parseXmlForPdf } from '../../../src/pdf/parse.js';
import { getBuiltinTemplate, builtinTemplateNames } from '../../../src/pdf/template/builtin/index.js';
import type { Block, PartyField, TotalsBlock } from '../../../src/pdf/template/dsl.js';

/**
 * Strict mode throws on a missing *scalar* binding, which catches dot-path
 * typos in the values a template prints. It deliberately cannot do the same for
 * `when` conditions and repeater `from` paths: `Platnosc` is `minOccurs="0"` in
 * the FA schemas and `RachunekBankowy` is `minOccurs="0" maxOccurs="100"`, so an
 * absent node there is a cash-paid invoice, not a mistake — making those throw
 * would break strict rendering of perfectly valid documents.
 *
 * The typo risk is real all the same: a misspelled `when` silently hides its
 * block and a misspelled `from` silently yields a header-only table, and the
 * strict-mode fixture test would pass either way. This lint closes that gap
 * where it can be closed without weakening the public contract — our own
 * templates against fixtures that populate every path they reference.
 */

const FIXTURE_BY_TEMPLATE: Record<string, string> = {
  'fa2-default': 'pdf/fa2.xml',
  'fa3-default': 'pdf/fa3.xml',
  'fa3-showcase': 'pdf/fa3.xml',
  'upo-4_2': 'pdf/upo-4_2.xml',
  'upo-4_3': 'pdf/upo-4_3.xml',
};

/** `when` values resolved from the render context, not from the XML. */
const CONTEXT_CONDITIONS = new Set([
  'qr', 'offline', 'hasKsefNumber', 'totalsBuckets', 'totalsSummary', 'notes',
  'opts.logo', 'opts.ksefNumber', 'opts.accent', 'qrUrl',
]);

interface CollectedPaths {
  conditions: string[];
  repeaters: string[];
  /** `firstOf` alternative sets — at least one member must resolve. */
  alternatives: string[][];
}

function collect(
  blocks: Block[],
  acc: CollectedPaths = { conditions: [], repeaters: [], alternatives: [] },
): CollectedPaths {
  for (const block of blocks) {
    const when = (block as { when?: string }).when;
    if (when !== undefined && !CONTEXT_CONDITIONS.has(when)) acc.conditions.push(when);

    if (block.type === 'totals') {
      for (const row of block.rows) {
        if (row.when !== undefined && !CONTEXT_CONDITIONS.has(row.when)) acc.conditions.push(row.when);
      }
    }
    if (block.type === 'lines') acc.repeaters.push(block.from);
    if (block.type === 'table' && block.from !== undefined) acc.repeaters.push(block.from);
    if (block.type === 'each') acc.repeaters.push(block.from);
    if (block.type === 'payment' && block.accounts) acc.repeaters.push(block.accounts.from);
    if (block.type === 'parties') {
      const walkFields = (fields: PartyField[]): void => {
        for (const field of fields) {
          if (typeof field === 'string') continue;
          if ('fields' in field) {
            if (field.from !== undefined) acc.repeaters.push(field.from);
            walkFields(field.fields);
          } else if ('firstOf' in field) {
            acc.alternatives.push(field.firstOf);
          }
          // `{ path, optional }` is a plain binding; strict covers the ones that
          // are not marked, and an optional one is absent by design.
        }
      };
      walkFields(block.left.fields);
      walkFields(block.right.fields);
    }

    if (block.type === 'stack') collect(block.stack, acc);
    if (block.type === 'columns') collect(block.columns, acc);
    // `each` rebinds the root to one entry, so its children's paths are
    // item-relative and cannot be resolved against the document root here.
    // Its own `from` is checked above.
  }
  return acc;
}

function bodyOf(templateName: string): unknown {
  const template = getBuiltinTemplate(templateName)!;
  const xml = readFileSync(new URL(`../../fixtures/${FIXTURE_BY_TEMPLATE[templateName]}`, import.meta.url), 'utf8');
  const parsed = parseXmlForPdf(xml) as Record<string, unknown>;
  return parsed[template.schema.startsWith('UPO') ? 'Potwierdzenie' : 'Faktura'];
}

describe('built-in template lint', () => {
  it('covers every built-in template', () => {
    expect(builtinTemplateNames().sort()).toEqual(Object.keys(FIXTURE_BY_TEMPLATE).sort());
  });

  it.each(Object.keys(FIXTURE_BY_TEMPLATE))('%s: every `when` path resolves against its fixture', (name) => {
    const root = bodyOf(name);
    const { conditions } = collect(getBuiltinTemplate(name)!.blocks);
    const unresolved = conditions.filter((path) => !has(root, path));
    expect(unresolved).toEqual([]);
  });

  it.each(Object.keys(FIXTURE_BY_TEMPLATE))('%s: every repeater `from` path resolves against its fixture', (name) => {
    const root = bodyOf(name);
    const { repeaters } = collect(getBuiltinTemplate(name)!.blocks);
    const empty = repeaters.filter((path) => list(root, path).length === 0);
    expect(empty).toEqual([]);
  });

  it.each(Object.keys(FIXTURE_BY_TEMPLATE))(
    '%s: every `firstOf` set has at least one path that resolves',
    (name) => {
      const root = bodyOf(name);
      const { alternatives } = collect(getBuiltinTemplate(name)!.blocks);
      // Individual alternatives are absent by design (a buyer carries one
      // identifier), but a set where *none* resolves means every path is wrong.
      const dead = alternatives.filter((paths) => !paths.some((p) => has(root, p)));
      expect(dead).toEqual([]);
    },
  );

  it.each(['fa2-default', 'fa3-default'])(
    '%s: the amount due and at least one rate bucket resolve',
    (name) => {
      // Totals rows are read leniently — they print only when present — so
      // `strict` cannot police them. This is what catches a typo instead.
      const root = bodyOf(name);
      const totals = getBuiltinTemplate(name)!.blocks.find((b) => b.type === 'totals') as TotalsBlock;
      const due = totals.rows.find((r) => r.label === 'totalDue')!;
      expect(has(root, due.path!), 'the amount due must resolve').toBe(true);
      const buckets = totals.rows.filter((r) => r.when === 'totalsBuckets' && r.path);
      expect(buckets.some((r) => has(root, r.path!)), 'no rate bucket resolves').toBe(true);
    },
  );

  it('actually inspects some paths (guards against a walker that finds nothing)', () => {
    const fa3 = collect(getBuiltinTemplate('fa3-default')!.blocks);
    expect(fa3.conditions).toContain('Fa.Platnosc');
    expect(fa3.repeaters).toContain('Fa.FaWiersz');
    expect(fa3.repeaters).toContain('Fa.Platnosc.RachunekBankowy');
    expect(fa3.repeaters).toContain('Podmiot2.DaneKontaktowe');
    expect(collect(getBuiltinTemplate('upo-4_3')!.blocks).repeaters).toContain('Dokument');
    expect(collect(getBuiltinTemplate('upo-4_2')!.blocks).repeaters).toContain('Dokument');
    expect(fa3.alternatives).toHaveLength(1);
    expect(fa3.alternatives[0]).toContain('Podmiot2.DaneIdentyfikacyjne.NrID');
  });

  it('fails a template whose `when` path is misspelled', () => {
    const root = bodyOf('fa3-default');
    expect(has(root, 'Fa.Platnosc')).toBe(true);
    expect(has(root, 'Fa.Platnsoc')).toBe(false); // the typo this lint exists to catch
  });

  /**
   * pdfmake silently ignores a style name it does not know, so a renamed or
   * mistyped style reference costs nothing at render time and everything on the
   * page. Nothing else checks this: the DSL types a style as a plain string.
   *
   * Several keys name a style — `style` itself, plus the per-block overrides
   * `headingStyle`, `linkStyle` and `offlineStyle` — so the walk takes any key
   * that ends in `Style` and a new one is covered the day it is added.
   */
  it.each(Object.keys(FIXTURE_BY_TEMPLATE))('%s: every style it references is defined', (name) => {
    const template = getBuiltinTemplate(name)!;
    const defined = Object.keys(template.styles ?? {});
    const referenced = new Set<string>();
    const namesAStyle = (key: string) => key === 'style' || key.endsWith('Style');
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value === null || typeof value !== 'object') return;
      for (const [key, inner] of Object.entries(value)) {
        if (namesAStyle(key) && typeof inner === 'string') referenced.add(inner);
        else walk(inner);
      }
    };
    walk(template);
    expect([...referenced].filter((style) => !defined.includes(style))).toEqual([]);
  });

  it('the style walk actually finds the per-block overrides', () => {
    // Guards the `endsWith('Style')` rule above: before it, `linkStyle` and
    // `offlineStyle` were invisible to this lint.
    const json = JSON.stringify(getBuiltinTemplate('fa3-default'));
    for (const key of ['"linkStyle"', '"offlineStyle"']) {
      expect(json, `${key} is no longer in the template — retarget this guard`).toContain(key);
    }
  });

  it.each(Object.keys(FIXTURE_BY_TEMPLATE))('%s: defines the heading styles its blocks will use', (name) => {
    // A heading belongs to its block, not to the template, so the block reaches
    // for a style name instead of being handed one — `h2` unless `headingStyle`
    // says otherwise, and `title` for the header. Nothing in the JSON refers to
    // those defaults, so a template that omits them loses its headings silently.
    const template = getBuiltinTemplate(name)!;
    const defined = Object.keys(template.styles ?? {});
    expect(defined).toContain('title');

    const printsHeading = template.blocks.filter((b) => ['parties', 'payment', 'annotations'].includes(b.type));
    const headings = printsHeading.map((b) => (b as { headingStyle?: string }).headingStyle ?? 'h2');
    // Sub-headings inside those blocks — `Adres`, `Rachunek bankowy` — sit one
    // level down and stay at `h2` whatever the block heading is set to, so `h2`
    // has to exist too even when nothing names it.
    if (printsHeading.length > 0) headings.push('h2');
    expect(headings.filter((style) => !defined.includes(style))).toEqual([]);
  });

  it('fails a template whose repeater path is misspelled', () => {
    const root = bodyOf('fa3-default');
    expect(list(root, 'Fa.FaWiersz').length).toBeGreaterThan(0);
    expect(list(root, 'Fa.FaWierzs')).toEqual([]);
  });
});
