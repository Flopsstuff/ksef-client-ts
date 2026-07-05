/**
 * DSL interpreter: walks a validated {@link InvoiceTemplate} and emits a pdfmake
 * document-definition content tree. Blocks are dispatched through a registry so
 * renderers can be authored independently; containers recurse through a
 * depth-guarded `render` callback rather than importing the interpreter, which
 * keeps the module graph acyclic.
 *
 * Nodes are typed loosely (`PdfNode`) on purpose — the public `./pdf` types must
 * not depend on `@types/pdfmake` (the optional peer). We assert node *structure*
 * in tests, never bytes.
 */
import { get, has } from '../accessor.js';
import { applyFormat, type FormatterName } from '../format.js';
import { KSeFPdfError } from '../errors.js';
import type { LabelResolver } from '../i18n/index.js';
import type { Block, BlockType, InvoiceTemplate, Style } from './dsl.js';

/** A pdfmake content node — a string or a property bag. Intentionally loose. */
export type PdfNode = string | Record<string, unknown>;
export type PdfContent = PdfNode | PdfNode[];

/** Maximum block-nesting depth before the interpreter bails out. */
export const MAX_DEPTH = 24;

/** Derived, non-XML bindings (computed aliases + resolved options). */
export interface RenderContext {
  /** Parsed XML root (compact object). */
  root: unknown;
  /** Throw on a missing binding instead of yielding `''`. */
  strict: boolean;
  /** i18n label resolver bound to the chosen locale. */
  label: LabelResolver;
  /**
   * Non-XML bindings by exact key: `opts.logo`, `opts.ksefNumber`, `hash`,
   * `qrUrl`, `hasKsefNumber`, … . Looked up before falling through to XML.
   */
  bindings: Record<string, string>;
  /** Boolean aliases for `when` (e.g. `hasKsefNumber`, `qr`). */
  flags: Record<string, boolean>;
}

/** Recurse into a child block (depth-guarded); `null` when the child is hidden. */
export type RenderChild = (child: Block) => PdfContent | null;

/** A block renderer: pure (block, ctx) → pdfmake node(s), or `null` if hidden. */
export type BlockRenderer<B extends Block = Block> = (
  block: B,
  ctx: RenderContext,
  render: RenderChild,
) => PdfContent | null;

export type BlockRegistry = Partial<Record<BlockType, BlockRenderer>>;

/** Resolve a binding path across the three namespaces (non-XML, then XML). */
export function resolveBinding(path: string, ctx: RenderContext): string {
  if (path in ctx.bindings) return ctx.bindings[path] ?? '';
  return get(ctx.root, path, ctx.strict);
}

/** Evaluate a `when` condition: a boolean alias, else an XML presence test. */
export function evalWhen(when: string | undefined, ctx: RenderContext): boolean {
  if (when === undefined) return true;
  if (when in ctx.flags) return ctx.flags[when] === true;
  if (when in ctx.bindings) return (ctx.bindings[when] ?? '') !== '';
  return has(ctx.root, when);
}

/** Read a `{ label }`/`{ text }` ref or a literal binding into a string. */
export function resolveText(
  spec: { text?: string; path?: string; label?: string; format?: FormatterName } | undefined,
  ctx: RenderContext,
): string {
  if (!spec) return '';
  if (spec.label !== undefined) return ctx.label(spec.label);
  if (spec.text !== undefined) return spec.text;
  if (spec.path !== undefined) return applyFormat(resolveBinding(spec.path, ctx), spec.format);
  return '';
}

function withStyle(node: Record<string, unknown>, style: string | undefined): PdfNode {
  return style ? { ...node, style } : node;
}

// ── Core (interpreter-native) primitive renderers ──────────────────────────

const coreRegistry: BlockRegistry = {
  text: (block, ctx) => {
    const b = block as import('./dsl.js').TextBlock;
    return withStyle({ text: resolveText(b, ctx) }, b.style);
  },

  stack: (block, _ctx, render) => {
    const b = block as import('./dsl.js').StackBlock;
    const stack = b.stack.map((c) => render(c)).filter((n): n is PdfContent => n !== null).flat();
    return withStyle({ stack }, b.style);
  },

  columns: (block, _ctx, render) => {
    const b = block as import('./dsl.js').ColumnsBlock;
    const columns = b.columns.map((c) => render(c)).filter((n): n is PdfContent => n !== null).flat();
    return withStyle({ columns }, b.style);
  },

  divider: (block) => {
    const b = block as import('./dsl.js').DividerBlock;
    return withStyle(
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }] },
      b.style,
    );
  },

  spacer: (block) => {
    const b = block as import('./dsl.js').SpacerBlock;
    return { text: '', margin: [0, (b.height ?? 8) / 2, 0, (b.height ?? 8) / 2] };
  },
};

/**
 * Interpret one block. Enforces the depth limit, resolves the renderer from the
 * registry (unknown type → error), and hands the renderer a depth-incremented
 * `render` callback for its children.
 */
export function interpretBlock(
  block: Block,
  ctx: RenderContext,
  registry: BlockRegistry,
  depth: number,
): PdfContent | null {
  if (depth > MAX_DEPTH) {
    throw new KSeFPdfError(`Template nesting exceeds the maximum depth of ${MAX_DEPTH}`);
  }
  // `when` is handled centrally: a hidden block never reaches its renderer, so
  // renderers stay free of visibility logic.
  const when = (block as { when?: string }).when;
  if (when !== undefined && !evalWhen(when, ctx)) return null;

  const renderer = registry[block.type];
  if (!renderer) {
    throw new KSeFPdfError(`No renderer registered for block type "${block.type}"`);
  }
  const render: RenderChild = (child) => interpretBlock(child, ctx, registry, depth + 1);
  return renderer(block, ctx, render);
}

/**
 * Interpret a whole template into a pdfmake document definition. Merges the
 * caller-provided renderers over the core primitives, wires template styles,
 * and forces the bundled Roboto font (the only font shipped in the VFS).
 */
export function interpretTemplate(
  template: InvoiceTemplate,
  ctx: RenderContext,
  registry: BlockRegistry = {},
): Record<string, unknown> {
  const merged: BlockRegistry = { ...coreRegistry, ...registry };
  const content: PdfNode[] = [];
  for (const block of template.blocks) {
    const node = interpretBlock(block, ctx, merged, 0);
    if (node === null) continue;
    if (Array.isArray(node)) content.push(...node);
    else content.push(node);
  }

  const defaultStyle: Style = { font: 'Roboto', fontSize: 9, ...(template.defaultStyle ?? {}) };
  const doc: Record<string, unknown> = { content, defaultStyle };
  if (template.styles) doc.styles = template.styles;
  if (template.page) {
    if (template.page.size) doc.pageSize = template.page.size;
    if (template.page.orientation) doc.pageOrientation = template.page.orientation;
    if (template.page.margins) doc.pageMargins = template.page.margins;
  }
  return doc;
}

export { coreRegistry };
