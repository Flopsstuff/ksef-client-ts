#!/usr/bin/env node
/**
 * XSD → Zod Code Generator for KSeF Invoice Schemas
 *
 * Parses official KSeF XSD schemas from docs/schemas/ and generates
 * TypeScript files with Zod validation schemas to src/validation/schemas/.
 *
 * Usage: node scripts/generate-invoice-schemas.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const SCHEMAS_DIR = join(PROJECT_ROOT, 'docs', 'schemas');
const OUTPUT_DIR = join(PROJECT_ROOT, 'src', 'validation', 'schemas');

// ─── XSD Namespace Constants ────────────────────────────────────────────────

const XSD_NS = 'http://www.w3.org/2001/XMLSchema';

// Schema definitions: which XSD files to process and their output names
const SCHEMA_DEFS = [
  {
    id: 'FA3',
    xsdPath: 'FA/schemat_FA(3)_v1-0E.xsd',
    outputFile: 'fa3.ts',
    namespace: 'http://crd.gov.pl/wzor/2025/06/25/13775/',
    rootElement: 'Faktura',
  },
  {
    id: 'FA2',
    xsdPath: 'FA/schemat_FA(2)_v1-0E.xsd',
    outputFile: 'fa2.ts',
    namespace: 'http://crd.gov.pl/wzor/2023/06/29/12648/',
    rootElement: 'Faktura',
  },
  {
    id: 'RR1_V11E',
    xsdPath: 'RR/schemat_RR(1)_v1-1E.xsd',
    outputFile: 'rr1-v11e.ts',
    namespace: null, // detected at parse time
    rootElement: 'Faktura',
  },
  {
    id: 'RR1_V10E',
    xsdPath: 'RR/schemat_RR(1)_v1-0E.xsd',
    outputFile: 'rr1-v10e.ts',
    namespace: null,
    rootElement: 'Faktura',
  },
  {
    id: 'PEF3',
    xsdPath: 'PEF/Schemat_PEF(3)_v2-1.xsd',
    outputFile: 'pef3.ts',
    namespace: null,
    rootElement: 'Invoice',
  },
  {
    id: 'PEF_KOR3',
    xsdPath: 'PEF/Schemat_PEF_KOR(3)_v2-1.xsd',
    outputFile: 'pef-kor3.ts',
    namespace: null,
    rootElement: 'CreditNote',
  },
];

// ─── XML DOM Helpers ────────────────────────────────────────────────────────
// Use @xmldom/xmldom for parsing (handles single-line XSD files correctly)

const domParser = new DOMParser();

/**
 * Helper: get direct child elements of a DOM element, optionally filtered by local name
 * @param {Element} el
 * @param {string} [localName]
 * @returns {Element[]}
 */
function childElements(el, localName) {
  const result = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i];
    if (child.nodeType === 1 /* ELEMENT_NODE */) {
      if (!localName || child.localName === localName) {
        result.push(child);
      }
    }
  }
  return result;
}

/** Get attribute value or undefined */
function attr(el, name) {
  return el.hasAttribute(name) ? el.getAttribute(name) : undefined;
}

/** Get text content of first child text node */
function textContent(el) {
  let text = '';
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i];
    if (child.nodeType === 3 /* TEXT_NODE */ || child.nodeType === 4 /* CDATA */) {
      text += child.nodeValue;
    }
  }
  return text.trim();
}

// ─── Type Registry ──────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   kind: 'simple',
 *   name: string,
 *   base: string,
 *   facets: Record<string, string|string[]>,
 *   union?: SimpleTypeDef[]
 * }} SimpleTypeDef
 *
 * @typedef {{
 *   kind: 'complex',
 *   name: string,
 *   content: ContentModel,
 *   attributes: AttributeDef[]
 * }} ComplexTypeDef
 *
 * @typedef {{
 *   type: 'sequence' | 'choice' | 'all',
 *   elements: ElementDef[],
 *   minOccurs?: string,
 *   maxOccurs?: string
 * }} ContentModel
 *
 * @typedef {{
 *   name: string,
 *   typeName?: string,
 *   minOccurs: string,
 *   maxOccurs: string,
 *   fixed?: string,
 *   inlineType?: SimpleTypeDef | ComplexTypeDef
 * }} ElementDef
 *
 * @typedef {{
 *   name: string,
 *   typeName?: string,
 *   use?: string,
 *   fixed?: string,
 *   inlineType?: SimpleTypeDef
 * }} AttributeDef
 */

class TypeRegistry {
  constructor() {
    /** @type {Map<string, SimpleTypeDef | ComplexTypeDef>} */
    this.types = new Map();
    /** @type {Map<string, ElementDef & { typeName?: string }>} */
    this.rootElements = new Map();
    /** @type {string[]} */
    this.warnings = [];
    /** @type {string} */
    this.targetNamespace = '';
    /** @type {Map<string, string>} namespace prefix → URI */
    this.nsPrefixes = new Map();
  }

