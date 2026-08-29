import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Spawn-based coverage for `ksef invoice pdf` — renders the whole preview set
// through the built CLI (dist/cli.js), no network and no authentication. It
// mirrors invoices/temp/regen.sh so the two cannot drift: the same variants,
// the same flags, only against anonymous fixtures instead of real invoices.
//
// The assertions are deliberately shallow — a file appears, and it is a
// structurally complete PDF. Layout is judged by eye, not here; asserting on
// glyph positions would break on every deliberate design change and tell us
// nothing about whether the page actually reads well. What this does catch is
// the class of failure that is invisible in unit tests: a template that no
// longer validates at import, a bundling regression that drops the fonts, a
// flag that stops being wired, an optional peer that fails to load.
//
// Output goes to a stable directory so the rendered PDFs can be opened and
// reviewed after a run; override it with KSEF_PDF_OUT. Spec 36 writes its own
// `lib-` prefixed set into the same directory, so this one clears only what it
// owns — wiping the directory would race the sibling spec under a parallel run.

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const cliEntry = join(repoRoot, 'dist', 'cli.js');
const fixtures = join(repoRoot, 'tests', 'fixtures', 'pdf');
const outDir = process.env.KSEF_PDF_OUT ?? join(repoRoot, '.pdf-preview');
const inputsDir = join(outDir, '_inputs');
const PREFIX = 'cli';

const fx = (name: string) => join(fixtures, name);

/** A KSeF number shaped like the real thing; this one identifies nobody. */
const KSEF_NUMBER = '1111111111-20260115-010000000000-00';

