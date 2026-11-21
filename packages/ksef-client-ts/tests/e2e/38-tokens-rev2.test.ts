import { describe, it, expect, beforeAll } from 'vitest';
import { authenticateWithCert, createTestClient } from './helpers/auth.js';
import { pollUntil } from './helpers/polling.js';
import type { KSeFClient } from '../../src/client.js';
import type { TokenStatusResponseRev2, TokenStatusRev2Code } from '../../src/models/tokens/types.js';
import { KSeFBadRequestError } from '../../src/errors/ksef-bad-request-error.js';
import { KSeFErrorCode } from '../../src/errors/error-codes.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('38 - Tokens rev2', { timeout: 180_000 }, () => {
  let client: KSeFClient;
  let nip: string;

  beforeAll(async () => {
    ({ client, nip } = await authenticateWithCert());
  });

  function waitForStatus(ref: string, code: TokenStatusRev2Code): Promise<TokenStatusResponseRev2> {
    return pollUntil(
      () => client.tokens.getTokenRev2(ref),
      (t) => t.status.code === code,
      { intervalMs: 2_000, maxAttempts: 45 },
    );
  }

  async function tryRevoke(ref: string | undefined): Promise<void> {
    if (!ref) return;
    try {
      await client.tokens.revokeToken(ref);
    } catch {
      // best-effort cleanup must not mask the test result
    }
  }

  async function expectBadRequestCode(promise: Promise<unknown>, code: number): Promise<void> {
    const err = await promise.then(() => undefined, (e: unknown) => e);
    expect(err).toBeInstanceOf(KSeFBadRequestError);
    expect((err as KSeFBadRequestError).errors.map((e) => e.code)).toContain(code);
  }

  async function tokenSession(token: string): Promise<KSeFClient> {
    const tokenClient = createTestClient();
    await tokenClient.loginWithToken(token, nip);
    return tokenClient;
  }

  it('generates with validTo, becomes Active, is queryable and revocable', async () => {
    const description = `E2E rev2 lifecycle ${Date.now()}`;
    const validTo = new Date(Date.now() + 7 * DAY_MS);
    const generated = await client.tokens.generateTokenRev2({
      description,
      permissions: ['InvoiceRead', 'InvoiceWrite'],
      validTo: validTo.toISOString(),
    });
    expect(generated.referenceNumber).toBeTruthy();
    expect(generated.token).toBeTruthy();

    try {
      const active = await waitForStatus(generated.referenceNumber, 'Active');
      expect(active.status.rawCode).toBe('Active');
      expect(active.status.displayName).toBeTruthy();
      expect(Date.parse(active.validFrom)).not.toBeNaN();
      expect(Math.abs(Date.parse(active.validTo) - validTo.getTime())).toBeLessThan(60_000);
      expect(active.requestedPermissions.map((p) => p.code).sort()).toEqual(['InvoiceRead', 'InvoiceWrite']);
      expect(active.authorIdentifier.type.code).toBe('Nip');
      expect(active.contextIdentifier.value).toBe(nip);

      const queried = await client.tokens.queryTokensRev2({ description, status: ['Active'] });
      expect(queried.tokens.map((t) => t.referenceNumber)).toContain(generated.referenceNumber);
      expect(queried.tokens.every((t) => t.status.code === 'Active')).toBe(true);

      await client.tokens.revokeToken(generated.referenceNumber);
      await waitForStatus(generated.referenceNumber, 'Revoked');
    } finally {
      await tryRevoke(generated.referenceNumber);
    }
  });

  it('a token with a future validFrom is NotYetActive', async () => {
    const description = `E2E rev2 future ${Date.now()}`;
    const validFrom = new Date(Date.now() + 2 * DAY_MS);
    const generated = await client.tokens.generateTokenRev2({
      description,
      permissions: ['InvoiceRead'],
      validFrom: validFrom.toISOString(),
      validTo: new Date(validFrom.getTime() + 7 * DAY_MS).toISOString(),
    });

    try {
      const token = await waitForStatus(generated.referenceNumber, 'NotYetActive');
      expect(Math.abs(Date.parse(token.validFrom) - validFrom.getTime())).toBeLessThan(60_000);

      const queried = await client.tokens.queryTokensRev2({ description, status: ['NotYetActive'] });
      expect(queried.tokens.map((t) => t.referenceNumber)).toContain(generated.referenceNumber);
    } finally {
      await tryRevoke(generated.referenceNumber);
    }
  });

  it('a token generated in a token session awaits approval; only a certificate session can approve it', async () => {
    const marker = `E2E rev2 approve ${Date.now()}`;
    const root = await client.tokens.generateTokenRev2({
      description: `${marker} root`,
      permissions: ['InvoiceRead', 'InvoiceWrite'],
    });
    let childRef: string | undefined;

    try {
      await waitForStatus(root.referenceNumber, 'Active');
      const rootSession = await tokenSession(root.token);

      const child = await rootSession.tokens.generateTokenRev2({
        description: `${marker} child`,
        permissions: ['InvoiceRead'],
      });
      childRef = child.referenceNumber;
      await waitForStatus(childRef, 'AwaitingApproval');

      const awaiting = await client.tokens.queryTokensRev2({ description: marker, status: ['AwaitingApproval'] });
      expect(awaiting.tokens.map((t) => t.referenceNumber)).toContain(childRef);

      await expectBadRequestCode(
        rootSession.tokens.approveToken(childRef),
        KSeFErrorCode.TokenApprovalAuthMethodNotAllowed,
      );

      await client.tokens.approveToken(childRef);
      await waitForStatus(childRef, 'Active');
    } finally {
      await tryRevoke(childRef);
      await tryRevoke(root.referenceNumber);
    }
  });

  it('expireTokenApproval moves the token to ApprovalExpired; approving it then fails', async () => {
    const marker = `E2E rev2 expire ${Date.now()}`;
    const root = await client.tokens.generateTokenRev2({
      description: `${marker} root`,
      permissions: ['InvoiceRead', 'InvoiceWrite'],
    });
    let childRef: string | undefined;

    try {
      await waitForStatus(root.referenceNumber, 'Active');
      const rootSession = await tokenSession(root.token);

      const child = await rootSession.tokens.generateTokenRev2({
        description: `${marker} child`,
        permissions: ['InvoiceRead'],
      });
      childRef = child.referenceNumber;
      await waitForStatus(childRef, 'AwaitingApproval');

      await client.testData.expireTokenApproval(childRef);
      const expired = await waitForStatus(childRef, 'ApprovalExpired');
      expect(expired.status.rawCode).toBe('ApprovalExpired');

      await expectBadRequestCode(
        client.tokens.approveToken(childRef),
        KSeFErrorCode.TokenStatusDisallowsOperation,
      );
    } finally {
      await tryRevoke(childRef);
      await tryRevoke(root.referenceNumber);
    }
  });

  it('rejects a description shorter than 5 characters', async () => {
    await expect(
      client.tokens.generateTokenRev2({ description: 'abc', permissions: ['InvoiceRead'] }),
    ).rejects.toBeInstanceOf(KSeFBadRequestError);
  });
});
