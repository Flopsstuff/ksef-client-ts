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

/**
 * A running footer drawn in the bottom page margin, on every page: the tool that
 * produced the document on the left, the page indicator on the right. Unlike the
 * `footer` block — which is one inline node in the content flow — this repeats
 * and can count pages, which a block cannot: only pdfmake knows the page total,
 * and only once the content has been laid out.
 */
export interface PageFooterConfig {
  /**
   * Style for the footer line. The attribution text itself is not configurable —
   * a template may restyle or omit the footer, but not reword the credit.
   */
  style?: string;
}

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
  /**
   * The document may legitimately omit this binding, so `strict` must not throw
   * on it. Mark exactly the paths the KSeF schema declares optional: everything
   * left unmarked is a field the document must carry, and a strict render turns
   * its absence — almost always a dot-path typo — into an error instead of a
   * blank line.
   */
  optional?: boolean;
  format?: FormatterName;
  style?: string;
  /**
   * A second binding appended after the value, separated by a space — an amount
   * and its currency are one fact and read as one (`800,00 EUR`), not as two
   * lines a reader has to join up. Dropped when it resolves empty, and read at
   * the same strictness as the value it follows.
   */
  suffixPath?: string;
}

/**
 * A table column. `width` maps to pdfmake's column sizing: a number is an
 * explicit point width, `'auto'` fits the content, and `'*'` shares out what is
 * left. Sizing matters more than it looks — pdfmake gives every `'*'` column the
 * *same* width, and that shared width cannot go below the widest minimum content
 * width among them, so one long unbreakable token (a KSeF number, a base64 hash)
 * inflates every column and pushes the table off the page. Default `'*'`.
 */
export interface ColumnDef extends FieldDef {
  width?: number | 'auto' | '*';
  /**
   * Secondary fields printed as one extra line under the cell's own value —
   * `PKWiU 71.20.19.0 · Indeks ABC-1`. Each is `label value`, and an entry that
   * resolves empty is left out entirely, so a column may list every classifier
   * the schema allows (`Indeks`, `GTIN`, `PKWiU`, `CN`, `PKOB`) and each line
   * shows only the one or two a given item actually carries. A column can only
   * be one width for the whole table, so classifiers cannot each have a column
   * of their own without leaving most invoices with several empty ones.
   */
  sub?: FieldDef[];
  /** Style for the `sub` line. Set it smaller: it is a footnote to the value. */
  subStyle?: string;
  /** Separator between `sub` entries. Default `' · '`. */
  subSeparator?: string;
}

/**
 * Blocks that print a heading of their own reach for a style name rather than
 * being given one, because the heading is theirs and not the template's.
 * `headingStyle` overrides that name per block.
 *
 * It reaches only the block's *own* heading — the first line it prints, like
 * `Sprzedawca` or `Płatność`. Labels nested inside a block (`Adres`, `Dane
 * kontaktowe`, `Rachunek bankowy`) are one level down and stay at `h2` whatever
 * the block heading does, so a template can lift its section headings without
 * dragging every label in the document along. Both default to `h2`, which is
 * what the built-in templates rely on, so leaving the option out is the normal
 * case.
 *
 * @see HEADING_STYLE_DOC — referenced from each block that takes the option.
 */
export const HEADING_STYLE_DOC = 'h2';

// ── Semantic blocks ────────────────────────────────────────────────────────

export interface HeaderBlock {
  type: 'header';
  logo?: string;
  /**
   * Logo width in points; the height follows the image's aspect ratio. Default
   * 120, which suits a wide wordmark — a square mark needs far less.
   */
  logoWidth?: number;
  title?: LabelRef;
  number?: string;
  date?: string;
  /**
   * Binding for the KSeF number, printed in the same right-hand stack as
   * `number` and `date`. Skipped when it resolves empty, so an offline
   * visualization does not print a dangling label.
   */
  ksefNumber?: string;
  /**
   * Style for the OFFLINE marker, which takes the place of the KSeF number
   * line when that number resolves empty — the invoice is not registered yet.
   * Setting it is what asks for the marker at all; without it the line is
   * simply left out. Needs `ksefNumber`, whose slot the marker occupies.
   */
  offlineStyle?: string;
  style?: string;
}

