import { describe, expect, it } from 'vitest';
import { KSeFClient } from '../../src/client.js';
import type { DeprecationNotice } from '../../src/config/options.js';
import { CertificateService } from '../../src/crypto/certificate-service.js';
import { generateRandomNip } from './helpers/identifiers.js';

describe('40 - Deprecation headers', { timeout: 120_000 }, () => {
  it('receives a sunset date for the deprecated token list', async () => {
    const notices: DeprecationNotice[] = [];
    const client = new KSeFClient({
      environment: 'TEST',
      onDeprecation: (notice) => notices.push(notice),
    });
    const nip = generateRandomNip();
    const cert = await CertificateService.generateCompanySeal(
      'E2E Test Company', `VATPL-${nip}`, `E2E Test ${nip}`, 'RSA',
    );
    await client.loginWithCertificate(cert.certificatePem, cert.privateKeyPem, nip);

    await client.tokens.queryTokens();

    const tokenList = notices.find((notice) => notice.method === 'GET' && notice.path === 'tokens');
    const summary = notices.map((notice) => ({
      method: notice.method,
      path: notice.path,
      deprecatedSince: notice.deprecatedSince?.toISOString(),
      sunset: notice.sunset?.toISOString(),
      rawDeprecation: notice.rawDeprecation,
      rawSunset: notice.rawSunset,
    }));
    expect(tokenList, JSON.stringify(summary)).toBeDefined();
    expect(tokenList?.sunset, JSON.stringify(summary)).toBeInstanceOf(Date);
    expect(tokenList?.deprecatedSince, JSON.stringify(summary)).toBeInstanceOf(Date);
    expect(tokenList?.rawDeprecation, JSON.stringify(summary)).toMatch(/^@\d+$/);
    expect(tokenList?.rawSunset, JSON.stringify(summary)).toEqual(expect.any(String));
  });
});