  resolveType(name) {
    // Strip namespace prefix
    const localName = name.includes(':') ? name.split(':')[1] : name;
    return this.types.get(localName);
  }

  addType(def) {
    this.types.set(def.name, def);
  }

  warn(msg) {
    this.warnings.push(msg);
    process.stderr.write(`  WARN: ${msg}\n`);
  }
}

// ─── HTTP Schema URL Resolution ────────────────────────────────────────────

// Resolve an HTTP schema URL to a local file path in docs/schemas/{type}/bazowe/.
// KSeF XSD schemas reference base types via absolute HTTP URLs like:
//   http://crd.gov.pl/.../StrukturyDanych_v10-0E.xsd
// These correspond to local files in docs/schemas/FA/bazowe/ (shared across FA and RR schemas).
function resolveHttpSchemaLocation(httpUrl, importingFilePath) {
  // Extract filename from the URL
  const urlFilename = httpUrl.split('/').pop();
  if (!urlFilename) return null;

  // First: check bazowe/ relative to the importing file's directory
  const localBazowe = join(dirname(importingFilePath), 'bazowe', urlFilename);
  try { statSync(localBazowe); return localBazowe; } catch {}

  // Second: search all */bazowe/ dirs under SCHEMAS_DIR (FA/bazowe/ is the primary location)
  for (const subdir of readdirSync(SCHEMAS_DIR)) {
    const candidate = join(SCHEMAS_DIR, subdir, 'bazowe', urlFilename);
    try { statSync(candidate); return candidate; } catch {}
  }

  return null;
}

// ─── XSD Parser (DOM-based) ─────────────────────────────────────────────────

/** Set of already-loaded file paths to avoid re-parsing */
const loadedFiles = new Set();

function parseXsdFile(filePath, registry) {
  const absPath = resolve(filePath);
  if (loadedFiles.has(absPath)) return;
  loadedFiles.add(absPath);

  const xml = readFileSync(absPath, 'utf-8');
  const doc = domParser.parseFromString(xml, 'text/xml');
  const root = doc.documentElement;

  // Extract namespace info
  for (const a of Array.from(root.attributes)) {
    if (a.name.startsWith('xmlns:')) {
      registry.nsPrefixes.set(a.name.substring(6), a.value);
    }
  }
  const tns = attr(root, 'targetNamespace');
  if (tns && !registry.targetNamespace) registry.targetNamespace = tns;

  // Process imports/includes first
  for (const child of childElements(root)) {
    if (child.localName === 'import' || child.localName === 'include') {
      const schemaLoc = attr(child, 'schemaLocation');
      if (!schemaLoc) continue;

      let importPath;
      if (schemaLoc.startsWith('http')) {
        // Resolve HTTP URL to local bazowe/ directory
        importPath = resolveHttpSchemaLocation(schemaLoc, absPath);
        if (!importPath) {
          registry.warn(`Cannot resolve remote import: ${schemaLoc}`);
          continue;
        }
      } else {
        importPath = resolve(dirname(absPath), schemaLoc);
      }

      try {
        parseXsdFile(importPath, registry);
      } catch (e) {
        registry.warn(`Cannot resolve import: ${schemaLoc} (${e.message})`);
      }
    }
  }

  // Process type definitions
  for (const child of childElements(root)) {
    const ln = child.localName;
    if (ln === 'simpleType') {
      const def = parseSimpleType(child, registry);
      if (def.name) registry.addType(def);
    } else if (ln === 'complexType') {
      const def = parseComplexType(child, registry);
      if (def.name) registry.addType(def);
    } else if (ln === 'element') {
      const name = attr(child, 'name');
      if (name) {
        const elemDef = parseElementDef(child, registry);
        registry.rootElements.set(name, elemDef);
      }
    }
  }
}

function parseSimpleType(el, registry) {
  const name = attr(el, 'name') || '';
  const def = { kind: 'simple', name, base: 'xsd:string', facets: {} };

  for (const child of childElements(el)) {
    if (child.localName === 'restriction') {
      def.base = attr(child, 'base') || 'xsd:string';
      parseFacets(child, def.facets);
    } else if (child.localName === 'union') {
      def.union = [];
      const memberTypes = attr(child, 'memberTypes');
      if (memberTypes) {
        for (const mt of memberTypes.split(/\s+/)) {
          def.union.push({ kind: 'simple', name: '', base: mt, facets: {} });
        }
      }
      for (const uc of childElements(child, 'simpleType')) {
        def.union.push(parseSimpleType(uc, registry));
      }
    }
  }

  return def;
}