/**
 * One line of a party panel: a binding path, or a set of paths of which the
 * first non-empty one is printed. KSeF identifies a counterparty by exactly one
 * of `NIP` / `NrVatUE` / `NrID` / `BrakID`, depending on where they are
 * established, so a panel bound to `NIP` alone has nothing to print for a
 * foreign buyer. Alternatives are read leniently — the ones that do not apply
 * are absent by design, not by mistake.
 */
export type PartyField =
  | string
  | { path: string; optional?: boolean }
  | { firstOf: string[] }
  | PartyGroup;

/**
 * A labelled sub-group inside a party panel — the address, say. The label is a
 * sub-heading in the panel's own heading style; `style` applies to the group's
 * value lines. The whole group, heading included, is dropped when none of its
 * fields resolve, so a counterparty without an address leaves no orphan label.
 */
export interface PartyGroup {
  label: string;
  /**
   * Repeat the group's fields once per entry of this collection, with each entry
   * as the binding root (so `fields` hold item-relative paths). KSeF allows up
   * to three `DaneKontaktowe` blocks per party, and a scalar path would silently
   * print only the first. Entries are read leniently: every field of a contact
   * block is optional, so an absent one is by design, not a typo.
   */
  from?: string;
  fields: PartyField[];
  style?: string;
}

export interface PartyColumn {
  label: string;
  /**
   * Style for the panel's own value lines — the counterparty's identity, since
   * everything below it lives in a labelled group. A group without a `style` of
   * its own inherits this one, so a panel styles uniformly by default and a
   * group overrides only where it wants to differ. Headings are unaffected.
   */
  style?: string;
  fields: PartyField[];
}

export interface PartiesBlock {
  type: 'parties';
  left: PartyColumn;
  right: PartyColumn;
  /** See {@link HEADING_STYLE_DOC}. The panel labels only, not the group labels. */
  headingStyle?: string;
  style?: string;
}

export interface LinesBlock {
  type: 'lines';
  from: string;
  columns: ColumnDef[];
  style?: string;
}

/**
 * One totals line. A KSeF invoice has no single "total net"/"total VAT" field —
 * net sales are split across `P_13_*` rate buckets and the tax across `P_14_*`
 * — so a row reads either one path or the decimal sum of several. Exactly one
 * of `path`/`sum` must be given.
 */
export interface TotalsRow {
  label: string;
  path?: string;
  /** See {@link FieldDef.optional}. A `sum` is always read leniently. */
  optional?: boolean;
  /** Binding paths to add up; absent buckets are skipped. */
  sum?: string[];
  /**
   * Visibility condition, evaluated like any other `when`. The built-in
   * templates gate their per-bucket rows on `totalsBuckets` and their computed
   * summary on `totalsSummary`, so {@link RenderOptions.totals} picks which of
   * the two a reader gets without the template changing shape.
   */
  when?: string;
  format?: FormatterName;
  style?: string;
}

export interface TotalsBlock {
  type: 'totals';
  rows: TotalsRow[];
  style?: string;
}

/**
 * A repeating group of bank-account fields under a payment block. `from` names
 * the account collection (read as an always-array), `fields` are the per-account
 * label:value lines, and `heading` is an optional i18n sub-heading printed once
 * when at least one account resolves.
 */
export interface PaymentAccounts {
  from: string;
  heading?: string;
  fields: FieldDef[];
}

export interface PaymentBlock {
  type: 'payment';
  when?: string;
  rows: FieldDef[];
  accounts?: PaymentAccounts;
  /** See {@link HEADING_STYLE_DOC}. The block label only, not `accounts.heading`. */
  headingStyle?: string;
  style?: string;
}

