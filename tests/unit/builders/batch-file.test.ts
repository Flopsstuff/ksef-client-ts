import * as crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  BatchFileBuilder,
  BATCH_MAX_PART_SIZE,
  BATCH_MAX_TOTAL_SIZE,
  BATCH_MAX_PARTS,
} from '../../../src/builders/batch-file.js';
import { KSeFValidationError } from '../../../src/errors/ksef-validation-error.js';

function sha256Base64(data: Uint8Array): string {
  return crypto.createHash('sha256').update(data).digest('base64');
}

/** Identity encrypt — returns the same bytes (for testing split logic). */
const identityEncrypt = (part: Uint8Array): Uint8Array => part;

/** Deterministic "encrypt" — XORs every byte with 0x42. */
const xorEncrypt = (part: Uint8Array): Uint8Array => {
  const out = new Uint8Array(part.length);
  for (let i = 0; i < part.length; i++) out[i] = part[i]! ^ 0x42;
  return out;
};

function randomBytes(size: number): Uint8Array {
  return crypto.randomBytes(size);
}

describe('BatchFileBuilder', () => {
  describe('splitting', () => {
    it('produces 1 part for data smaller than maxPartSize', () => {
      const data = randomBytes(1000);
      const result = BatchFileBuilder.build(data, identityEncrypt, { maxPartSize: 5000 });
      expect(result.encryptedParts).toHaveLength(1);
      expect(result.batchFile.fileParts).toHaveLength(1);
    });

    it('produces 1 part for data exactly at maxPartSize', () => {
      const data = randomBytes(5000);
      const result = BatchFileBuilder.build(data, identityEncrypt, { maxPartSize: 5000 });
      expect(result.encryptedParts).toHaveLength(1);
    });

    it('produces 2 parts for data at maxPartSize + 1', () => {
      const data = randomBytes(5001);
      const result = BatchFileBuilder.build(data, identityEncrypt, { maxPartSize: 5000 });
      expect(result.encryptedParts).toHaveLength(2);
      expect(result.batchFile.fileParts).toHaveLength(2);
    });

    it('produces correct number of parts for larger data', () => {
      const data = randomBytes(25000);
      const result = BatchFileBuilder.build(data, identityEncrypt, { maxPartSize: 10000 });
      expect(result.encryptedParts).toHaveLength(3);
    });

    it('splits with last part smaller than others', () => {
      const data = randomBytes(12000);
      const result = BatchFileBuilder.build(data, identityEncrypt, { maxPartSize: 5000 });
      expect(result.encryptedParts).toHaveLength(3);
      expect(result.encryptedParts[0]!.length).toBe(5000);
      expect(result.encryptedParts[1]!.length).toBe(5000);
      expect(result.encryptedParts[2]!.length).toBe(2000);
    });

    it('raw part sizes sum to original size (identity encrypt)', () => {
      const data = randomBytes(17777);
      const result = BatchFileBuilder.build(data, identityEncrypt, { maxPartSize: 5000 });
      const total = result.encryptedParts.reduce((sum, p) => sum + p.length, 0);
      expect(total).toBe(17777);
    });

    it('respects custom maxPartSize', () => {
      const data = randomBytes(300);
      const result = BatchFileBuilder.build(data, identityEncrypt, { maxPartSize: 100 });
      expect(result.encryptedParts).toHaveLength(3);
    });

    it('uses default BATCH_MAX_PART_SIZE when no option given', () => {
      const data = randomBytes(1000);
      const result = BatchFileBuilder.build(data, identityEncrypt);
      // Data is smaller than 100MB default → 1 part
      expect(result.encryptedParts).toHaveLength(1);
    });
  });

  describe('hashing', () => {
    it('batchFile.fileHash is SHA-256 base64 of original unencrypted ZIP', () => {
      const data = randomBytes(5000);
      const result = BatchFileBuilder.build(data, xorEncrypt, { maxPartSize: 2000 });
      expect(result.batchFile.fileHash).toBe(sha256Base64(data));
    });

    it('fileParts[i].fileHash is SHA-256 base64 of encrypted part', () => {
      const data = randomBytes(5000);
      const result = BatchFileBuilder.build(data, xorEncrypt, { maxPartSize: 2000 });
      for (let i = 0; i < result.encryptedParts.length; i++) {
        expect(result.batchFile.fileParts[i]!.fileHash).toBe(sha256Base64(result.encryptedParts[i]!));
      }
    });

    it('batchFile.fileHash differs from encrypted part hashes', () => {
      const data = randomBytes(1000);
      const result = BatchFileBuilder.build(data, xorEncrypt);
      expect(result.batchFile.fileHash).not.toBe(result.batchFile.fileParts[0]!.fileHash);
    });
  });

  describe('metadata', () => {
    it('batchFile.fileSize equals unencrypted ZIP length', () => {
      const data = randomBytes(7777);
      const result = BatchFileBuilder.build(data, identityEncrypt, { maxPartSize: 3000 });
      expect(result.batchFile.fileSize).toBe(7777);
    });

    it('fileParts[i].fileSize equals encrypted part length', () => {
      // xorEncrypt preserves size; use a padding encrypt to test different sizes
      const paddingEncrypt = (part: Uint8Array): Uint8Array => {
        const padded = new Uint8Array(part.length + 16);
        padded.set(part);
        return padded;
      };
      const data = randomBytes(5000);
      const result = BatchFileBuilder.build(data, paddingEncrypt, { maxPartSize: 2000 });
      for (let i = 0; i < result.encryptedParts.length; i++) {
        expect(result.batchFile.fileParts[i]!.fileSize).toBe(result.encryptedParts[i]!.length);
      }
    });

    it('ordinalNumber is 1-based and sequential', () => {
      const data = randomBytes(10000);
      const result = BatchFileBuilder.build(data, identityEncrypt, { maxPartSize: 3000 });
      const ordinals = result.batchFile.fileParts.map((p) => p.ordinalNumber);
      expect(ordinals).toEqual([1, 2, 3, 4]);
    });

    it('fileParts count matches encryptedParts count', () => {
      const data = randomBytes(9999);
      const result = BatchFileBuilder.build(data, identityEncrypt, { maxPartSize: 4000 });
      expect(result.batchFile.fileParts.length).toBe(result.encryptedParts.length);
    });
  });

  describe('validation', () => {
    it('throws on empty data', () => {
      expect(() => BatchFileBuilder.build(new Uint8Array(0), identityEncrypt))
        .toThrow(KSeFValidationError);
    });

    it('throws when data exceeds 5 GB', () => {
      // We can't allocate 5GB in tests, so test the constant check
      const mockData = { length: BATCH_MAX_TOTAL_SIZE + 1 } as Uint8Array;
      expect(() => BatchFileBuilder.build(mockData, identityEncrypt))
        .toThrow('exceeds maximum');
    });

    it('throws when parts exceed maximum of 50', () => {
      const data = randomBytes(5100);
      expect(() => BatchFileBuilder.build(data, identityEncrypt, { maxPartSize: 100 }))
        .toThrow(`${BATCH_MAX_PARTS}`);
    });

    it('throws on maxPartSize of 0', () => {
      const data = randomBytes(100);
      expect(() => BatchFileBuilder.build(data, identityEncrypt, { maxPartSize: 0 }))
        .toThrow(KSeFValidationError);
    });

    it('throws on negative maxPartSize', () => {
      const data = randomBytes(100);
      expect(() => BatchFileBuilder.build(data, identityEncrypt, { maxPartSize: -1 }))
        .toThrow(KSeFValidationError);
    });
  });

  describe('encryptFn integration', () => {
    it('calls encryptFn once per part', () => {
      const data = randomBytes(10000);
      let callCount = 0;
      const countingEncrypt = (part: Uint8Array): Uint8Array => {
        callCount++;
        return part;
      };
      const result = BatchFileBuilder.build(data, countingEncrypt, { maxPartSize: 3000 });
      expect(callCount).toBe(result.encryptedParts.length);
    });

    it('passes correct raw data to encryptFn', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const receivedParts: Uint8Array[] = [];
      const capturingEncrypt = (part: Uint8Array): Uint8Array => {
        receivedParts.push(new Uint8Array(part));
        return part;
      };
      BatchFileBuilder.build(data, capturingEncrypt, { maxPartSize: 4 });
      expect(receivedParts).toHaveLength(3);
      expect(Array.from(receivedParts[0]!)).toEqual([1, 2, 3, 4]);
      expect(Array.from(receivedParts[1]!)).toEqual([5, 6, 7, 8]);
      expect(Array.from(receivedParts[2]!)).toEqual([9, 10]);
    });
  });
});