function parseFacets(restrictionEl, facets) {
  for (const child of childElements(restrictionEl)) {
    if (child.localName === 'annotation') continue;
    const value = attr(child, 'value');
    if (value === undefined) continue;

    if (child.localName === 'enumeration') {
      if (!facets.enumeration) facets.enumeration = [];
      facets.enumeration.push(value);
    } else if (child.localName === 'pattern') {
      if (!facets.pattern) facets.pattern = [];
      facets.pattern.push(value);
    } else {
      facets[child.localName] = value;
    }
  }
}

function parseComplexType(el, registry) {
  const name = attr(el, 'name') || '';
  const def = { kind: 'complex', name, content: null, attributes: [] };

  for (const child of childElements(el)) {
    const ln = child.localName;
    if (ln === 'sequence') {
      def.content = parseCompositor(child, 'sequence', registry);
    } else if (ln === 'choice') {
      def.content = parseCompositor(child, 'choice', registry);
    } else if (ln === 'all') {
      def.content = parseCompositor(child, 'all', registry);
    } else if (ln === 'simpleContent' || ln === 'complexContent') {
      parseContentModel(child, def, registry);
    } else if (ln === 'attribute') {
      def.attributes.push(parseAttribute(child, registry));
    }
  }

  return def;
}

function parseCompositor(el, type, registry) {
  const model = {
    type,
    elements: [],
    minOccurs: attr(el, 'minOccurs'),
    maxOccurs: attr(el, 'maxOccurs'),
  };

  for (const child of childElements(el)) {
    const ln = child.localName;
    if (ln === 'element') {
      model.elements.push(parseElementDef(child, registry));
    } else if (ln === 'sequence' || ln === 'choice' || ln === 'all') {
      const nested = parseCompositor(child, ln, registry);
      model.elements.push({
        name: `__${ln}_${model.elements.length}`,
        minOccurs: attr(child, 'minOccurs') || '1',
        maxOccurs: attr(child, 'maxOccurs') || '1',
        inlineType: { kind: 'complex', name: '', content: nested, attributes: [] },
      });
    }
  }

  return model;
}

function parseContentModel(el, typeDef, registry) {
  for (const child of childElements(el)) {
    if (child.localName === 'extension') {
      typeDef._extensionBase = attr(child, 'base');
      for (const ec of childElements(child)) {
        if (ec.localName === 'sequence') {
          typeDef.content = parseCompositor(ec, 'sequence', registry);
        } else if (ec.localName === 'choice') {
          typeDef.content = parseCompositor(ec, 'choice', registry);
        } else if (ec.localName === 'attribute') {
          typeDef.attributes.push(parseAttribute(ec, registry));
        }
      }
      if (!typeDef.content && el.localName === 'simpleContent') {
        typeDef._simpleContentBase = attr(child, 'base');
      }
    } else if (child.localName === 'restriction') {
      typeDef._restrictionBase = attr(child, 'base');
      for (const rc of childElements(child)) {
        if (rc.localName === 'sequence') {
          typeDef.content = parseCompositor(rc, 'sequence', registry);
        } else if (rc.localName === 'choice') {
          typeDef.content = parseCompositor(rc, 'choice', registry);
        }
      }
    }
  }
}

function parseElementDef(el, registry) {
  // Handle xsd:element ref="ns:Name" (strip namespace prefix from ref)
  const ref = attr(el, 'ref');
  const refLocal = ref ? (ref.includes(':') ? ref.split(':')[1] : ref) : '';
  const def = {
    name: attr(el, 'name') || refLocal,
    typeName: attr(el, 'type'),
    minOccurs: attr(el, 'minOccurs') || '1',
    maxOccurs: attr(el, 'maxOccurs') || '1',
    fixed: attr(el, 'fixed'),
  };

  for (const child of childElements(el)) {
    if (child.localName === 'simpleType') {
      def.inlineType = parseSimpleType(child, registry);
    } else if (child.localName === 'complexType') {
      def.inlineType = parseComplexType(child, registry);
    }
  }

  return def;
}

function parseAttribute(el, registry) {
  const def = {
    name: attr(el, 'name') || '',
    typeName: attr(el, 'type'),
    use: attr(el, 'use'),
    fixed: attr(el, 'fixed'),
  };

  for (const child of childElements(el)) {
    if (child.localName === 'simpleType') {
      def.inlineType = parseSimpleType(child, registry);
    }
  }

  return def;
}

// ─── Zod Code Emitter ───────────────────────────────────────────────────────

class ZodEmitter {
  constructor(registry) {
    this.registry = registry;
    this.output = [];
    this.emittedTypes = new Set();
    this.indent = 0;
  }

  emit(str = '') {
    this.output.push('  '.repeat(this.indent) + str);
  }

  emitLine(str = '') {
    this.output.push('  '.repeat(this.indent) + str);
  }

  getOutput() {
    return this.output.join('\n') + '\n';
  }

