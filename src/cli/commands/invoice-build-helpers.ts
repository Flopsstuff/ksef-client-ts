import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml, YAMLParseError } from 'yaml';
import { KSeFValidationError } from '../../errors/ksef-validation-error.js';
import { KSeFXsdValidationError } from '../../errors/ksef-xsd-validation-error.js';
import fa2Template from './invoice-build-templates/fa2.json' with { type: 'json' };
import fa3Template from './invoice-build-templates/fa3.json' with { type: 'json' };
import pefTemplate from './invoice-build-templates/pef.json' with { type: 'json' };
import pefKorTemplate from './invoice-build-templates/pef-kor.json' with { type: 'json' };

export type InputFormat = 'json' | 'yaml';
export type FormatOption = InputFormat | 'auto';
export type TemplateId = 'FA2' | 'FA3' | 'PEF' | 'PEF_KOR';

export const VALID_SCHEMAS: readonly TemplateId[] = ['FA2', 'FA3', 'PEF', 'PEF_KOR'];
export const VALID_FORMATS: readonly FormatOption[] = ['auto', 'json', 'yaml'];

const TEMPLATES: Record<TemplateId, unknown> = {
  FA2: fa2Template,
  FA3: fa3Template,
  PEF: pefTemplate,
  PEF_KOR: pefKorTemplate,
};

export async function readInput(
  input: string,
  format: FormatOption,
): Promise<{ raw: string; format: InputFormat }> {
  const raw = input === '-' ? await readStdin() : fs.readFileSync(input, 'utf-8');
  const resolvedFormat: InputFormat =
    format === 'auto' ? inferFormatFromPath(input) : format;
  return { raw, format: resolvedFormat };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

function inferFormatFromPath(input: string): InputFormat {
  if (input === '-') return 'json';
  const ext = path.extname(input).toLowerCase();
  if (ext === '.yml' || ext === '.yaml') return 'yaml';
  return 'json';
}

export function parseInput(raw: string, format: InputFormat): unknown {
  if (format === 'yaml') return parseYaml(raw);
  return JSON.parse(raw);
}

export function inferSchema(parsed: unknown): TemplateId {
  if (typeof parsed !== 'object' || parsed === null) return 'FA3';
  const obj = parsed as Record<string, unknown>;
  if ('Invoice' in obj) return 'PEF';
  if ('CreditNote' in obj) return 'PEF_KOR';
  const naglowek = obj.Naglowek;
  if (typeof naglowek === 'object' && naglowek !== null) {
    const formCode = (naglowek as Record<string, unknown>).KodFormularza;
    if (typeof formCode === 'object' && formCode !== null) {
      const systemCode = (formCode as Record<string, unknown>).systemCode;
      if (systemCode === 'FA (2)') return 'FA2';
    }
  }
  return 'FA3';
}

export function writeOutput(xml: Buffer, output: string | undefined): void {
  if (!output || output === '-') {
    process.stdout.write(xml);
    return;
  }
  fs.writeFileSync(output, xml);
}

export function emitTemplate(schema: string): void {
  const id = schema.toUpperCase() as TemplateId;
  const template = TEMPLATES[id];
  if (!template) {
    throw new Error(
      `Unknown template schema: ${schema}. Valid choices: FA2, FA3, PEF, PEF_KOR.`,
    );
  }
  process.stdout.write(JSON.stringify(template, null, 2) + '\n');
}

export interface DrySummary {
  schema: TemplateId;
  invoiceNumber?: string;
  sections: string[];
  lineCount?: number;
}

export function buildDrySummary(parsed: unknown, schema: TemplateId): DrySummary {
  if (typeof parsed !== 'object' || parsed === null) {
    return { schema, sections: [] };
  }
  const obj = parsed as Record<string, unknown>;
  const sections = Object.keys(obj);
  const summary: DrySummary = { schema, sections };

  if (schema === 'FA2' || schema === 'FA3') {
    const fa = obj.Fa;
    if (typeof fa === 'object' && fa !== null) {
      const p2 = (fa as Record<string, unknown>).P_2;
      if (typeof p2 === 'string') summary.invoiceNumber = p2;
      const wiersz = (fa as Record<string, unknown>).FaWiersz;
      if (Array.isArray(wiersz)) summary.lineCount = wiersz.length;
      else if (typeof wiersz === 'object' && wiersz !== null) summary.lineCount = 1;
    }
  } else {
    const root = (schema === 'PEF' ? obj.Invoice : obj.CreditNote) as Record<string, unknown> | undefined;
    if (root) {
      const id = root['cbc:ID'];
      if (typeof id === 'string') summary.invoiceNumber = id;
      const lines = schema === 'PEF' ? root['cac:InvoiceLine'] : root['cac:CreditNoteLine'];
      if (Array.isArray(lines)) summary.lineCount = lines.length;
      else if (typeof lines === 'object' && lines !== null) summary.lineCount = 1;
    }
  }

  return summary;
}

export function mapBuildExitCode(error: unknown): number | undefined {
  if (error instanceof SyntaxError) return 2;
  if (error instanceof YAMLParseError) return 2;
  if (error instanceof KSeFXsdValidationError) return 4;
  if (error instanceof KSeFValidationError) return 3;
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    if (
      code === 'ENOENT' ||
      code === 'EACCES' ||
      code === 'EPERM' ||
      code === 'EISDIR'
    ) {
      return 5;
    }
  }
  return undefined;
}