function run(args: string[]) {
  const result = spawnSync('node', [cliEntry, ...args], { encoding: 'utf-8', cwd: repoRoot });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

/** `%PDF-` header and an `%%EOF` trailer: a complete file, not a truncated one. */
function isCompletePdf(file: string): boolean {
  const bytes = readFileSync(file);
  const head = bytes.subarray(0, 5).toString('latin1');
  const tail = bytes.subarray(-8).toString('latin1').trim();
  return head === '%PDF-' && tail.endsWith('%%EOF');
}

/** Derived inputs that no fixture can hold on its own. */
let oldTotalsTemplate: string;
let multiDocumentUpo: string;

function writeDerivedInputs(): void {
  // A copy of fa3-default whose totals read a single rate bucket — the shape the
  // template had before net/VAT started summing every P_13_*/P_14_*. Built from
  // the current template so it tracks unrelated layout edits.
  const template = JSON.parse(
    readFileSync(join(repoRoot, 'src', 'pdf', 'template', 'builtin', 'fa3-default.json'), 'utf-8'),
  ) as { blocks: Array<{ type: string; rows?: Array<Record<string, unknown>> }> };
  for (const block of template.blocks) {
    if (block.type !== 'totals') continue;
    for (const row of block.rows ?? []) {
      if (row.label === 'totalNet') { delete row.sum; row.path = 'Fa.P_13_1'; }
      if (row.label === 'totalVat') { delete row.sum; row.path = 'Fa.P_14_1'; }
    }
  }
  oldTotalsTemplate = join(inputsDir, 'cli-fa3-single-bucket-totals.json');
  writeFileSync(oldTotalsTemplate, JSON.stringify(template, null, 2));

  // A five-document session UPO, cloned from the single-document fixture.
  const upo = readFileSync(fx('upo-4_3.xml'), 'utf-8');
  const start = upo.indexOf('<Dokument>');
  const end = upo.indexOf('</Dokument>') + '</Dokument>'.length;
  const first = upo.slice(start, end);
  const clones = [2, 3, 4, 5].map((i) =>
    first
      .replace('010000000000-00', `${String(i).padStart(2, '0')}0000000000-00`)
      .replace('FA/2025/01/001', `FA/2025/01/00${i}`),
  );
  multiDocumentUpo = join(inputsDir, 'cli-upo-4_3-five-documents.xml');
  writeFileSync(multiDocumentUpo, upo.slice(0, end) + '\n' + clones.join('\n') + upo.slice(end));
}

describe('35 - `ksef invoice pdf` renders the preview set', () => {
  beforeAll(() => {
    if (!existsSync(cliEntry)) {
      throw new Error(`Missing ${cliEntry}. Run \`yarn build\` before \`yarn test:e2e\`.`);
    }
    mkdirSync(inputsDir, { recursive: true });
    for (const stale of readdirSync(outDir)) {
      if (stale.startsWith(`${PREFIX}-`)) rmSync(join(outDir, stale), { force: true });
    }
    writeDerivedInputs();
  });

  afterAll(() => {
    // eslint-disable-next-line no-console
    console.log(`\n  rendered PDFs kept for review in ${outDir}\n`);
  });

  /** The mixed-rate document with the flags every totals variant shares. */
  const mixedVat = () => [fx('e2e-vat-multi.xml'), '--ksef-number', KSEF_NUMBER, '--logo', fx('e2e-logo.png')];

  const variants: Array<[name: string, args: () => string[]]> = [
    [`${PREFIX}-01-invoice-pl-qr`, () => [fx('e2e-services-np.xml'), '--qr', '--ksef-number', KSEF_NUMBER, '--logo', fx('e2e-logo.png')]],
    [`${PREFIX}-02-invoice-en`, () => [fx('e2e-services-np.xml'), '--locale', 'en', '--ksef-number', KSEF_NUMBER, '--logo', fx('e2e-logo.png')]],
    [`${PREFIX}-03-invoice-bilingual`, () => [fx('e2e-services-np.xml'), '--locale', 'en+pl', '--ksef-number', KSEF_NUMBER, '--logo', fx('e2e-logo.png')]],
    [`${PREFIX}-04-invoice-offline`, () => [fx('e2e-services-np.xml'), '--logo', fx('e2e-logo.png')]],
    [`${PREFIX}-05-invoice-standard-rate`, () => [fx('fa3.xml')]],
    [`${PREFIX}-06-invoice-buyer-without-id`, () => [fx('e2e-buyer-no-id.xml'), '--logo', fx('e2e-logo.png')]],
    // Every totals mode on one mixed-rate document (23% + 8% + exempt), so the
    // four can be compared page by page. Same flags throughout — only --totals
    // differs, and the amount due must appear in all of them.
    [`${PREFIX}-07-invoice-mixed-vat-totals-none`, () => [...mixedVat(), '--totals', 'none']],
    [`${PREFIX}-08-invoice-mixed-vat-totals-buckets`, () => [...mixedVat(), '--totals', 'buckets']],
    [`${PREFIX}-09-invoice-mixed-vat-totals-summary`, () => [...mixedVat(), '--totals', 'summary']],
    [`${PREFIX}-10-invoice-mixed-vat-totals-both`, () => [...mixedVat(), '--totals', 'both']],
    // The A/B against 09: identical document and flags, but the totals read the
    // standard-rate bucket alone instead of summing all of them. It needs
    // --totals summary, since that is the group those rows belong to.
    [`${PREFIX}-11-invoice-mixed-vat-single-bucket-totals`, () => [...mixedVat(), '--totals', 'summary', '--template-file', oldTotalsTemplate]],
    [`${PREFIX}-12-invoice-mixed-vat-bilingual`, () => [...mixedVat(), '--locale', 'en+pl', '--totals', 'both']],
    // Receipts last: they are a different document and read as their own group.
    [`${PREFIX}-13-upo-pl`, () => [fx('upo-4_3.xml')]],
    [`${PREFIX}-14-upo-bilingual`, () => [fx('upo-4_3.xml'), '--locale', 'en+pl']],
    [`${PREFIX}-15-upo-five-documents`, () => [multiDocumentUpo]],
  ];

  it.each(variants)('renders %s', (name, args) => {
    const out = join(outDir, `${name}.pdf`);
    const res = run(['invoice', 'pdf', ...args(), '--out', out]);

    expect(res.status, `exit ${res.status}\n${res.stderr}`).toBe(0);
    expect(existsSync(out), `${out} was not written`).toBe(true);
    expect(isCompletePdf(out), `${out} is not a complete PDF`).toBe(true);
  });

  it('renders every variant of the set', () => {
    // Guards against a variant being silently dropped from the table above:
    // regen.sh and this spec are meant to cover the same ground.
    expect(variants).toHaveLength(15);
    for (const [name] of variants) {
      expect(existsSync(join(outDir, `${name}.pdf`)), `${name}.pdf missing`).toBe(true);
    }
  });

  it('fails loudly on an unknown template instead of writing a file', () => {
    const out = join(outDir, 'should-not-exist.pdf');
    const res = run(['invoice', 'pdf', fx('fa3.xml'), '--template', 'no-such-template', '--out', out]);
    expect(res.status).not.toBe(0);
    expect(existsSync(out)).toBe(false);
  });

  it('rejects a UPO handed to an invoice template', () => {
    const out = join(outDir, 'should-not-exist-2.pdf');
    const res = run(['invoice', 'pdf', fx('upo-4_3.xml'), '--template', 'fa3-default', '--out', out]);
    expect(res.status).not.toBe(0);
    expect(existsSync(out)).toBe(false);
  });
});