/**
 * Placeholder for the sections the caller passes to the render, printed in
 * order, each as a heading over its body. The template decides *where* they go
 * and how they look; the content comes from {@link RenderOptions.notes} and is
 * not in the document at all. The block renders nothing when no notes were
 * supplied, so a template can carry it unconditionally.
 */
export interface NotesBlock {
  type: 'notes';
  /** See {@link HEADING_STYLE_DOC}. Applies to each note's heading. */
  headingStyle?: string;
  style?: string;
}

export interface AnnotationsBlock {
  type: 'annotations';
  fields: FieldDef[];
  /** See {@link HEADING_STYLE_DOC}. */
  headingStyle?: string;
  style?: string;
}

/**
 * One KSeF verification QR. `code` picks which one: `'invoice'` is Code I,
 * derived from the document; `'certificate'` is Code II, which only offline
 * invoices carry and which the caller must supply as a ready-made URL.
 *
 * `fit` is the printed side in points, quiet zone included, and it is exact: two
 * blocks given the same `fit` come out the same size however much data each code
 * carries. What varies instead is the module size — Code II carries a signature
 * and runs 57–85 modules against Code I's 41, so the same box makes its modules
 * roughly half as wide. That is the number a scanner cares about, and the
 * renderer refuses a `fit` that drives it below a point per module.
 */
export interface QrBlock {
  type: 'qr';
  when?: string;
  fit?: number;
  /** Which verification code to print. Default `'invoice'` (Code I). */
  code?: 'invoice' | 'certificate';
  /**
   * Style for the clickable link printed under the code. The link itself is
   * switched on by the render options, not by the template; this only says how
   * it looks.
   */
  linkStyle?: string;
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

/**
 * Repeat a group of blocks once per entry of a collection, with each entry as
 * the binding root — so children use paths relative to the item, exactly as
 * `lines` columns do. Where a table forces every record onto one row, this lays
 * a record out however its fields need, which is what wide records (a UPO
 * document: a 35-character KSeF number beside a 44-character hash) require to
 * stay on the page. `separator` draws a divider between entries.
 */
export interface EachBlock {
  type: 'each';
  from: string;
  blocks: Block[];
  separator?: boolean;
  when?: string;
  style?: string;
}

export interface TableBlock {
  type: 'table';
  from?: string;
  columns: ColumnDef[];
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
  /**
   * A rule is only ever there to separate two things, so it has to be able to
   * disappear with the thing it separates: the built-in templates close the
   * `notes` block with one, and an invoice carrying no notes must not show a
   * stray line above its verification codes.
   */
  when?: string;
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
  | NotesBlock
  | QrBlock
  | FooterBlock
  | TextBlock
  | ColumnsBlock
  | StackBlock
  | EachBlock
  | TableBlock
  | ImageBlock
  | DividerBlock
  | SpacerBlock;

export type BlockType = Block['type'];

export interface InvoiceTemplate {
  /** Binds this template to one XML kind; the engine rejects a version mismatch. */
  schema: TemplateSchemaId;
  page?: PageConfig;
  pageFooter?: PageFooterConfig;
  defaultStyle?: Style;
  styles?: Record<string, Style>;
  /** Per-template label overrides (merged over the i18n bundle). */
  labels?: Record<string, string>;
  blocks: Block[];
}

// ── zod validation ─────────────────────────────────────────────────────────

const formatEnum = z.enum(['money', 'date', 'number', 'nip', 'paymentForm']);
const styleValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.number())]);
const styleSchema = z.record(z.string(), styleValue);
const labelRef = z.object({ label: z.string().optional(), text: z.string().optional() }).strict();
const partyField: z.ZodType<PartyField> = z.lazy(() =>
  z.union([
    z.string(),
    z.object({ path: z.string(), optional: z.boolean().optional() }).strict(),
    z.object({ firstOf: z.array(z.string()).nonempty() }).strict(),
    z
      .object({
        label: z.string(),
        from: z.string().optional(),
        fields: z.array(partyField),
        style: z.string().optional(),
      })
      .strict(),
  ]),
);
const partyColumn = z
  .object({ label: z.string(), style: z.string().optional(), fields: z.array(partyField) })
  .strict();
