/**
 * Template DSL — the declarative block language interpreted into a pdfmake
 * document. Deliberately not Turing-complete: blocks + bindings + repeaters +
 * conditions + formatters, nothing else. The block-type set is frozen; custom
 * layouts compose primitives rather than register code.
 *
 * A binding is a dot-path string (see {@link file://../accessor.ts}); a `when`
 * is a presence test; a `format` names a value formatter.
 */
import { z } from 'zod';
import { KSeFValidationError } from '../../errors/ksef-validation-error.js';
import type { FormatterName } from '../format.js';

export type TemplateSchemaId = 'FA(2)' | 'FA(3)' | 'UPO(4.2)' | 'UPO(4.3)';

/** Loose style bag mapping to pdfmake style props (fontSize, bold, color, …). */
export type Style = Record<string, string | number | boolean | Array<number>>;

export interface PageConfig {
  size?: string;
  orientation?: 'portrait' | 'landscape';
  margins?: [number, number, number, number];
}

/** A labeled reference: `{ label }` resolves via i18n, `{ text }` is literal. */
export interface LabelRef {
  label?: string;
  text?: string;
}

/** A column/field: label (i18n key) + binding path, optional formatter. */
export interface FieldDef {
  label: string;
  path: string;
  format?: FormatterName;
  style?: string;
}

// ── Semantic blocks ────────────────────────────────────────────────────────

export interface HeaderBlock {
  type: 'header';
  logo?: string;
  title?: LabelRef;
  number?: string;
  date?: string;
  style?: string;
}

export interface PartyColumn {
  label: string;
  fields: string[];
}

export interface PartiesBlock {
  type: 'parties';
  left: PartyColumn;
  right: PartyColumn;
  style?: string;
}

export interface LinesBlock {
  type: 'lines';
  from: string;
  columns: FieldDef[];
  style?: string;
}

export interface TotalsBlock {
  type: 'totals';
  rows: FieldDef[];
  style?: string;
}

export interface PaymentBlock {
  type: 'payment';
  when?: string;
  rows: FieldDef[];
  style?: string;
}

export interface AnnotationsBlock {
  type: 'annotations';
  fields: FieldDef[];
  style?: string;
}

export interface QrBlock {
  type: 'qr';
  when?: string;
  fit?: number;
}

export interface FooterBlock {
  type: 'footer';
  label?: string;
  text?: string;
  style?: string;
}

// ── Primitive blocks ───────────────────────────────────────────────────────

export interface TextBlock {
  type: 'text';
  text?: string;
  path?: string;
  label?: string;
  format?: FormatterName;
  when?: string;
  style?: string;
}

export interface ColumnsBlock {
  type: 'columns';
  columns: Block[];
  when?: string;
  style?: string;
}

export interface StackBlock {
  type: 'stack';
  stack: Block[];
  when?: string;
  style?: string;
}

export interface TableBlock {
  type: 'table';
  from?: string;
  columns: FieldDef[];
  headers?: boolean;
  when?: string;
  style?: string;
}

export interface ImageBlock {
  type: 'image';
  src?: string;
  path?: string;
  width?: number;
  when?: string;
}

export interface DividerBlock {
  type: 'divider';
  style?: string;
}

export interface SpacerBlock {
  type: 'spacer';
  height?: number;
}

export type Block =
  | HeaderBlock
  | PartiesBlock
  | LinesBlock
  | TotalsBlock
  | PaymentBlock
  | AnnotationsBlock
  | QrBlock
  | FooterBlock
  | TextBlock
  | ColumnsBlock
  | StackBlock
  | TableBlock
  | ImageBlock
  | DividerBlock
  | SpacerBlock;

export type BlockType = Block['type'];

export interface InvoiceTemplate {
  /** Binds this template to one XML kind; the engine rejects a version mismatch. */
  schema: TemplateSchemaId;
  page?: PageConfig;
  defaultStyle?: Style;
  styles?: Record<string, Style>;
  /** Per-template label overrides (merged over the i18n bundle). */
  labels?: Record<string, string>;
  blocks: Block[];
}

// ── zod validation ─────────────────────────────────────────────────────────

