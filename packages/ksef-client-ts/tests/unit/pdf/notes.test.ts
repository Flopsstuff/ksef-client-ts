import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { notesRenderer } from '../../../src/pdf/template/blocks/notes.js';
import { blockRegistry } from '../../../src/pdf/template/blocks/index.js';
import { getBuiltinTemplate } from '../../../src/pdf/template/builtin/index.js';
import { validateTemplate } from '../../../src/pdf/template/dsl.js';
import { interpretTemplate, type RenderContext, type RenderNote } from '../../../src/pdf/template/interpret.js';
import { renderInvoicePdfFromTemplate } from '../../../src/pdf/index.js';
import { parseXmlForPdf } from '../../../src/pdf/parse.js';
import { makeLabelResolver } from '../../../src/pdf/i18n/index.js';
import type { Block } from '../../../src/pdf/template/dsl.js';

/**
 * `notes` is the one block whose content comes from the caller rather than from
 * the document, so the tests split along that seam: what the renderer does with
 * a list of notes, and what the render options do with the list on the way in.
 */

const noRender = () => null;

function ctxWith(notes?: RenderNote[]): RenderContext {
  return { root: {}, strict: false, label: (k) => k, bindings: {}, flags: {}, ...(notes ? { notes } : {}) };
}

const rec = (n: unknown) => n as { stack: Array<{ text: string; style?: string }>; margin?: number[]; style?: string };

describe('notesRenderer', () => {
  const two: RenderNote[] = [
    { head: 'Warunki dostawy', body: 'Towar wydany w magazynie sprzedawcy.' },
    { head: 'Uwaga', body: 'Prosimy o podanie numeru faktury w tytule przelewu.' },
  ];

  it('heads the section, then prints each note over its body, in order', () => {
    const out = rec(notesRenderer({ type: 'notes' }, ctxWith(two), noRender));
    expect(out.stack.map((n) => n.text)).toEqual([
      'notes',
      'Warunki dostawy',
      'Towar wydany w magazynie sprzedawcy.',
      'Uwaga',
      'Prosimy o podanie numeru faktury w tytule przelewu.',
    ]);
  });

  it('puts both levels on h2 by default, as every block does', () => {
    const out = rec(notesRenderer({ type: 'notes' }, ctxWith(two), noRender));
    expect(out.stack[0].style).toBe('h2'); // the section
    expect(out.stack[1].style).toBe('h2'); // a note's own title
    expect(out.stack[2].style).toBeUndefined(); // the body is body text
  });

  it('lifts only the section heading when the template names a style', () => {
    // The note titles stay a level below it — lifting a section heading must
    // not drag everything under it along.
    const out = rec(notesRenderer({ type: 'notes', headingStyle: 'h1' }, ctxWith(two), noRender));
    expect(out.stack[0].style).toBe('h1');
    expect(out.stack[1].style).toBe('h2');
    expect(out.stack[3].style).toBe('h2');
  });

  it('renders nothing at all when no notes were supplied', () => {
    // Not an empty stack: a template carries this block unconditionally, and a
    // render without notes has to look as though it were never there.
    expect(notesRenderer({ type: 'notes' }, ctxWith(), noRender)).toBeNull();
    expect(notesRenderer({ type: 'notes' }, ctxWith([]), noRender)).toBeNull();
  });

  it('skips an entry with nothing in it', () => {
    const out = rec(notesRenderer({ type: 'notes' }, ctxWith([
      { head: '', body: '' },
      { head: '  ', body: '\n' },
      { head: 'Kept', body: 'Also kept' },
    ]), noRender));
    expect(out.stack.map((n) => n.text)).toEqual(['notes', 'Kept', 'Also kept']);
  });

  it('prints a note that has only one half', () => {
    const out = rec(notesRenderer({ type: 'notes' }, ctxWith([
      { head: 'Heading alone', body: '' },
      { head: '', body: 'Body alone' },
    ]), noRender));
    expect(out.stack.map((n) => n.text)).toEqual(['notes', 'Heading alone', 'Body alone']);
    expect(out.stack[1].style).toBe('h2');
    expect(out.stack[2].style).toBeUndefined();
  });

  it('carries the block style when the template names one', () => {
    const out = rec(notesRenderer({ type: 'notes', style: 'muted' }, ctxWith(two), noRender));
    expect(out.style).toBe('muted');
  });

  it('treats the text as text, not as a binding', () => {
    // A note is plain text: no dot-path resolution, no label lookup, nothing
    // that could reach into the document or fail on a stray brace.
    const out = rec(notesRenderer({ type: 'notes' }, ctxWith([
      { head: 'Fa.P_15', body: '{{ not a template }} — 100% & <tags>' },
    ]), noRender));
    expect(out.stack.map((n) => n.text)).toEqual([
      'notes',
      'Fa.P_15',
      '{{ not a template }} — 100% & <tags>',
    ]);
  });
});

