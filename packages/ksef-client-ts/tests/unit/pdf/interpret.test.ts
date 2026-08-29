import { describe, it, expect } from 'vitest';
import {
  resolveBinding,
  evalWhen,
  resolveText,
  interpretBlock,
  interpretTemplate,
  coreRegistry,
  MAX_DEPTH,
  type RenderContext,
  type BlockRegistry,
  type PdfNode,
} from '../../../src/pdf/template/interpret.js';
import { KSeFPdfError } from '../../../src/pdf/errors.js';
import type { Block, InvoiceTemplate } from '../../../src/pdf/template/dsl.js';

/** Build a RenderContext by hand; label is identity so keys pass through. */
function makeCtx(root: unknown, overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    root,
    strict: false,
    label: (k: string) => k,
    bindings: {},
    flags: {},
    ...overrides,
  };
}

/** Non-breaking space (U+00A0): the thousands separator emitted by formatMoney. */
const NBSP = String.fromCharCode(0x00a0);

const ROOT = {
  Fa: {
    P_1: '2025-01-15',
    P_2: 'FV/1/2025',
    P_15: '1234.5',
    Adnotacje: 'note',
  },
};

/** Narrow a returned node to a property bag for structural assertions. */
function asRecord(node: PdfNode | null): Record<string, unknown> {
  expect(node).toBeTypeOf('object');
  expect(node).not.toBeNull();
  return node as Record<string, unknown>;
}

// ── resolveBinding ──────────────────────────────────────────────────────────

describe('resolveBinding', () => {
  it('reads a non-XML binding by exact key before XML', () => {
    const ctx = makeCtx(ROOT, { bindings: { 'opts.logo': 'data:image/png;base64,AAAA' } });
    expect(resolveBinding('opts.logo', ctx)).toBe('data:image/png;base64,AAAA');
  });

  it('falls through to an XML dot-path when the key is not a binding', () => {
    expect(resolveBinding('Fa.P_2', makeCtx(ROOT))).toBe('FV/1/2025');
  });

  it('yields "" for a missing XML path in non-strict mode', () => {
    expect(resolveBinding('Fa.DoesNotExist', makeCtx(ROOT))).toBe('');
  });

  it('propagates a strict-mode throw for a missing XML path', () => {
    const ctx = makeCtx(ROOT, { strict: true });
    expect(() => resolveBinding('Fa.DoesNotExist', ctx)).toThrow(/Missing binding/);
  });

  it('does not apply strict mode to a resolved non-XML binding', () => {
    const ctx = makeCtx(ROOT, { strict: true, bindings: { hash: 'abc' } });
    expect(resolveBinding('hash', ctx)).toBe('abc');
  });

  it('coerces an undefined binding value to ""', () => {
    // The key is present but maps to undefined at runtime (defensive `?? ""`).
    const ctx = makeCtx(ROOT, { bindings: { hash: undefined as unknown as string } });
    expect(resolveBinding('hash', ctx)).toBe('');
  });
});

// ── evalWhen ────────────────────────────────────────────────────────────────

describe('evalWhen', () => {
  it('treats an undefined condition as visible', () => {
    expect(evalWhen(undefined, makeCtx(ROOT))).toBe(true);
  });

  it('reads a boolean flag when the key is a flag', () => {
    expect(evalWhen('qr', makeCtx(ROOT, { flags: { qr: true } }))).toBe(true);
    expect(evalWhen('qr', makeCtx(ROOT, { flags: { qr: false } }))).toBe(false);
  });

  it('treats a non-empty binding key as visible and an empty one as hidden', () => {
    expect(evalWhen('opts.ksefNumber', makeCtx(ROOT, { bindings: { 'opts.ksefNumber': 'KSEF-1' } }))).toBe(true);
    expect(evalWhen('opts.ksefNumber', makeCtx(ROOT, { bindings: { 'opts.ksefNumber': '' } }))).toBe(false);
  });

  it('falls back to an XML presence test when the key is neither flag nor binding', () => {
    expect(evalWhen('Fa.P_2', makeCtx(ROOT))).toBe(true);
    expect(evalWhen('Fa.Missing', makeCtx(ROOT))).toBe(false);
  });

  it('prefers a flag over a same-named binding', () => {
    const ctx = makeCtx(ROOT, { flags: { dup: false }, bindings: { dup: 'present' } });
    expect(evalWhen('dup', ctx)).toBe(false);
  });

  it('treats a binding key mapping to undefined as hidden (defensive `?? ""`)', () => {
    const ctx = makeCtx(ROOT, { bindings: { maybe: undefined as unknown as string } });
    expect(evalWhen('maybe', ctx)).toBe(false);
  });
});

// ── resolveText ─────────────────────────────────────────────────────────────