  generateSchemaFile(schemaId, rootElementName) {
    this.output = [];
    this.emittedTypes.clear();
    this.depth = 0;

    this.emit(`// @ts-nocheck`);
    this.emit(`// Generated from KSeF XSD schema — do not edit manually`);
    this.emit(`// Run: yarn generate-schemas`);
    this.emit(`import { z } from 'zod';`);
    this.emit('');

    // Collect all types referenced from root element
    const rootElem = this.registry.rootElements.get(rootElementName);
    if (!rootElem) {
      this.registry.warn(`Root element '${rootElementName}' not found`);
      this.emit(`export const ${schemaId}Schema = z.any();`);
      this.emit(`export type ${schemaId} = z.infer<typeof ${schemaId}Schema>;`);
      return this.getOutput();
    }

    // Emit all types used by the root element (depth-first)
    const allTypes = this.collectReferencedTypes(rootElem);
    for (const typeName of allTypes) {
      this.emitTypeDefinition(typeName);
    }

    // Emit root element schema
    this.emit('');
    this.emit(`export const ${schemaId}Schema = ${this.generateElementSchema(rootElem)};`);
    this.emit('');
    this.emit(`export type ${schemaId} = z.infer<typeof ${schemaId}Schema>;`);

    return this.getOutput();
  }

  collectReferencedTypes(elemDef, collected = new Set(), ordered = [], depth = 0) {
    if (depth > 100) return ordered;
    if (elemDef.typeName) {
      const localName = this.stripPrefix(elemDef.typeName);
      if (!collected.has(localName) && !this.isBuiltinType(elemDef.typeName)) {
        collected.add(localName);
        const typeDef = this.registry.resolveType(elemDef.typeName);
        if (typeDef) {
          this.collectTypeRefs(typeDef, collected, ordered, depth + 1);
          if (!ordered.includes(localName)) ordered.push(localName);
        }
      }
    }
    if (elemDef.inlineType) {
      this.collectTypeRefs(elemDef.inlineType, collected, ordered, depth + 1);
    }
    return ordered;
  }

  collectTypeRefs(typeDef, collected, ordered, depth = 0) {
    if (depth > 100) return; // Guard against circular refs
    if (typeDef.kind === 'simple') {
      if (typeDef.base && !this.isBuiltinType(typeDef.base)) {
        const baseName = this.stripPrefix(typeDef.base);
        if (!collected.has(baseName)) {
          collected.add(baseName);
          const baseType = this.registry.resolveType(typeDef.base);
          if (baseType) {
            this.collectTypeRefs(baseType, collected, ordered, depth + 1);
            ordered.push(baseName);
          }
        }
      }
      if (typeDef.union) {
        for (const member of typeDef.union) {
          this.collectTypeRefs(member, collected, ordered, depth + 1);
        }
      }
    } else if (typeDef.kind === 'complex') {
      if (typeDef._extensionBase && !this.isBuiltinType(typeDef._extensionBase)) {
        const baseName = this.stripPrefix(typeDef._extensionBase);
        if (!collected.has(baseName)) {
          collected.add(baseName);
          const baseType = this.registry.resolveType(typeDef._extensionBase);
          if (baseType) {
            this.collectTypeRefs(baseType, collected, ordered, depth + 1);
            ordered.push(baseName);
          }
        }
      }
      if (typeDef._simpleContentBase && !this.isBuiltinType(typeDef._simpleContentBase)) {
        const baseName = this.stripPrefix(typeDef._simpleContentBase);
        if (!collected.has(baseName)) {
          collected.add(baseName);
          const baseType = this.registry.resolveType(typeDef._simpleContentBase);
          if (baseType) {
            this.collectTypeRefs(baseType, collected, ordered, depth + 1);
            ordered.push(baseName);
          }
        }
      }
      if (typeDef.content) {
        for (const elem of typeDef.content.elements) {
          this.collectReferencedTypes(elem, collected, ordered, depth + 1);
        }
      }
    }
  }

  emitTypeDefinition(typeName) {
    if (this.emittedTypes.has(typeName)) return;
    this.emittedTypes.add(typeName);

    const typeDef = this.registry.types.get(typeName);
    if (!typeDef) return;

    const varName = this.typeToVarName(typeName);

    if (typeDef.kind === 'simple') {
      this.emit(`const ${varName} = ${this.generateSimpleType(typeDef)};`);
    } else {
      this.emit(`const ${varName} = ${this.generateComplexType(typeDef)};`);
    }
    this.emit('');
  }

