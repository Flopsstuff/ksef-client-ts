/**
 * Standard base64 over raw bytes, without `Buffer` and without `btoa`.
 *
 * `Buffer` is Node-only, and `btoa` takes a string — feeding it bytes means
 * routing them through `String.fromCharCode`, which is a per-character
 * allocation and a stack limit waiting to be hit. This encoder is a dozen lines
 * and runs the same everywhere, which is what the isomorphic `./pdf` subpath
 * needs from it.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Encode bytes as standard base64, padded with `=`. */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;

  // Three bytes make four characters; the tail is handled after the loop.
  for (; i + 2 < bytes.length; i += 3) {
    const triple = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out +=
      ALPHABET[(triple >> 18) & 63]! +
      ALPHABET[(triple >> 12) & 63]! +
      ALPHABET[(triple >> 6) & 63]! +
      ALPHABET[triple & 63]!;
  }

  const remaining = bytes.length - i;
  if (remaining === 1) {
    const chunk = bytes[i]! << 16;
    out += ALPHABET[(chunk >> 18) & 63]! + ALPHABET[(chunk >> 12) & 63]! + '==';
  } else if (remaining === 2) {
    const chunk = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out +=
      ALPHABET[(chunk >> 18) & 63]! +
      ALPHABET[(chunk >> 12) & 63]! +
      ALPHABET[(chunk >> 6) & 63]! +
      '=';
  }

  return out;
}