describe('resolveText', () => {
  it('resolves a { label } ref through the label resolver', () => {
    expect(resolveText({ label: 'seller' }, makeCtx(ROOT))).toBe('seller');
  });

  it('returns a { text } literal verbatim', () => {
    expect(resolveText({ text: 'Literal' }, makeCtx(ROOT))).toBe('Literal');
  });

  it('resolves a { path } binding and applies the formatter', () => {
    expect(resolveText({ path: 'Fa.P_1', format: 'date' }, makeCtx(ROOT))).toBe('15.01.2025');
  });

  it('resolves a { path } binding unformatted when no format is given', () => {
    expect(resolveText({ path: 'Fa.P_2' }, makeCtx(ROOT))).toBe('FV/1/2025');
  });

  it('returns "" for an undefined spec', () => {
    expect(resolveText(undefined, makeCtx(ROOT))).toBe('');
  });

  it('returns "" for an empty spec (no label/text/path)', () => {
    expect(resolveText({}, makeCtx(ROOT))).toBe('');
  });
});

// ── interpretBlock: primitives + control ────────────────────────────────────

describe('interpretBlock core primitives', () => {
  it('renders a text block', () => {
    const node = asRecord(interpretBlock({ type: 'text', text: 'Hello' }, makeCtx(ROOT), coreRegistry, 0));
    expect(node).toEqual({ text: 'Hello' });
  });

  it('attaches a style to a text block', () => {
    const node = asRecord(
      interpretBlock({ type: 'text', text: 'Hello', style: 'h1' }, makeCtx(ROOT), coreRegistry, 0),
    );
    expect(node).toEqual({ text: 'Hello', style: 'h1' });
  });

  it('renders a text block from a formatted path binding', () => {
    const block: Block = { type: 'text', path: 'Fa.P_15', format: 'money' };
    const node = asRecord(interpretBlock(block, makeCtx(ROOT), coreRegistry, 0));
    expect(node).toEqual({ text: `1${NBSP}234,50` });
  });

  it('renders a stack, flattening and dropping hidden children', () => {
    const block: Block = {
      type: 'stack',
      stack: [
        { type: 'text', text: 'a' },
        { type: 'text', text: 'hidden', when: 'Fa.Missing' },
        { type: 'text', text: 'b' },
      ],
    };
    const node = asRecord(interpretBlock(block, makeCtx(ROOT), coreRegistry, 0));
    expect(node).toEqual({ stack: [{ text: 'a' }, { text: 'b' }] });
  });

  it('renders columns with a style', () => {
    const block: Block = {
      type: 'columns',
      style: 'row',
      columns: [
        { type: 'text', text: 'left' },
        { type: 'text', text: 'right' },
      ],
    };
    const node = asRecord(interpretBlock(block, makeCtx(ROOT), coreRegistry, 0));
    expect(node).toEqual({ columns: [{ text: 'left' }, { text: 'right' }], style: 'row' });
  });

  it('renders a divider canvas line', () => {
    const node = asRecord(interpretBlock({ type: 'divider' }, makeCtx(ROOT), coreRegistry, 0));
    expect(node).toEqual({
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }],
    });
  });

  it('attaches a style to a divider', () => {
    const node = asRecord(
      interpretBlock({ type: 'divider', style: 'rule' }, makeCtx(ROOT), coreRegistry, 0),
    );
    expect(node.style).toBe('rule');
  });

  // An empty text node still occupies a line, so the spacer is an empty canvas:
  // the block must add exactly its height, not its height plus a phantom line.
  it('renders a spacer with the default height', () => {
    const node = asRecord(interpretBlock({ type: 'spacer' }, makeCtx(ROOT), coreRegistry, 0));
    expect(node).toEqual({ canvas: [], margin: [0, 0, 0, 8] });
  });

  it('renders a spacer with a custom height', () => {
    const node = asRecord(interpretBlock({ type: 'spacer', height: 20 }, makeCtx(ROOT), coreRegistry, 0));
    expect(node).toEqual({ canvas: [], margin: [0, 0, 0, 20] });
  });

  it('spacer carries no text node, so it adds no line of its own', () => {
    const node = asRecord(interpretBlock({ type: 'spacer', height: 20 }, makeCtx(ROOT), coreRegistry, 0));
    expect(node.text).toBeUndefined();
  });

  it('returns null for a block whose `when` is false', () => {
    const block: Block = { type: 'text', text: 'x', when: 'Fa.Missing' };
    expect(interpretBlock(block, makeCtx(ROOT), coreRegistry, 0)).toBeNull();
  });

  it('renders a block whose `when` is true', () => {
    const block: Block = { type: 'text', text: 'x', when: 'Fa.P_2' };
    expect(interpretBlock(block, makeCtx(ROOT), coreRegistry, 0)).toEqual({ text: 'x' });
  });
});