  generateSimpleType(typeDef) {
    // Union type
    if (typeDef.union && typeDef.union.length > 0) {
      const branches = typeDef.union.map(u => this.generateSimpleType(u));
      return `z.union([${branches.join(', ')}])`;
    }

    // Enumeration
    if (typeDef.facets.enumeration) {
      const values = typeDef.facets.enumeration;
      if (values.length === 1) {
        return `z.literal(${JSON.stringify(values[0])})`;
      }
      return `z.enum([${values.map(v => JSON.stringify(v)).join(', ')}])`;
    }

    // Numeric types
    const base = typeDef.base || 'xsd:string';
    if (this.isNumericBase(base)) {
      return this.generateNumericType(typeDef);
    }

    // Date types — validate as string
    if (this.isDateBase(base)) {
      return this.generateDateType(typeDef);
    }

    // String types (default)
    return this.generateStringType(typeDef);
  }

  generateNumericType(typeDef) {
    // For integer types, we use z.number().int()
    // For decimal, just z.number() or z.string() with pattern
    const base = typeDef.base || 'xsd:decimal';
    const facets = typeDef.facets;

    // If there's a pattern facet, use string with regex (common for TKwotowy)
    if (facets.pattern) {
      return this.generateStringType(typeDef);
    }

    let schema = 'z.number()';

    if (this.isIntegerBase(base)) {
      schema += '.int()';
    }

    if (facets.minInclusive !== undefined) schema += `.min(${facets.minInclusive})`;
    if (facets.maxInclusive !== undefined) schema += `.max(${facets.maxInclusive})`;
    if (facets.minExclusive !== undefined) schema += `.min(${Number(facets.minExclusive) + (this.isIntegerBase(base) ? 1 : 0.000001)})`;

    // For XML parsed values, numbers come as strings, so we need coerce
    return `z.coerce.number()${schema.substring('z.number()'.length)}`;
  }

  generateDateType(typeDef) {
    let schema = 'z.string()';
    const facets = typeDef.facets;
    if (facets.pattern && facets.pattern.length > 0) {
      schema += `.regex(/${facets.pattern[0]}/)`;
    }
    return schema;
  }

  generateStringType(typeDef) {
    let schema = 'z.string()';
    const facets = typeDef.facets;

    // Check if base is also a simple type we need to inherit from
    const base = typeDef.base;
    if (base && !this.isBuiltinType(base)) {
      const baseType = this.registry.resolveType(base);
      if (baseType && baseType.kind === 'simple') {
        // Use base type's var name directly and refine
        // But for simplicity, we flatten constraints
        return this.generateSimpleTypeWithInheritedFacets(typeDef);
      }
    }

    if (facets.enumeration) {
      return `z.enum([${facets.enumeration.map(v => JSON.stringify(v)).join(', ')}])`;
    }

    if (facets.length !== undefined) {
      schema += `.length(${facets.length})`;
    } else {
      if (facets.minLength !== undefined) schema += `.min(${facets.minLength})`;
      if (facets.maxLength !== undefined) schema += `.max(${facets.maxLength})`;
    }

    if (facets.pattern && facets.pattern.length > 0) {
      // Multiple patterns = OR (union of patterns)
      if (facets.pattern.length === 1) {
        schema += `.regex(/${escapeRegex(facets.pattern[0])}/)`;
      } else {
        // Combine with alternation
        const combined = facets.pattern.map(p => `(?:${escapeRegex(p)})`).join('|');
        schema += `.regex(/^(?:${combined})$/)`;
      }
    }

    return schema;
  }

  generateSimpleTypeWithInheritedFacets(typeDef) {
    // Flatten all facets from the inheritance chain
    const allFacets = {};
    this.collectInheritedFacets(typeDef, allFacets);

    const syntheticDef = { kind: 'simple', name: '', base: 'xsd:string', facets: allFacets };

    if (allFacets.enumeration) {
      if (allFacets.enumeration.length === 1) {
        return `z.literal(${JSON.stringify(allFacets.enumeration[0])})`;
      }
      return `z.enum([${allFacets.enumeration.map(v => JSON.stringify(v)).join(', ')}])`;
    }

    // Determine if numeric
    const ultimateBase = this.findUltimateBase(typeDef);
    if (this.isNumericBase(ultimateBase)) {
      return this.generateNumericType({ ...typeDef, base: ultimateBase, facets: allFacets });
    }

    let schema = 'z.string()';
    if (allFacets.length !== undefined) {
      schema += `.length(${allFacets.length})`;
    } else {
      if (allFacets.minLength !== undefined) schema += `.min(${allFacets.minLength})`;
      if (allFacets.maxLength !== undefined) schema += `.max(${allFacets.maxLength})`;
    }
    if (allFacets.pattern && allFacets.pattern.length > 0) {
      if (allFacets.pattern.length === 1) {
        schema += `.regex(/${escapeRegex(allFacets.pattern[0])}/)`;
      } else {
        const combined = allFacets.pattern.map(p => `(?:${escapeRegex(p)})`).join('|');
        schema += `.regex(/^(?:${combined})$/)`;
      }
    }
    return schema;
  }

