import { readFileSync } from 'node:fs';
import type {
  CertificateSubjectLimitsOverride,
  EnrollmentSubjectLimitsOverride,
  SetSubjectLimitsRequest,
  TokensEffectiveContextLimits,
} from '../../../src/models/limits/types.js';

describe('subject limit overrides (KSeF API v2.10.0)', () => {
  it('requires maxEnrollments and maxCertificates on override objects', () => {
    const enrollment: EnrollmentSubjectLimitsOverride = { maxEnrollments: 10 };
    const certificate: CertificateSubjectLimitsOverride = { maxCertificates: 5 };
    const request: SetSubjectLimitsRequest = { enrollment, certificate };

    expect(request.enrollment?.maxEnrollments).toBe(10);
    expect(request.certificate?.maxCertificates).toBe(5);
  });

  it('matches EnrollmentSubjectLimitsOverride / CertificateSubjectLimitsOverride required fields in the vendored OpenAPI spec', () => {
    const spec = JSON.parse(
      readFileSync(new URL('../../../docs/open-api.json', import.meta.url), 'utf8'),
    ) as {
      components: {
        schemas: Record<string, { required?: string[]; properties?: Record<string, unknown> }>;
      };
    };

    expect(spec.components.schemas.EnrollmentSubjectLimitsOverride?.required).toEqual([
      'maxEnrollments',
    ]);
    expect(spec.components.schemas.CertificateSubjectLimitsOverride?.required).toEqual([
      'maxCertificates',
    ]);
  });
});

describe('TokensEffectiveContextLimits', () => {
  it('exposes maxTokens', () => {
    const tokens: TokensEffectiveContextLimits = { maxTokens: 100 };
    expect(tokens.maxTokens).toBe(100);
  });

  it('matches TokensEffectiveContextLimits in the vendored OpenAPI spec', () => {
    const spec = JSON.parse(
      readFileSync(new URL('../../../docs/open-api.json', import.meta.url), 'utf8'),
    ) as {
      components: {
        schemas: Record<string, { required?: string[]; properties?: Record<string, unknown> }>;
      };
    };
    const schema = spec.components.schemas.TokensEffectiveContextLimits;

    expect(schema?.required).toEqual(['maxTokens']);
    expect(schema?.properties).toHaveProperty('maxTokens');
  });
});
