import { randomInt, randomUUID } from 'node:crypto';
import { isValidNip, isValidPesel } from '../../../src/validation/patterns.js';

/**
 * Generate a valid random Polish NIP (10-digit tax identifier).
 * Generates 9 random digits (respecting XSD TNIP pattern), then finds
 * the checksum digit using isValidNip() from src/validation/patterns.ts.
 */
export function generateRandomNip(): string {
  for (;;) {
    const digits: number[] = [];
    digits.push(randomInt(1, 10)); // digit 1: 1-9
    // digits 2-3: ensure not both 0 (XSD TNIP pattern)
    const d2 = randomInt(0, 10);
    const d3 = randomInt(0, 10);
    if (d2 === 0 && d3 === 0) {
      digits.push(randomInt(1, 10), randomInt(0, 10));
    } else {
      digits.push(d2, d3);
    }
    for (let i = 3; i < 9; i++) {
      digits.push(randomInt(0, 10));
    }

    const prefix = digits.join('');
    for (let c = 0; c <= 9; c++) {
      const candidate = prefix + c;
      if (isValidNip(candidate)) return candidate;
    }
    // No valid checksum digit (mod 11 === 10) — retry with new random digits
  }
}

/**
 * Generate a valid random Polish PESEL (11-digit personal identifier).
 * Uses a random date in the 2000s range (month encoded as +20).
 * Finds the checksum digit using isValidPesel() from src/validation/patterns.ts.
 */
export function generateRandomPesel(): string {
  const year = randomInt(0, 24); // 2000-2023
  const month = randomInt(1, 13) + 20; // +20 for 2000s century encoding
  const day = randomInt(1, 29); // safe range for all months

  const digits: number[] = [
    Math.floor(year / 10), year % 10,
    Math.floor(month / 10), month % 10,
    Math.floor(day / 10), day % 10,
    randomInt(0, 10), randomInt(0, 10), randomInt(0, 10), randomInt(0, 10),
  ];

  const prefix = digits.join('');
  for (let c = 0; c <= 9; c++) {
    const candidate = prefix + c;
    if (isValidPesel(candidate)) return candidate;
  }
  throw new Error(`Failed to generate valid PESEL for prefix ${prefix}`);
}

/**
 * Generate a unique invoice number using a UUID.
 */
export function generateUniqueInvoiceNumber(): string {
  return randomUUID();
}