  collectInheritedFacets(typeDef, allFacets, visited = new Set()) {
    if (!typeDef) return;
    if (typeDef.kind !== 'simple') return;
    if (typeDef.name && visited.has(typeDef.name)) return; // cycle guard
    if (typeDef.name) visited.add(typeDef.name);

    // First collect from base
    if (typeDef.base && !this.isBuiltinType(typeDef.base)) {
      const baseType = this.registry.resolveType(typeDef.base);
      if (baseType) this.collectInheritedFacets(baseType, allFacets, visited);
    }

    // Then override with own facets (own facets take precedence)
    for (const [key, value] of Object.entries(typeDef.facets)) {
      if (key === 'enumeration' || key === 'pattern') {
        // Arrays are replaced entirely
        allFacets[key] = value;
      } else {
        allFacets[key] = value;
      }
    }
  }

  findUltimateBase(typeDef, visited = new Set()) {
    if (!typeDef || typeDef.kind !== 'simple') return 'xsd:string';
    if (typeDef.name && visited.has(typeDef.name)) return typeDef.base || 'xsd:string';
    if (typeDef.name) visited.add(typeDef.name);
    if (this.isBuiltinType(typeDef.base)) return typeDef.base;
    const baseType = this.registry.resolveType(typeDef.base);
    return baseType ? this.findUltimateBase(baseType, visited) : typeDef.base;
  }

  generateComplexType(typeDef) {
    this.depth = (this.depth || 0) + 1;
    if (this.depth > 50) { this.depth--; return 'z.any()'; }

    // SimpleContent extension (value + attributes)
    if (typeDef._simpleContentBase) {
      const baseSchema = this.generateTypeRef(typeDef._simpleContentBase);
      if (typeDef.attributes.length > 0) {
        const props = [`'#text': ${baseSchema}`];
        for (const attr of typeDef.attributes) {
          props.push(this.generateAttributeProp(attr));
        }
        return `z.object({ ${props.join(', ')} })`;
      }
      return baseSchema;
    }

    // ComplexContent extension (base type + additional elements)
    const baseProps = [];
    if (typeDef._extensionBase && !this.isBuiltinType(typeDef._extensionBase)) {
      const baseType = this.registry.resolveType(typeDef._extensionBase);
      if (baseType && baseType.kind === 'complex' && baseType.content) {
        baseProps.push(...this.generateContentElements(baseType.content));
      }
      // Also carry forward base attributes
      if (baseType && baseType.kind === 'complex' && baseType.attributes) {
        for (const attr of baseType.attributes) {
          baseProps.push(this.generateAttributeProp(attr));
        }
      }
    }

    // Own content
    const ownProps = [];
    if (typeDef.content) {
      if (typeDef.content.type === 'choice') {
        // Choice at type level — generate union
        const attrProps = typeDef.attributes.map(a => this.generateAttributeProp(a));
        return this.generateChoiceSchema(typeDef.content, attrProps, baseProps);
      }
      ownProps.push(...this.generateContentElements(typeDef.content));
    }

    // Attributes
    for (const attr of typeDef.attributes) {
      ownProps.push(this.generateAttributeProp(attr));
    }

    const allProps = [...baseProps, ...ownProps];
    if (allProps.length === 0) {
      return 'z.object({})';
    }

    return `z.object({\n${allProps.map(p => '  ' + p).join(',\n')}\n})`;
  }

  generateContentElements(content) {
    const props = [];

    for (const elem of content.elements) {
      if (elem.name.startsWith('__')) {
        // Synthetic nested compositor
        if (elem.inlineType && elem.inlineType.content) {
          if (elem.inlineType.content.type === 'choice') {
            // Inline choice — spread its branches as optional fields
            for (const choiceElem of elem.inlineType.content.elements) {
              if (choiceElem.name.startsWith('__')) {
                // Nested sequence within choice
                if (choiceElem.inlineType && choiceElem.inlineType.content) {
                  for (const seqElem of choiceElem.inlineType.content.elements) {
                    props.push(this.generateElementProp(seqElem, true));
                  }
                }
              } else {
                props.push(this.generateElementProp(choiceElem, true));
              }
            }
          } else {
            // Inline sequence — flatten elements
            const isOptional = elem.minOccurs === '0';
            for (const seqElem of elem.inlineType.content.elements) {
              props.push(this.generateElementProp(seqElem, isOptional));
            }
          }
        }
      } else {
        props.push(this.generateElementProp(elem, false));
      }
    }

    return props;
  }