const formatEnum = z.enum(['money', 'date', 'number', 'nip']);
const styleValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.number())]);
const styleSchema = z.record(z.string(), styleValue);
const labelRef = z.object({ label: z.string().optional(), text: z.string().optional() }).strict();
const fieldDef = z
  .object({
    label: z.string(),
    path: z.string(),
    format: formatEnum.optional(),
    style: z.string().optional(),
  })
  .strict();

// Recursive block schema (containers embed blocks). z.lazy breaks the cycle.
const blockSchema: z.ZodType<Block> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('header'),
      logo: z.string().optional(),
      title: labelRef.optional(),
      number: z.string().optional(),
      date: z.string().optional(),
      style: z.string().optional(),
    }).strict(),
    z.object({
      type: z.literal('parties'),
      left: z.object({ label: z.string(), fields: z.array(z.string()) }).strict(),
      right: z.object({ label: z.string(), fields: z.array(z.string()) }).strict(),
      style: z.string().optional(),
    }).strict(),
    z.object({
      type: z.literal('lines'),
      from: z.string(),
      columns: z.array(fieldDef),
      style: z.string().optional(),
    }).strict(),
    z.object({ type: z.literal('totals'), rows: z.array(fieldDef), style: z.string().optional() }).strict(),
    z.object({
      type: z.literal('payment'),
      when: z.string().optional(),
      rows: z.array(fieldDef),
      style: z.string().optional(),
    }).strict(),
    z.object({ type: z.literal('annotations'), fields: z.array(fieldDef), style: z.string().optional() }).strict(),
    z.object({ type: z.literal('qr'), when: z.string().optional(), fit: z.number().optional() }).strict(),
    z.object({
      type: z.literal('footer'),
      label: z.string().optional(),
      text: z.string().optional(),
      style: z.string().optional(),
    }).strict(),
    z.object({
      type: z.literal('text'),
      text: z.string().optional(),
      path: z.string().optional(),
      label: z.string().optional(),
      format: formatEnum.optional(),
      when: z.string().optional(),
      style: z.string().optional(),
    }).strict(),
    z.object({
      type: z.literal('columns'),
      columns: z.array(blockSchema),
      when: z.string().optional(),
      style: z.string().optional(),
    }).strict(),
    z.object({
      type: z.literal('stack'),
      stack: z.array(blockSchema),
      when: z.string().optional(),
      style: z.string().optional(),
    }).strict(),
    z.object({
      type: z.literal('table'),
      from: z.string().optional(),
      columns: z.array(fieldDef),
      headers: z.boolean().optional(),
      when: z.string().optional(),
      style: z.string().optional(),
    }).strict(),
    z.object({
      type: z.literal('image'),
      src: z.string().optional(),
      path: z.string().optional(),
      width: z.number().optional(),
      when: z.string().optional(),
    }).strict(),
    z.object({ type: z.literal('divider'), style: z.string().optional() }).strict(),
    z.object({ type: z.literal('spacer'), height: z.number().optional() }).strict(),
  ]),
) as z.ZodType<Block>;

export const invoiceTemplateSchema: z.ZodType<InvoiceTemplate> = z
  .object({
    schema: z.enum(['FA(2)', 'FA(3)', 'UPO(4.2)', 'UPO(4.3)']),
    page: z
      .object({
        size: z.string().optional(),
        orientation: z.enum(['portrait', 'landscape']).optional(),
        margins: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
      })
      .strict()
      .optional(),
    defaultStyle: styleSchema.optional(),
    styles: z.record(z.string(), styleSchema).optional(),
    labels: z.record(z.string(), z.string()).optional(),
    blocks: z.array(blockSchema),
  })
  .strict() as z.ZodType<InvoiceTemplate>;

/**
 * Validate an untrusted template object. Throws {@link KSeFValidationError}
 * (with a flattened, path-tagged message per issue) on any structural problem —
 * unknown block type, missing required field, or extra keys.
 */
export function validateTemplate(input: unknown): InvoiceTemplate {
  const result = invoiceTemplateSchema.safeParse(input);
  if (!result.success) {
    const messages = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    });
    throw KSeFValidationError.fromMessages(messages);
  }
  return result.data;
}
