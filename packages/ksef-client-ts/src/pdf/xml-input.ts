/**
 * Turning the renderer's raw input into XML text.
 *
 * KSeF itself takes UTF-8, but invoices and receipts saved by other tools — a
 * Windows export, a .NET serializer — arrive in UTF-16 just as often, and
 * decoding those bytes as UTF-8 yields a string of NULs that no detector
 * recognizes. The encoding is read from the bytes the way the XML spec's
 * autodetection does it: a byte order mark first, then the shape of the opening
 * `<`. Nothing here reads the `encoding` pseudo-attribute — it may disagree
 * with the bytes, and the bytes are what has to be decoded.
 *
 * Only global `TextDecoder` and `utf-16le` are used: every runtime ships that
 * label, while `utf-16be` depends on the ICU build, so big-endian input is
 * byte-swapped first. No `node:*` import, so the module stays isomorphic.
 */
import { stripBom } from '../xml/xml-engine.js';

type Utf16 = 'utf-16le' | 'utf-16be';

function detectUtf16(bytes: Uint8Array): Utf16 | null {
  const [b0, b1] = bytes;
  // BOM `FF FE` / `FE FF`, or no BOM and a `<` as the first code unit.
  if ((b0 === 0xff && b1 === 0xfe) || (b0 === 0x3c && b1 === 0x00)) return 'utf-16le';
  if ((b0 === 0xfe && b1 === 0xff) || (b0 === 0x00 && b1 === 0x3c)) return 'utf-16be';
  return null;
}

/** Copy of `bytes` with each 16-bit pair swapped; a dangling last byte is kept. */
function swapByteOrder(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  const even = bytes.length - (bytes.length % 2);
  for (let i = 0; i < even; i += 2) {
    out[i] = bytes[i + 1]!;
    out[i + 1] = bytes[i]!;
  }
  if (even < bytes.length) out[even] = bytes[even]!;
  return out;
}

/**
 * Decode XML bytes as UTF-8, UTF-16LE or UTF-16BE, with or without a byte order
 * mark, and drop the mark.
 *
 * Malformed input is decoded leniently, as UTF-8 always was here: an odd byte
 * count in UTF-16 — a truncated file, or a newline some tool appended as a
 * single byte — leaves one U+FFFD at the end rather than failing the render.
 */
export function decodeXmlBytes(bytes: Uint8Array): string {
  const utf16 = detectUtf16(bytes);
  // `ignoreBOM` keeps the mark in the output so that `stripBom` is the one
  // place it is removed, for bytes and strings alike.
  const text =
    utf16 === null
      ? new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)
      : new TextDecoder('utf-16le', { ignoreBOM: true }).decode(
          utf16 === 'utf-16be' ? swapByteOrder(bytes) : bytes,
        );
  return stripBom(text);
}

/** The renderer's input as XML text: bytes are decoded, a string loses its BOM. */
export function toXmlString(input: string | Uint8Array): string {
  return typeof input === 'string' ? stripBom(input) : decodeXmlBytes(input);
}
