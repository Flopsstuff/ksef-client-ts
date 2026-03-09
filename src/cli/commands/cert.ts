import { defineCommand } from 'citty';
import { consola } from 'consola';
import fs from 'node:fs';
import path from 'node:path';
import { requireSession } from '../client-factory.js';
import { outputResult, outputKeyValue, outputTable, outputSuccess, outputWarning } from '../output.js';
import { withErrorHandler } from '../error-handler.js';
import type { GlobalOptions } from '../types.js';
import type { EnrollCertificateRequest, CertificateType, CertificateStatus, QueryCertificatesRequest } from '../../models/certificates/types.js';
import type { CryptoEncryptionMethod } from '../../models/crypto/types.js';
import { CertificateService } from '../../crypto/certificate-service.js';

function getGlobalOpts(args: Record<string, unknown>): GlobalOptions {
  return {
    env: args.env as string | undefined,
    json: args.json as boolean | undefined,
    verbose: args.verbose as boolean | undefined,
    timeout: args.timeout as string | undefined,
    nip: args.nip as string | undefined,
  };
}

const generate = defineCommand({
  meta: { name: 'generate', description: 'Generate a self-signed certificate locally' },
  args: {
    type: { type: 'string', description: 'Certificate type: personal or company-seal', required: true },
    cn: { type: 'string', description: 'Common name (CN)', required: true },
    country: { type: 'string', description: 'Country code', default: 'PL' },
    org: { type: 'string', description: 'Organization name (for company-seal)' },
    'org-identifier': { type: 'string', description: 'Organization identifier (for company-seal)' },
    'given-name': { type: 'string', description: 'Given name (for personal)' },
    surname: { type: 'string', description: 'Surname (for personal)' },
    'serial-number': { type: 'string', description: 'Serial number (for personal)' },
    method: { type: 'string', description: 'Encryption method: RSA or ECDSA', default: 'RSA' },
    out: { type: 'string', description: 'Output directory', default: '.' },
    force: { type: 'boolean', description: 'Overwrite existing files' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const certType = args.type as string;
      const cn = args.cn as string;
      const method = (args.method as CryptoEncryptionMethod) || 'RSA';
      const outDir = path.resolve(args.out as string || '.');

      if (certType !== 'personal' && certType !== 'company-seal') {
        throw new Error('--type must be "personal" or "company-seal".');
      }

      if (method !== 'RSA' && method !== 'ECDSA') {
        throw new Error('--method must be "RSA" or "ECDSA".');
      }

      fs.mkdirSync(outDir, { recursive: true });

      const certPath = path.join(outDir, 'cert.pem');
      const keyPath = path.join(outDir, 'key.pem');

      if (!args.force) {
        if (fs.existsSync(certPath)) {
          throw new Error(`File already exists: ${certPath}. Use --force to overwrite.`);
        }
        if (fs.existsSync(keyPath)) {
          throw new Error(`File already exists: ${keyPath}. Use --force to overwrite.`);
        }
      }

      let result;

      if (certType === 'personal') {
        if (!args['given-name'] || !args.surname || !args['serial-number']) {
          throw new Error('Personal certificate requires --given-name, --surname, and --serial-number.');
        }
        result = await CertificateService.generatePersonalCertificate(
          args['given-name'] as string,
          args.surname as string,
          args['serial-number'] as string,
          cn,
          method,
        );
      } else {
        if (!args.org || !args['org-identifier']) {
          throw new Error('Company seal requires --org and --org-identifier.');
        }
        result = await CertificateService.generateCompanySeal(
          args.org as string,
          args['org-identifier'] as string,
          cn,
          method,
        );
      }

      fs.writeFileSync(certPath, result.certificatePem, 'utf-8');
      fs.writeFileSync(keyPath, result.privateKeyPem, 'utf-8');

      if (args.json) {
        outputResult({ certPath, keyPath, fingerprint: result.fingerprint }, { json: true });
      } else {
        outputSuccess('Certificate generated.');
        outputKeyValue({
          'Fingerprint': result.fingerprint,
          'Certificate': certPath,
          'Private Key': keyPath,
        }, { json: false });
      }
    });
  },
});

const enroll = defineCommand({
  meta: { name: 'enroll', description: 'Submit certificate enrollment' },
  args: {
    cert: { type: 'string', description: 'Path to certificate PEM file', required: true },
    name: { type: 'string', description: 'Certificate name', required: true },
    type: { type: 'string', description: 'Certificate type: Authentication or Offline', required: true },
    'valid-from': { type: 'string', description: 'Valid from date (ISO format)' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client, session } = requireSession(globalOpts);

      const certPem = fs.readFileSync(args.cert as string, 'utf-8');

      await client.crypto.init();

      const request: EnrollCertificateRequest = {
        certificateName: args.name as string,
        certificateType: args.type as CertificateType,
        csr: certPem,
        validFrom: args['valid-from'] as string | undefined,
      };

      const result = await client.certificates.enroll(request, session.accessToken);

      if (args.json) {
        outputResult(result, { json: true });
      } else {
        outputSuccess('Certificate enrollment submitted.');
        outputKeyValue({
          'Reference': result.referenceNumber,
          'Timestamp': result.timestamp,
        }, { json: false });
      }
    });
  },
});

