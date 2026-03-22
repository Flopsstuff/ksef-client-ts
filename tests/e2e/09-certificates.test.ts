import { describe, it, expect } from 'vitest';
import { authenticateWithCert } from './helpers/auth.js';
import { pollUntil } from './helpers/polling.js';

describe('09 - Certificate Enrollment', { timeout: 120_000 }, () => {
  it('should get certificate limits', async () => {
    const { client } = await authenticateWithCert();
    const limits = await client.certificates.getLimits();
    expect(limits).toHaveProperty('canRequest');
    expect(limits).toHaveProperty('enrollment');
    expect(limits).toHaveProperty('certificate');
  });

  it('should complete certificate enrollment lifecycle', async () => {
    const { client } = await authenticateWithCert();

    // Step 1: Get enrollment data
    const enrollData = await client.certificates.getEnrollmentData();
    expect(enrollData.commonName).toBeTruthy();
    expect(enrollData.countryName).toBeTruthy();

    // Step 2: Generate CSR
    const csrResult = await client.crypto.generateCsrRsa({
      commonName: enrollData.commonName,
      countryCode: enrollData.countryName,
      organizationName: enrollData.organizationName,
      organizationIdentifier: enrollData.organizationIdentifier,
      serialNumber: enrollData.serialNumber,
      givenName: enrollData.givenName,
      surname: enrollData.surname,
    });
    const csrBase64 = Buffer.from(csrResult.csrDer).toString('base64');

    // Step 3: Enroll certificate
    const enrollResp = await client.certificates.enroll({
      certificateName: `E2E Test Cert ${Date.now()}`,
      certificateType: 'Authentication',
      csr: csrBase64,
    });
    expect(enrollResp.referenceNumber).toBeTruthy();

    // Step 4: Poll for enrollment completion
    const enrollStatus = await pollUntil(
      () => client.certificates.getEnrollmentStatus(enrollResp.referenceNumber),
      (s) => s.status.code === 200,
      { intervalMs: 2000, maxAttempts: 30, description: 'certificate enrollment' },
    );
    expect(enrollStatus.certificateSerialNumber).toBeTruthy();
    const serialNumber = enrollStatus.certificateSerialNumber!;

    // Step 5: Retrieve certificate
    const retrieved = await client.certificates.retrieve({
      certificateSerialNumbers: [serialNumber],
    });
    expect(retrieved.certificates.length).toBe(1);
    expect(retrieved.certificates[0]!.certificateSerialNumber).toBe(serialNumber);

    // Step 6: Revoke certificate
    await client.certificates.revoke(serialNumber, { revocationReason: 'KeyCompromise' });

    // Step 7: Query to verify it exists in records
    const queryResult = await client.certificates.query({
      certificateSerialNumber: serialNumber,
    });
    expect(queryResult.certificates.length).toBeGreaterThan(0);
  });
});
