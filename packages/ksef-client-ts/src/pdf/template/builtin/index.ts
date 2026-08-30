/**
 * Built-in templates. JSON is imported (not read from disk) so tsup inlines it
 * into the bundle — no runtime filesystem access is needed for built-ins.
 */
import { validateTemplate, type InvoiceTemplate } from '../dsl.js';
import fa2Default from './fa2-default.json';
import fa3Default from './fa3-default.json';
import fa3Showcase from './fa3-showcase.json';
import upo42 from './upo-4_2.json';
import upo43 from './upo-4_3.json';

// Built-ins are validated at load — a drift in one of our own presets fails fast
// on import rather than silently producing a broken PDF.
export const BUILTIN_TEMPLATES: Record<string, InvoiceTemplate> = {
  'fa2-default': validateTemplate(fa2Default),
  'fa3-default': validateTemplate(fa3Default),
  'fa3-showcase': validateTemplate(fa3Showcase),
  'upo-4_2': validateTemplate(upo42),
  'upo-4_3': validateTemplate(upo43),
};

export function getBuiltinTemplate(name: string): InvoiceTemplate | undefined {
  return BUILTIN_TEMPLATES[name];
}

export function builtinTemplateNames(): string[] {
  return Object.keys(BUILTIN_TEMPLATES);
}