  generateChoiceSchema(content, attrProps = [], baseProps = []) {
    const branches = [];

    for (const elem of content.elements) {
      if (elem.name.startsWith('__')) {
        // Nested sequence within choice
        if (elem.inlineType && elem.inlineType.content) {
          const seqProps = this.generateContentElements(elem.inlineType.content);
          branches.push(`z.object({ ${[...baseProps, ...attrProps, ...seqProps].join(', ')} })`);
        }
      } else {
        const prop = this.generateElementProp(elem, false);
        branches.push(`z.object({ ${[...baseProps, ...attrProps, prop].join(', ')} })`);
      }
    }

    if (branches.length === 0) return 'z.object({})';
    if (branches.length === 1) return branches[0];

    const isOptional = content.minOccurs === '0';
    const union = `z.union([${branches.join(', ')}])`;
    return isOptional ? `${union}.optional()` : union;
  }

  generateElementProp(elem, forceOptional = false) {
    const name = elem.name;
    let schema = this.generateElementSchema(elem);

    // Handle array (maxOccurs > 1)
    const maxOccurs = elem.maxOccurs;
    const minOccurs = parseInt(elem.minOccurs || '1', 10);

    if (maxOccurs === 'unbounded' || parseInt(maxOccurs, 10) > 1) {
      const max = maxOccurs === 'unbounded' ? '' : `.max(${maxOccurs})`;
      // Coerce single item to array (XML parsers produce object when only 1 element)
      const arraySchema = `z.array(${schema}).min(${minOccurs})${max}`;
      schema = `z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], ${arraySchema})`;
      if (minOccurs === 0 || forceOptional) {
        schema += '.optional()';
      }
    } else if (minOccurs === 0 || forceOptional) {
      schema += '.optional()';
    }

    // Fixed value
    if (elem.fixed) {
      schema = `z.literal(${JSON.stringify(elem.fixed)})`;
      if (minOccurs === 0 || forceOptional) schema += '.optional()';
    }

    return `${JSON.stringify(name)}: ${schema}`;
  }

  generateElementSchema(elem) {
    if (elem.inlineType) {
      if (elem.inlineType.kind === 'simple') {
        return this.generateSimpleType(elem.inlineType);
      } else {
        return this.generateComplexType(elem.inlineType);
      }
    }

    if (elem.typeName) {
      return this.generateTypeRef(elem.typeName);
    }

    return 'z.any()';
  }

  generateTypeRef(typeName) {
    if (this.isBuiltinType(typeName)) {
      return this.builtinToZod(typeName);
    }
    const varName = this.typeToVarName(this.stripPrefix(typeName));
    return varName;
  }