const fieldDef = z
  .object({
    label: z.string(),
    path: z.string(),
    optional: z.boolean().optional(),
    format: formatEnum.optional(),
    style: z.string().optional(),
    suffixPath: z.string().optional(),
  })
  .strict();

const columnDef = z
  .object({
    label: z.string(),
    path: z.string(),
    optional: z.boolean().optional(),
    format: formatEnum.optional(),
    style: z.string().optional(),
    suffixPath: z.string().optional(),
    width: z.union([z.number().positive(), z.literal('auto'), z.literal('*')]).optional(),
    sub: z.array(fieldDef).nonempty().optional(),
    subStyle: z.string().optional(),
    subSeparator: z.string().optional(),
  })
  .strict();

const totalsRow = z
  .object({
    label: z.string(),
    path: z.string().optional(),
    optional: z.boolean().optional(),
    sum: z.array(z.string()).nonempty().optional(),
    when: z.string().optional(),
    format: formatEnum.optional(),
    style: z.string().optional(),
  })
  .strict()
  .refine((r) => (r.path === undefined) !== (r.sum === undefined), {
    message: 'a totals row needs exactly one of "path" or "sum"',
  });

// Recursive block schema (containers embed blocks). z.lazy breaks the cycle.
const blockSchema: z.ZodType<Block> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('header'),
      logo: z.string().optional(),
      logoWidth: z.number().positive().optional(),
      title: labelRef.optional(),
      number: z.string().optional(),
      date: z.string().optional(),
      ksefNumber: z.string().optional(),
      offlineStyle: z.string().optional(),
      style: z.string().optional(),
    }).strict(),
    z.object({
      type: z.literal('parties'),
      left: partyColumn,
      right: partyColumn,
      headingStyle: z.string().optional(),
      style: z.string().optional(),
    }).strict(),
    z.object({
      type: z.literal('lines'),
      from: z.string(),
      columns: z.array(columnDef),
      style: z.string().optional(),
    }).strict(),
    z.object({ type: z.literal('totals'), rows: z.array(totalsRow), style: z.string().optional() }).strict(),
    z.object({
      type: z.literal('payment'),
      when: z.string().optional(),
      rows: z.array(fieldDef),
      accounts: z
        .object({
          from: z.string(),
          heading: z.string().optional(),
          fields: z.array(fieldDef),
        })
        .strict()
        .optional(),
      headingStyle: z.string().optional(),
      style: z.string().optional(),
    }).strict(),
    z.object({
      type: z.literal('notes'),
      headingStyle: z.string().optional(),
      style: z.string().optional(),
    }).strict(),
    z.object({
      type: z.literal('annotations'),
      fields: z.array(fieldDef),
      headingStyle: z.string().optional(),
      style: z.string().optional(),
    }).strict(),
    z.object({
      type: z.literal('qr'),
      when: z.string().optional(),
      fit: z.number().optional(),
      code: z.enum(['invoice', 'certificate']).optional(),
      linkStyle: z.string().optional(),
    }).strict(),
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
      type: z.literal('each'),
      from: z.string(),
      blocks: z.array(blockSchema),
      separator: z.boolean().optional(),
      when: z.string().optional(),
      style: z.string().optional(),
    }).strict(),
    z.object({
      type: z.literal('table'),
      from: z.string().optional(),
      columns: z.array(columnDef),
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
    z.object({ type: z.literal('divider'), when: z.string().optional(), style: z.string().optional() }).strict(),
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
    pageFooter: z
      .object({ style: z.string().optional() })
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
