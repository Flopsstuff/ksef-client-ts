import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import { authenticateWithCert } from './helpers/auth.js';
import { pollUntil } from './helpers/polling.js';
import { CertificateService } from '../../src/crypto/certificate-service.js';
import { QrCodeService } from '../../src/qr/qrcode-service.js';

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

  it('should build certificate verification URL and generate QR codes', async () => {
    const { client, nip } = await authenticateWithCert();

    // Generate a key pair for URL signing
    const rsaCert = await CertificateService.generateCompanySeal(
      'QR Test Company', `VATPL-${nip}`, 'QR Test', 'RSA',
    );

    const invoiceHash = crypto.createHash('sha256').update('test invoice content').digest('base64');
    const certSerial = '1234567890';

    // Build certificate verification URL
    const url = client.qr.buildCertificateVerificationUrl(
      'Online', nip, nip, certSerial, invoiceHash, rsaCert.privateKeyPem,
    );
    expect(url).toContain('/certificate/');
    expect(url).toContain(nip);
    expect(url).toContain(certSerial);

    // PNG QR code — verify magic bytes
    const pngBuffer = await QrCodeService.generateQrCode(url);
    expect(pngBuffer[0]).toBe(0x89);
    expect(pngBuffer[1]).toBe(0x50);
    expect(pngBuffer[2]).toBe(0x4e);
    expect(pngBuffer[3]).toBe(0x47);

    // SVG QR code
    const svg = await QrCodeService.generateQrCodeSvg(url);
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox');

    // SVG QR code with label
    const svgLabelled = await QrCodeService.generateQrCodeSvgWithLabel(url, 'CERTYFIKAT');
    expect(svgLabelled).toContain('<svg');
    expect(svgLabelled).toContain('CERTYFIKAT');

    // ECDSA key variant — should produce a different (valid) URL
    const ecCert = await CertificateService.generateCompanySeal(
      'QR EC Test', `VATPL-${nip}`, 'QR EC Test', 'ECDSA',
    );
    const ecUrl = client.qr.buildCertificateVerificationUrl(
      'Online', nip, nip, certSerial, invoiceHash, ecCert.privateKeyPem,
    );
    expect(ecUrl).toContain('/certificate/');
    expect(ecUrl).not.toBe(url);
  });

  it('should complete ECDSA certificate enrollment lifecycle', async () => {
    const { client } = await authenticateWithCert();

    // Step 1: Get enrollment data
    const enrollData = await client.certificates.getEnrollmentData();
    expect(enrollData.commonName).toBeTruthy();

    // Step 2: Generate ECDSA CSR
    const csrResult = await client.crypto.generateCsrEcdsa({
      commonName: enrollData.commonName,
      countryCode: enrollData.countryName,
      organizationName: enrollData.organizationName,
      organizationIdentifier: enrollData.organizationIdentifier,
      serialNumber: enrollData.serialNumber,
      givenName: enrollData.givenName,
      surname: enrollData.surname,
    });
    expect(csrResult.csrDer).toBeInstanceOf(Uint8Array);
    expect(csrResult.csrDer.length).toBeGreaterThan(0);
    expect(csrResult.privateKeyPem).toContain('BEGIN PRIVATE KEY');
    const csrBase64 = Buffer.from(csrResult.csrDer).toString('base64');

    // Step 3: Enroll certificate
    const enrollResp = await client.certificates.enroll({
      certificateName: `E2E ECDSA Cert ${Date.now()}`,
      certificateType: 'Authentication',
      csr: csrBase64,
    });
    expect(enrollResp.referenceNumber).toBeTruthy();

    // Step 4: Poll for enrollment completion
    const enrollStatus = await pollUntil(
      () => client.certificates.getEnrollmentStatus(enrollResp.referenceNumber),
      (s) => s.status.code === 200,
      { intervalMs: 2000, maxAttempts: 30, description: 'ECDSA certificate enrollment' },
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