  generateAttributeProp(attr) {
    let schema;

    if (attr.fixed) {
      schema = `z.literal(${JSON.stringify(attr.fixed)})`;
    } else if (attr.inlineType) {
      schema = this.generateSimpleType(attr.inlineType);
    } else if (attr.typeName) {
      schema = this.generateTypeRef(attr.typeName);
    } else {
      schema = 'z.string()';
    }

    if (attr.use !== 'required') {
      schema += '.optional()';
    }

    return `${JSON.stringify('@' + attr.name)}: ${schema}`;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  stripPrefix(name) {
    const idx = name.indexOf(':');
    return idx === -1 ? name : name.substring(idx + 1);
  }

  typeToVarName(typeName) {
    // Convert type name to valid JS variable: TKodKraju → TKodKraju
    return typeName.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  isBuiltinType(name) {
    if (!name) return false;
    const local = this.stripPrefix(name);
    const xsdBuiltins = new Set([
      'string', 'normalizedString', 'token', 'decimal', 'integer', 'int',
      'long', 'short', 'byte', 'nonNegativeInteger', 'positiveInteger',
      'boolean', 'date', 'dateTime', 'time', 'gYear', 'gMonth', 'gDay',
      'duration', 'anyURI', 'base64Binary', 'hexBinary', 'QName', 'NOTATION',
      'float', 'double', 'unsignedInt', 'unsignedShort', 'unsignedByte',
      'unsignedLong', 'nonPositiveInteger', 'negativeInteger',
    ]);
    return name.startsWith('xsd:') || name.startsWith('xs:') || xsdBuiltins.has(local);
  }

  isNumericBase(name) {
    if (!name) return false;
    const local = this.stripPrefix(name);
    return ['decimal', 'integer', 'int', 'long', 'short', 'byte',
      'nonNegativeInteger', 'positiveInteger', 'float', 'double',
      'unsignedInt', 'unsignedShort', 'unsignedByte', 'unsignedLong',
      'nonPositiveInteger', 'negativeInteger'].includes(local);
  }

  isIntegerBase(name) {
    if (!name) return false;
    const local = this.stripPrefix(name);
    return ['integer', 'int', 'long', 'short', 'byte',
      'nonNegativeInteger', 'positiveInteger',
      'unsignedInt', 'unsignedShort', 'unsignedByte', 'unsignedLong',
      'nonPositiveInteger', 'negativeInteger'].includes(local);
  }

  isDateBase(name) {
    if (!name) return false;
    const local = this.stripPrefix(name);
    return ['date', 'dateTime', 'time', 'gYear', 'gMonth', 'gDay', 'duration'].includes(local);
  }

  builtinToZod(name) {
    const local = this.stripPrefix(name);
    switch (local) {
      case 'string':
      case 'normalizedString':
      case 'token':
      case 'anyURI':
      case 'QName':
        return 'z.string()';
      case 'decimal':
      case 'float':
      case 'double':
        return 'z.coerce.number()';
      case 'integer':
      case 'int':
      case 'long':
      case 'short':
      case 'byte':
      case 'nonNegativeInteger':
      case 'positiveInteger':
      case 'unsignedInt':
      case 'unsignedShort':
      case 'unsignedByte':
      case 'unsignedLong':
        return 'z.coerce.number().int()';
      case 'boolean':
        return 'z.coerce.boolean()';
      case 'date':
      case 'dateTime':
      case 'time':
      case 'gYear':
      case 'gMonth':
      case 'gDay':
      case 'duration':
        return 'z.string()';
      case 'base64Binary':
      case 'hexBinary':
        return 'z.string()';
      default:
        return 'z.any()';
    }
  }
}

function escapeRegex(pattern) {
  // Escape forward slashes for use inside JS regex literals /pattern/
  return pattern.replace(/\//g, '\\/');
}

// ─── Main Generator ─────────────────────────────────────────────────────────

function generate() {
  console.log('Generating Zod schemas from KSeF XSD schemas...\n');

  mkdirSync(OUTPUT_DIR, { recursive: true });

  let totalGenerated = 0;
  const allNamespaces = new Map();

  for (const def of SCHEMA_DEFS) {
    const xsdPath = join(SCHEMAS_DIR, def.xsdPath);
    console.log(`Processing ${def.id}: ${def.xsdPath}`);

    try {
      const registry = new TypeRegistry();
      loadedFiles.clear();
      parseXsdFile(xsdPath, registry);

      // Store namespace: prefer explicit def, fall back to detected
      const ns = def.namespace || registry.targetNamespace;
      if (ns) {
        allNamespaces.set(def.id, ns);
        if (!def.namespace) def.namespace = ns;
      }

      const emitter = new ZodEmitter(registry);
      const code = emitter.generateSchemaFile(def.id, def.rootElement);

      const outputPath = join(OUTPUT_DIR, def.outputFile);
      writeFileSync(outputPath, code, 'utf-8');
      console.log(`  → ${def.outputFile} (${registry.types.size} types, ${registry.warnings.length} warnings)`);
      totalGenerated++;
    } catch (e) {
      console.error(`  ERROR: ${e.message}`);
      // Write a fallback file
      const fallbackCode = [
        '// Generated from KSeF XSD schema — do not edit manually',
        '// GENERATION FAILED — using z.any() fallback',
        `// Error: ${e.message}`,
        "import { z } from 'zod';",
        '',
        `export const ${def.id}Schema = z.any();`,
        `export type ${def.id} = z.infer<typeof ${def.id}Schema>;`,
        '',
      ].join('\n');
      writeFileSync(join(OUTPUT_DIR, def.outputFile), fallbackCode, 'utf-8');
      totalGenerated++;
    }
  }

  // Generate index.ts barrel
  generateIndex(allNamespaces);
  totalGenerated++;

  console.log(`\nGenerated ${totalGenerated} files to src/validation/schemas/`);
}

function generateIndex(namespaces) {
  const lines = [
    '// Generated barrel — do not edit manually',
    "// Run: yarn generate-schemas",
    '',
  ];

  for (const def of SCHEMA_DEFS) {
    const modName = def.outputFile.replace('.ts', '.js');
    lines.push(`export { ${def.id}Schema, type ${def.id} } from './${modName}';`);
  }

  lines.push('');
  lines.push('/** Schema type identifiers */');
  lines.push(`export type SchemaType = ${SCHEMA_DEFS.map(d => `'${d.id}'`).join(' | ')};`);
  lines.push('');

  // Namespace map for auto-detection — only include unique namespaces
  // Schemas with shared or no unique namespace use root element detection instead
  lines.push('/** Namespace URI → schema type mapping for auto-detection */');
  lines.push('export const NAMESPACE_MAP: Record<string, SchemaType> = {');
  const seenNs = new Set();
  const duplicateNs = new Set();
  for (const [, ns] of namespaces) {
    if (seenNs.has(ns)) duplicateNs.add(ns);
    seenNs.add(ns);
  }
  for (const [id, ns] of namespaces) {
    if (!duplicateNs.has(ns)) {
      lines.push(`  '${ns}': '${id}',`);
    }
  }
  lines.push('};');
  lines.push('');

  writeFileSync(join(OUTPUT_DIR, 'index.ts'), lines.join('\n'), 'utf-8');
  console.log('  → index.ts (barrel + namespace map)');
}

// ─── Run ────────────────────────────────────────────────────────────────────

generate();
