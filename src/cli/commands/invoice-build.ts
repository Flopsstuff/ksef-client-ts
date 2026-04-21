import { defineCommand } from 'citty';
import { consola } from 'consola';
import { withErrorHandler } from '../error-handler.js';
import { outputResult } from '../output.js';
import {
  serializeInvoiceXml,
  type InvoiceSerializerInput,
  type InvoiceSchema,
} from '../../xml/index.js';
import { validate as validateInvoice } from '../../validation/invoice-validator.js';
import {
  validateAgainstXsd,
  resolveXsdFor,
} from '../../validation/xsd-validator.js';
import { KSeFValidationError } from '../../errors/ksef-validation-error.js';
import { KSeFXsdValidationError } from '../../errors/ksef-xsd-validation-error.js';
import {
  readInput,
  parseInput,
  inferSchema,
  writeOutput,
  emitTemplate,
  buildDrySummary,
  mapBuildExitCode,
  VALID_SCHEMAS,
  VALID_FORMATS,
  type FormatOption,
} from './invoice-build-helpers.js';

export const invoiceBuild = defineCommand({
  meta: {
    name: 'build',
    description: 'Build invoice XML from structured JSON/YAML input',
  },
  args: {
    input: {
      type: 'positional',
      required: false,
      description: 'Input file path, or "-" to read from stdin',
    },
    schema: {
      type: 'string',
      description: 'Explicit schema: FA2|FA3|PEF|PEF_KOR (default: inferred from input)',
    },
    output: {
      type: 'string',
      alias: 'o',
      description: 'Output file path; omit or "-" for stdout',
    },
    pretty: {
      type: 'boolean',
      description: 'Pretty-print XML with 2-space indentation',
    },
    validate: {
      type: 'boolean',
      description: 'Run schema validation on the serialized XML',
    },
    'validate-xsd': {
      type: 'boolean',
      description: 'Run XSD validation on the serialized XML (requires libxmljs2)',
    },
    'dry-run': {
      type: 'boolean',
      description: 'Parse and summarise input; do not emit XML',
    },
    format: {
      type: 'string',
      description: 'Input format: json|yaml (default: infer from file extension)',
    },
    template: {
      type: 'string',
      description: 'Print a skeleton JSON for FA2|FA3|PEF|PEF_KOR and exit',
    },
    json: {
      type: 'boolean',
      description: 'Machine-readable output (for --dry-run / error messages)',
    },
  },
  async run({ args }) {
    await withErrorHandler(
      async () => {
        if (args.template) {
          emitTemplate(args.template as string);
          return;
        }
        if (!args.input) {
          throw new Error(
            'Input file required. Provide a path or use "-" to read from stdin.',
          );
        }

        const formatRaw = args.format as string | undefined;
        if (formatRaw && !VALID_FORMATS.includes(formatRaw as FormatOption)) {
          throw KSeFValidationError.fromField(
            'format',
            `Format must be one of: ${VALID_FORMATS.join(', ')}.`,
          );
        }
        const formatOption = (formatRaw as FormatOption | undefined) ?? 'auto';
        const { raw, format } = await readInput(args.input as string, formatOption);
        const parsed = parseInput(raw, format);

        const explicitSchemaRaw = args.schema as string | undefined;
        if (explicitSchemaRaw && !VALID_SCHEMAS.includes(explicitSchemaRaw as InvoiceSchema)) {
          throw KSeFValidationError.fromField(
            'schema',
            `Schema must be one of: ${VALID_SCHEMAS.join(', ')}.`,
          );
        }
        const explicitSchema = explicitSchemaRaw as InvoiceSchema | undefined;
        const schema = explicitSchema ?? inferSchema(parsed);

        if (args['dry-run']) {
          const summary = buildDrySummary(parsed, schema);
          if (args.json) {
            outputResult(summary, { json: true });
          } else {
            consola.info(`Schema:      ${summary.schema}${explicitSchema ? '' : ' (inferred)'}`);
            consola.info(`Invoice #:   ${summary.invoiceNumber ?? '(not set)'}`);
            consola.info(`Sections:    ${summary.sections.join(', ')}`);
            if (summary.lineCount !== undefined) {
              consola.info(`Line count:  ${summary.lineCount}`);
            }
          }
          return;
        }

        const xml = serializeInvoiceXml(parsed as InvoiceSerializerInput, {
          schema,
          pretty: Boolean(args.pretty),
        });

        const xmlStr =
          args.validate || args['validate-xsd'] ? xml.toString('utf-8') : '';

        if (args.validate) {
          const result = await validateInvoice(xmlStr);
          if (!result.valid) {
            throw KSeFValidationError.fromMessages(result.errors.map((e) => e.message));
          }
        }

        if (args['validate-xsd']) {
          const xsdPath = resolveXsdFor(schema);
          const xsdResult = validateAgainstXsd(xmlStr, xsdPath);
          if (!xsdResult.valid) {
            throw new KSeFXsdValidationError(xsdPath, xsdResult.errors);
          }
        }

        writeOutput(xml, args.output as string | undefined);
      },
      { json: Boolean(args.json), exitCode: mapBuildExitCode },
    );
  },
});