describe('interpretBlock errors + depth', () => {
  it('throws KSeFPdfError for an unknown block type', () => {
    const block = { type: 'nope' } as unknown as Block;
    expect(() => interpretBlock(block, makeCtx(ROOT), coreRegistry, 0)).toThrow(KSeFPdfError);
  });

  it('throws KSeFPdfError when no renderer is registered (empty registry)', () => {
    const block: Block = { type: 'text', text: 'x' };
    expect(() => interpretBlock(block, makeCtx(ROOT), {}, 0)).toThrow(
      /No renderer registered/,
    );
  });

  it('throws KSeFPdfError when nesting exceeds MAX_DEPTH', () => {
    let block: Block = { type: 'text', text: 'deep' };
    for (let i = 0; i < MAX_DEPTH + 5; i++) {
      block = { type: 'stack', stack: [block] };
    }
    expect(() => interpretBlock(block, makeCtx(ROOT), coreRegistry, 0)).toThrow(KSeFPdfError);
    expect(() => interpretBlock(block, makeCtx(ROOT), coreRegistry, 0)).toThrow(
      new RegExp(`maximum depth of ${MAX_DEPTH}`),
    );
  });
});

// ── interpretTemplate ───────────────────────────────────────────────────────

/** Assemble an InvoiceTemplate literal (only the fields the interpreter reads). */
function makeTemplate(partial: Partial<InvoiceTemplate> & { blocks: Block[] }): InvoiceTemplate {
  return { schema: 'FA(3)', ...partial } as InvoiceTemplate;
}

describe('interpretTemplate', () => {
  it('wires content and a Roboto default style', () => {
    const template = makeTemplate({ blocks: [{ type: 'text', text: 'Hello' }] });
    const doc = interpretTemplate(template, makeCtx(ROOT));
    expect(doc.content).toEqual([{ text: 'Hello' }]);
    expect(doc.defaultStyle).toEqual({ font: 'Roboto', fontSize: 9 });
  });

  it('merges a template defaultStyle over the Roboto default', () => {
    const template = makeTemplate({
      blocks: [{ type: 'text', text: 'x' }],
      defaultStyle: { fontSize: 11, color: '#333' },
    });
    const doc = interpretTemplate(template, makeCtx(ROOT));
    // Roboto font is kept; fontSize overridden; extra prop merged in.
    expect(doc.defaultStyle).toEqual({ font: 'Roboto', fontSize: 11, color: '#333' });
  });

  it('wires named styles when present', () => {
    const styles = { h1: { fontSize: 14, bold: true } };
    const template = makeTemplate({ blocks: [{ type: 'text', text: 'x' }], styles });
    const doc = interpretTemplate(template, makeCtx(ROOT));
    expect(doc.styles).toEqual(styles);
  });

  it('omits styles when the template has none', () => {
    const template = makeTemplate({ blocks: [{ type: 'text', text: 'x' }] });
    const doc = interpretTemplate(template, makeCtx(ROOT));
    expect('styles' in doc).toBe(false);
  });

  it('wires page size/orientation/margins when present', () => {
    const template = makeTemplate({
      blocks: [{ type: 'text', text: 'x' }],
      page: { size: 'A4', orientation: 'landscape', margins: [10, 20, 30, 40] },
    });
    const doc = interpretTemplate(template, makeCtx(ROOT));
    expect(doc.pageSize).toBe('A4');
    expect(doc.pageOrientation).toBe('landscape');
    expect(doc.pageMargins).toEqual([10, 20, 30, 40]);
  });

  it('omits page props when the page config is partial or absent', () => {
    const template = makeTemplate({ blocks: [{ type: 'text', text: 'x' }], page: {} });
    const doc = interpretTemplate(template, makeCtx(ROOT));
    expect('pageSize' in doc).toBe(false);
    expect('pageOrientation' in doc).toBe(false);
    expect('pageMargins' in doc).toBe(false);
  });

  it('omits hidden blocks from content', () => {
    const template = makeTemplate({
      blocks: [
        { type: 'text', text: 'visible' },
        { type: 'text', text: 'gone', when: 'Fa.Missing' },
      ],
    });
    const doc = interpretTemplate(template, makeCtx(ROOT));
    expect(doc.content).toEqual([{ text: 'visible' }]);
  });

  it('flattens an array-returning custom renderer into content', () => {
    const registry: BlockRegistry = {
      qr: () => [{ text: 'a' }, { text: 'b' }],
    };
    const template = makeTemplate({
      blocks: [{ type: 'text', text: 'first' }, { type: 'qr' }],
    });
    const doc = interpretTemplate(template, makeCtx(ROOT), registry);
    expect(doc.content).toEqual([{ text: 'first' }, { text: 'a' }, { text: 'b' }]);
  });

  it('lets a custom registry override a core primitive', () => {
    const registry: BlockRegistry = {
      text: () => ({ text: 'OVERRIDDEN' }),
    };
    const template = makeTemplate({ blocks: [{ type: 'text', text: 'orig' }] });
    const doc = interpretTemplate(template, makeCtx(ROOT), registry);
    expect(doc.content).toEqual([{ text: 'OVERRIDDEN' }]);
  });
});