const status = defineCommand({
  meta: { name: 'status', description: 'Check certificate enrollment status' },
  args: {
    ref: { type: 'positional', description: 'Enrollment reference number', required: true },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client, session } = requireSession(globalOpts);
      const ref = args.ref as string;

      const result = await client.certificates.getEnrollmentStatus(ref, session.accessToken);

      if (args.json) {
        outputResult(result, { json: true });
      } else {
        const kv: Record<string, string | number> = {
          'Reference': ref,
          'Status Code': result.status.code,
          'Description': result.status.description,
        };
        if (result.certificateSerialNumber) {
          kv['Certificate Serial'] = result.certificateSerialNumber;
        }
        outputKeyValue(kv, { json: false });
      }
    });
  },
});

const list = defineCommand({
  meta: { name: 'list', description: 'Query certificates' },
  args: {
    serial: { type: 'string', description: 'Filter by serial number' },
    name: { type: 'string', description: 'Filter by name' },
    type: { type: 'string', description: 'Filter by type (Authentication/Offline)' },
    status: { type: 'string', description: 'Filter by status (Active/Blocked/Revoked/Expired)' },
    'expires-after': { type: 'string', description: 'Filter by expiry date (ISO format)' },
    page: { type: 'string', description: 'Page offset' },
    'page-size': { type: 'string', description: 'Number of results per page' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client, session } = requireSession(globalOpts);

      const request: QueryCertificatesRequest = {
        certificateSerialNumber: args.serial as string | undefined,
        name: args.name as string | undefined,
        type: args.type as CertificateType | undefined,
        status: args.status as CertificateStatus | undefined,
        expiresAfter: args['expires-after'] as string | undefined,
      };

      const pageSize = args['page-size'] ? parseInt(args['page-size'] as string, 10) : undefined;
      const pageOffset = args.page ? parseInt(args.page as string, 10) : undefined;

      const result = await client.certificates.query(request, session.accessToken, pageSize, pageOffset);

      if (args.json) {
        outputResult(result, { json: true });
        return;
      }

      if (result.certificates.length === 0) {
        outputWarning('No certificates found.');
        return;
      }

      outputTable(
        result.certificates.map((c) => ({
          serial: c.certificateSerialNumber,
          name: c.name,
          type: c.type,
          status: c.status,
          validFrom: c.validFrom,
          validTo: c.validTo,
        })),
        [
          { key: 'serial', label: 'Serial' },
          { key: 'name', label: 'Name' },
          { key: 'type', label: 'Type' },
          { key: 'status', label: 'Status' },
          { key: 'validFrom', label: 'Valid From' },
          { key: 'validTo', label: 'Valid To' },
        ],
        { json: false },
      );

      if (result.hasMore) {
        consola.info('More results available. Use --page to paginate.');
      }
    });
  },
});

const revoke = defineCommand({
  meta: { name: 'revoke', description: 'Revoke a certificate' },
  args: {
    serial: { type: 'positional', description: 'Certificate serial number', required: true },
    reason: { type: 'string', description: 'Revocation reason' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client, session } = requireSession(globalOpts);
      const serial = args.serial as string;

      await client.certificates.revoke(serial, { reason: args.reason as string | undefined }, session.accessToken);

      if (args.json) {
        outputResult({ status: 'revoked', serialNumber: serial }, { json: true });
      } else {
        outputSuccess(`Certificate ${serial} revoked.`);
      }
    });
  },
});

const limits = defineCommand({
  meta: { name: 'limits', description: 'View certificate limits' },
  args: {
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client, session } = requireSession(globalOpts);

      const result = await client.certificates.getLimits(session.accessToken);

      if (args.json) {
        outputResult(result, { json: true });
      } else {
        outputKeyValue({
          'Can Request': result.canRequest ? 'Yes' : 'No',
          'Enrollment Limit': result.enrollment.limit,
          'Enrollment Remaining': result.enrollment.remaining,
          'Certificate Limit': result.certificate.limit,
          'Certificate Remaining': result.certificate.remaining,
        }, { json: false });
      }
    });
  },
});

export const certCommand = defineCommand({
  meta: { name: 'cert', description: 'Certificate management commands' },
  subCommands: { generate, enroll, status, list, revoke, limits },
});