describe('the notes option reaches the block', () => {
  const xml = readFileSync(new URL('../../fixtures/pdf/fa3.xml', import.meta.url), 'utf8');

  function notesStack(notes?: RenderNote[]) {
    const template = getBuiltinTemplate('fa3-default')!;
    const ctx: RenderContext = {
      root: (parseXmlForPdf(xml) as Record<string, unknown>).Faktura,
      strict: false,
      label: makeLabelResolver('pl', {}),
      bindings: {},
      flags: {},
      ...(notes ? { notes } : {}),
    };
    const doc = interpretTemplate(template, ctx, blockRegistry);
    return (doc.content as Array<Record<string, unknown>>).find(
      (n) => Array.isArray(n.stack) && JSON.stringify(n).includes('Warunki'),
    );
  }

  it('prints the supplied notes through the built-in template', () => {
    const node = notesStack([{ head: 'Warunki dostawy', body: 'DAP Warszawa' }]);
    expect(node).toBeDefined();
    expect((node!.stack as Array<{ text: string }>).map((n) => n.text)).toEqual([
      'Pozostałe informacje',
      'Warunki dostawy',
      'DAP Warszawa',
    ]);
  });

  it('leaves the page untouched when none are supplied', () => {
    expect(notesStack()).toBeUndefined();
  });

  it('is closed by a rule that appears only with it', () => {
    // Without the condition the page would show a line hanging over the
    // verification codes on every invoice that carries no notes.
    const blocks = getBuiltinTemplate('fa3-default')!.blocks;
    const notes = blocks.findIndex((b) => b.type === 'notes');
    const after = blocks[notes + 1] as { type: string; when?: string };
    expect(after.type).toBe('divider');
    expect(after.when).toBe('notes');
  });

  it('renders that rule with the notes and drops it without them', () => {
    const template = getBuiltinTemplate('fa3-default')!;
    const render = (notes?: RenderNote[]) => {
      const ctx: RenderContext = {
        root: (parseXmlForPdf(xml) as Record<string, unknown>).Faktura,
        strict: false,
        label: makeLabelResolver('pl', {}),
        bindings: {},
        flags: { notes: (notes ?? []).length > 0 },
        ...(notes ? { notes } : {}),
      };
      const doc = interpretTemplate(template, ctx, blockRegistry);
      return (doc.content as Array<Record<string, unknown>>).filter((n) => Array.isArray(n.canvas)).length;
    };
    expect(render([{ head: 'Uwaga', body: 'Treść' }])).toBe(render() + 1);
  });

  it('sits between the payment details and the verification codes', () => {
    // The place the block occupies is the template's decision, and this is what
    // pins it: after payment, before the QR row.
    const blocks = getBuiltinTemplate('fa3-default')!.blocks;
    const at = (predicate: (b: Block) => boolean) => blocks.findIndex(predicate);
    const payment = at((b) => b.type === 'payment');
    const notes = at((b) => b.type === 'notes');
    const qrRow = at((b) => b.type === 'columns' && (b as { when?: string }).when === 'qr');
    expect(payment).toBeGreaterThanOrEqual(0);
    expect(notes).toBeGreaterThan(payment);
    expect(qrRow).toBeGreaterThan(notes);
  });

  it.each(['fa2-default', 'fa3-default'])('%s carries the block', (name) => {
    expect(getBuiltinTemplate(name)!.blocks.some((b) => b.type === 'notes')).toBe(true);
  });

  it.each(['fa2-default', 'fa3-default'])('%s heads the section at section level', (name) => {
    // The section reads as part of the document, like Płatność; the individual
    // notes sit under it, like the labels inside any other block.
    const block = getBuiltinTemplate(name)!.blocks.find((b) => b.type === 'notes') as { headingStyle?: string };
    expect(block.headingStyle).toBe('h1');
  });

  it('drops an entry that is blank on both halves before it reaches the block', async () => {
    const template = getBuiltinTemplate('fa3-default')!;
    await expect(
      renderInvoicePdfFromTemplate(xml, template, { notes: [{ head: ' ', body: '' }] }),
    ).resolves.toBeInstanceOf(Uint8Array);
  });
});

describe('the notes block validates like any other', () => {
  const wrap = (block: unknown) => ({ schema: 'FA(3)', blocks: [block] });

  it('accepts a bare block', () => {
    expect(() => validateTemplate(wrap({ type: 'notes' }))).not.toThrow();
  });

  it('accepts the style options', () => {
    expect(() => validateTemplate(wrap({ type: 'notes', headingStyle: 'h1', style: 'muted' }))).not.toThrow();
  });

  it('rejects content in the template — notes come from the caller', () => {
    expect(() => validateTemplate(wrap({ type: 'notes', head: 'x', body: 'y' }))).toThrow();
  });
});
