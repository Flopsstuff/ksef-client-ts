import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VerificationLinkService } from '../../src/qr/verification-link-service.js';

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

/**
 * The QR group renders against DEMO. The documents are invented, so no verifier
 * will resolve them anywhere — but a demo link is the one a reader can safely
 * click, and it keeps every code in the group pointing at the same host.
 */
const DEMO_QR_HOST = 'https://qr-demo.ksef.mf.gov.pl';

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
let certificateQrUrl: string;
let notesFile: string;

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

  // Code II is signed with the issuer's offline-certificate key, so it can only
  // be built, never derived from the document. A throwaway EC key gives a URL of
  // realistic length — which is what decides how dense the printed code is.
  const key = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  }) as string;
  notesFile = join(inputsDir, 'cli-notes.json');
  writeFileSync(
    notesFile,
    JSON.stringify([
      { head: 'Warunki dostawy', body: 'Towar wydany w magazynie sprzedawcy. Ryzyko przechodzi na kupującego z chwilą wydania.' },
      { head: 'Uwaga', body: 'Prosimy o podanie numeru faktury w tytule przelewu.' },
    ]),
  );

  certificateQrUrl = new VerificationLinkService(DEMO_QR_HOST).buildCertificateVerificationUrl(
    'Nip',
    '1111111111',
    '1111111111',
    '01F20A5D352AE590',
    randomBytes(32).toString('base64'),
    key,
  );
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

  const LOGO = () => ['--logo', fx('e2e-logo.png')];
  /** The two hex forms the flag accepts, so the preview set exercises both. */
  const ACCENT = '#5AB595';
  const ACCENT_SHORT = '#b04';
  const SUPPLIED_CODE_I = `${DEMO_QR_HOST}/invoice/1111111111/15-01-2026/SUPPLIED-VERBATIM`;

  /** The mixed-rate document with the flags every totals variant shares. */
  const mixedVat = () => [fx('e2e-vat-multi.xml'), '--ksef-number', KSEF_NUMBER, ...LOGO()];

  /**
   * The preview set, laid out as a covering design rather than one variant per
   * feature. Nine dimensions are in play — document, locale, which QR codes,
   * links, logo, KSeF number, totals mode, accent colour, and where Code I
   * comes from — and a
   * row per combination would be hundreds of PDFs nobody looks at. Instead each
   * row varies several at once so that every value of every dimension appears,
   * and the pairs that actually interact are covered.
   *
   * Rows 01–05 are that covering design. Rows 06–10 are deliberately NOT: the
   * totals modes only mean anything compared side by side, so those five hold
   * every other flag identical and vary one thing.
   *
   *   #   document      locale  QR     links  logo  KSeF nr  totals   accent
   *   01  services-np   pl      I      no     yes   yes      buckets  #5AB595
   *   02  fa3           en      I      yes    no    yes      summary  no       (Code I supplied)
   *   03  buyer-no-id   uk      II     yes    yes   no       both     no
   *   04  vat-multi     en+pl   II     no     no    no       none     no
   *   05  vat-multi     pl+uk   both   yes    yes   no       both     no       (+ notes)
   *
   * What each row is there to show, beyond its share of the grid: 01 the
   * everyday online invoice, and the accent against the default palette; 02 an
   * invoice whose Code I URL was handed over ready-made; 03 a foreign buyer
   * with no NIP, issued offline; 04 and 05 the layout cases — one code absent,
   * then both present — where the codes must stay against the right margin.
   */
  const variants: Array<[name: string, args: () => string[]]> = [
    [`${PREFIX}-01-invoice-pl-code-i-accent`, () => [
      fx('e2e-services-np.xml'), '--ksef-number', KSEF_NUMBER, ...LOGO(),
      '--env', 'demo', '--qr', '--totals', 'buckets', '--accent', ACCENT,
    ]],
    [`${PREFIX}-02-invoice-en-supplied-code-i-links`, () => [
      fx('fa3.xml'), '--ksef-number', KSEF_NUMBER, '--locale', 'en',
      '--qr-url', SUPPLIED_CODE_I, '--qr-links', '--totals', 'summary',
    ]],
    [`${PREFIX}-03-invoice-uk-offline-code-ii-links`, () => [
      fx('e2e-buyer-no-id.xml'), ...LOGO(), '--locale', 'uk',
      '--env', 'demo', '--qr-cert-url', certificateQrUrl, '--qr-links', '--totals', 'both',
    ]],
    [`${PREFIX}-04-invoice-bilingual-offline-code-ii`, () => [
      fx('e2e-vat-multi.xml'), '--locale', 'en+pl',
      '--env', 'demo', '--qr-cert-url', certificateQrUrl, '--totals', 'none',
    ]],
    [`${PREFIX}-05-invoice-pl-uk-offline-both-codes-links-notes`, () => [
      fx('e2e-vat-multi.xml'), ...LOGO(), '--locale', 'pl+uk',
      '--env', 'demo', '--qr', '--qr-cert-url', certificateQrUrl, '--qr-links', '--totals', 'both',
      '--notes', notesFile,
    ]],
    // Every totals mode on one mixed-rate document (23% + 8% + exempt), so the
    // four can be compared page by page. Only --totals differs between them —
    // and the accent on 06, which is safe here because it reaches the title and
    // the section headings, never the totals rows the group exists to compare.
    // The amount due must appear in all of them.
    [`${PREFIX}-06-totals-none-accent`, () => [...mixedVat(), '--totals', 'none', '--accent', ACCENT]],
    [`${PREFIX}-07-totals-buckets`, () => [...mixedVat(), '--totals', 'buckets']],
    [`${PREFIX}-08-totals-summary`, () => [...mixedVat(), '--totals', 'summary']],
    [`${PREFIX}-09-totals-both`, () => [...mixedVat(), '--totals', 'both']],
    // The A/B against 08: identical document and flags, but the totals read the
    // standard-rate bucket alone instead of summing all of them. It needs
    // --totals summary, since that is the group those rows belong to.
    [`${PREFIX}-10-totals-summary-single-bucket-template`, () => [...mixedVat(), '--totals', 'summary', '--template-file', oldTotalsTemplate]],
    // Not part of the grid: `fa3-showcase` is a built-in whose point is to
    // exercise the DSL — palette, letter spacing, highlighted text, colour bars
    // drawn as data-URI images. Rendered with everything switched on, so a DSL
    // change that breaks it is visible rather than discovered by a reader.
    // It also carries the accent, in its short hex form: this template sets its
    // own heading colours, so it is the page that shows whether an accent wins
    // over a template's palette.
    [`${PREFIX}-11-showcase-template-accent`, () => [
      fx('e2e-vat-multi.xml'), '--template', 'fa3-showcase', ...LOGO(),
      '--env', 'demo', '--qr', '--qr-cert-url', certificateQrUrl, '--qr-links',
      '--totals', 'both', '--notes', notesFile, '--accent', ACCENT_SHORT,
    ]],
    // Receipts last: they are a different document and read as their own group.
    [`${PREFIX}-12-upo-pl`, () => [fx('upo-4_3.xml')]],
    [`${PREFIX}-13-upo-five-documents-bilingual`, () => [multiDocumentUpo, '--locale', 'en+pl']],
  ];

  /**
   * The grid above is only worth trusting if it actually is one. This reads the
   * rows back and checks that every value of every dimension is present, so a
   * row edited for one reason cannot quietly drop the only coverage of another.
   */
  it('covers every value of every dimension', () => {
    const args = variants.map(([, build]) => build().join(' '));
    const covered = (needle: string) => args.some((a) => a.includes(needle));

    for (const doc of ['e2e-services-np.xml', 'fa3.xml', 'e2e-buyer-no-id.xml', 'e2e-vat-multi.xml', 'upo-4_3.xml']) {
      expect(covered(doc), `no variant renders ${doc}`).toBe(true);
    }
    for (const locale of ['en', 'uk', 'en+pl', 'pl+uk']) {
      expect(covered(`--locale ${locale}`), `no variant renders in ${locale}`).toBe(true);
    }
    for (const totals of ['none', 'buckets', 'summary', 'both']) {
      expect(covered(`--totals ${totals}`), `no variant renders --totals ${totals}`).toBe(true);
    }
    expect(covered('--qr '), 'Code I is never derived').toBe(true);
    expect(covered('--qr-url'), 'Code I is never supplied ready-made').toBe(true);
    expect(covered('--qr-cert-url'), 'Code II is never printed').toBe(true);
    expect(covered('--qr-links'), 'the links are never printed').toBe(true);
    expect(covered('--template-file'), 'a custom template file is never used').toBe(true);
    expect(covered('--template '), 'a built-in is never selected by name').toBe(true);
    expect(covered('--notes'), 'caller-supplied notes are never printed').toBe(true);
    // The accent repaints the title and both heading levels, so a themed render
    // differs from an unthemed one on every page — worth its own cover.
    expect(covered('--accent'), 'the accent colour is never applied').toBe(true);
    expect(covered('--logo'), 'the logo is never printed').toBe(true);
    for (const accent of ['#5AB595', '#b04']) {
      expect(covered(`--accent ${accent}`), `no variant renders with accent ${accent}`).toBe(true);
    }
    // The absences matter as much: a Polish default locale, an invoice with no
    // logo, and one still waiting for its KSeF number.
    expect(args.some((a) => !a.includes('--locale')), 'nothing renders in the default locale').toBe(true);
    expect(args.some((a) => !a.includes('--logo')), 'nothing renders without a logo').toBe(true);
    expect(args.some((a) => !a.includes('--ksef-number')), 'nothing renders as OFFLINE').toBe(true);
    expect(args.some((a) => !a.includes('--accent')), 'nothing renders in the default colours').toBe(true);
  });

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
    expect(variants).toHaveLength(13);
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

  // pdfmake silently ignores a colour it cannot parse, so an unrecognized accent
  // renders a document identical to an unthemed one. A misspelled colour name
  // has to fail at the flag, or it becomes a PDF that is quietly wrong.
  it('refuses an accent colour that is not hex', () => {
    const out = join(outDir, 'should-not-exist-4.pdf');
    const res = run(['invoice', 'pdf', fx('fa3.xml'), '--accent', 'crimsonn', '--out', out]);
    expect(res.status).not.toBe(0);
    expect(`${res.stdout}${res.stderr}`).toMatch(/Invalid --accent/);
    expect(existsSync(out)).toBe(false);
  });

  // pdfmake draws PNG and JPEG and nothing else, so a vector or animated logo
  // has to be refused at the flag — accepting it only moves the failure into
  // the middle of the render, where the message names no file the caller passed.
  it('refuses a logo format the renderer cannot draw', () => {
    const svg = join(inputsDir, 'logo.svg');
    writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>');
    const out = join(outDir, 'should-not-exist-3.pdf');
    const res = run(['invoice', 'pdf', fx('fa3.xml'), '--logo', svg, '--out', out]);
    expect(res.status).not.toBe(0);
    expect(`${res.stdout}${res.stderr}`).toMatch(/Unsupported logo format/);
    expect(existsSync(out)).toBe(false);
  });
});
