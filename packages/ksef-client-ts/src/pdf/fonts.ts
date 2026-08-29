/**
 * Lazy `pdfmake` acquisition. `pdfmake` is an optional peer, so this is called
 * only from a render path — never at module load — which keeps `./pdf` a "cold"
 * import (see the subpath contract). On absence or an incompatible version we
 * throw a friendly, actionable error instead of a raw resolver crash.
 *
 * The version guard checks `^0.2.20` (`>=0.2.20 <0.3.0`) by semver, not by
 * feature-detection: the spike showed 0.3.x can pass shallow shape checks yet
 * hang in `getBuffer`, so only the version number is trustworthy.
 */
import { createRequire } from 'node:module';
import { KSeFPdfError } from './errors.js';

const REQUIRED_RANGE = '^0.2.20';
const INSTALL_HINT = `npm i "pdfmake@${REQUIRED_RANGE}"`;

/**
 * Minimal structural view of the pdfmake browser build we depend on.
 *
 * `getStream` rather than `getBuffer`: pdfmake reports a failure raised inside
 * document assembly (a malformed or unsupported image, say) on the stream's
 * `error` event, whereas `getBuffer`'s callback has no error channel at all.
 */
export interface PdfMakeLike {
  createPdf(docDefinition: unknown): { getStream(): PdfDocStream };
  vfs?: unknown;
}

/** The subset of pdfmake's PDFKit document stream `createPdfBuffer` drives. */
export interface PdfDocStream {
  on(event: 'data', cb: (chunk: Uint8Array) => void): void;
  on(event: 'end', cb: () => void): void;
  on(event: 'error', cb: (err: unknown) => void): void;
  end(): void;
}

function missingError(): KSeFPdfError {
  return new KSeFPdfError(
    `PDF rendering requires the optional peer dependency "pdfmake" (${REQUIRED_RANGE}), ` +
      `which is not installed. Install it with: ${INSTALL_HINT}`,
  );
}

/**
 * True iff `version` satisfies `^0.2.20` — i.e. `0.2.x` with `x >= 20`.
 *
 * The pattern is anchored at both ends and admits build metadata but not a
 * prerelease tag, which is what `^0.2.20` means: SemVer ranges exclude
 * prereleases unless the comparator carries one of its own. Matching a numeric
 * prefix alone let `0.2.20-beta.1` through the compatibility guard — a build
 * the range does not accept and this renderer has not been tried against.
 */
export function satisfiesRequiredRange(version: string): boolean {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:\+[0-9A-Za-z.-]+)?$/.exec(version.trim());
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  return major === 0 && minor === 2 && patch >= 20;
}

function readPdfmakeVersion(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require('pdfmake/package.json') as { version?: string };
    return typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  }
}

/**
 * Assert the resolved pdfmake version is supported. `null` (not installed) →
 * friendly install error; a version outside `^0.2.20` (e.g. 0.3.x) → a clear
 * incompatible-version error. Extracted so it is unit-testable without a
 * live install.
 */
export function assertPdfmakeVersion(version: string | null): void {
  if (version === null) throw missingError();
  if (!satisfiesRequiredRange(version)) {
    throw new KSeFPdfError(
      `PDF rendering requires pdfmake ${REQUIRED_RANGE}, but found ${version}. ` +
        `pdfmake 0.3.x is not supported yet (incompatible import/VFS shape). Install: ${INSTALL_HINT}`,
    );
  }
}

/** Normalize the `vfs_fonts` module across shapes into the font map to assign. */
export function normalizeVfs(mod: unknown): unknown {
  const m = mod as { default?: unknown; vfs?: unknown; pdfMake?: { vfs?: unknown } } | undefined;
  const cand = (m && 'default' in m ? m.default : m) as
    | { vfs?: unknown; pdfMake?: { vfs?: unknown } }
    | undefined;
  if (cand && typeof cand === 'object') {
    if ('vfs' in cand && cand.vfs) return cand.vfs;
    if (cand.pdfMake && cand.pdfMake.vfs) return cand.pdfMake.vfs;
  }
  return cand;
}

/**
 * Resolve, version-check, and initialize pdfmake with the bundled Roboto VFS.
 * Throws {@link KSeFPdfError} if pdfmake is absent or outside `^0.2.20`.
 */
export async function loadPdfMake(): Promise<PdfMakeLike> {
  assertPdfmakeVersion(readPdfmakeVersion());

  let pdfmakeMod: unknown;
  let vfsMod: unknown;
  try {
    pdfmakeMod = await import('pdfmake/build/pdfmake.js');
    vfsMod = await import('pdfmake/build/vfs_fonts.js');
  } catch {
    throw missingError();
  }

  const namespace = pdfmakeMod as { default?: PdfMakeLike };
  const pdfMake = (namespace.default ?? (pdfmakeMod as PdfMakeLike));
  pdfMake.vfs = normalizeVfs(vfsMod);
  return pdfMake;
}

/**
 * Render a pdfmake document definition to PDF bytes.
 *
 * Document assembly is asynchronous, so a failure inside it lands long after
 * this function has returned and cannot be caught by a `try` around the call.
 * Draining the document stream gives those failures somewhere to go: the
 * `error` event settles the promise instead of leaving it pending and letting
 * the rejection escape to the process. pdfmake emits a plain string there, so
 * anything that is not an `Error` is wrapped.
 */
export function createPdfBuffer(pdfMake: PdfMakeLike, docDefinition: unknown): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    const fail = (err: unknown): void => {
      reject(err instanceof Error ? err : new KSeFPdfError(String(err)));
    };

    let stream: PdfDocStream;
    try {
      stream = pdfMake.createPdf(docDefinition).getStream();
    } catch (err) {
      fail(err);
      return;
    }

    const chunks: Uint8Array[] = [];
    let size = 0;
    stream.on('data', (chunk) => {
      chunks.push(chunk);
      size += chunk.length;
    });
    stream.on('end', () => {
      const out = new Uint8Array(size);
      let at = 0;
      for (const chunk of chunks) {
        out.set(chunk, at);
        at += chunk.length;
      }
      resolve(out);
    });
    stream.on('error', fail);

    try {
      stream.end();
    } catch (err) {
      fail(err);
    }
  });
}
