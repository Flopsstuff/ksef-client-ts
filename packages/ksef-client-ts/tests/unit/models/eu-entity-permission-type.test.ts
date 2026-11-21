import { readFileSync } from 'node:fs';
import type {
  EuEntityPermissionType,
  EuEntityPermissionsQueryPermissionType,
} from '../../../src/models/permissions/types.js';

describe('EuEntityPermissionType', () => {
  function assertExhaustive(p: EuEntityPermissionType): void {
    switch (p) {
      case 'InvoiceRead':
      case 'InvoiceWrite':
      case 'CollectiveIdentifierManage':
        return;
      default: {
        const _never: never = p;
        return _never;
      }
    }
  }

  const all: EuEntityPermissionType[] = [
    'InvoiceRead',
    'InvoiceWrite',
    'CollectiveIdentifierManage',
  ];

  it('covers every value of the type', () => {
    for (const p of all) assertExhaustive(p);
    expect(new Set(all).size).toBe(all.length);
  });

  it('matches the EuEntityPermissionType enum in the vendored OpenAPI spec', () => {
    const spec = JSON.parse(
      readFileSync(new URL('../../../docs/open-api.json', import.meta.url), 'utf8'),
    ) as { components: { schemas: Record<string, { enum?: string[] }> } };
    const specEnum = spec.components.schemas.EuEntityPermissionType?.enum;

    expect(specEnum).toBeDefined();
    expect([...all].sort()).toEqual([...specEnum!].sort());
  });
});

describe('EuEntityPermissionsQueryPermissionType', () => {
  function assertExhaustive(p: EuEntityPermissionsQueryPermissionType): void {
    switch (p) {
      case 'VatUeManage':
      case 'InvoiceWrite':
      case 'InvoiceRead':
      case 'Introspection':
      case 'CollectiveIdentifierManage':
        return;
      default: {
        const _never: never = p;
        return _never;
      }
    }
  }

  const all: EuEntityPermissionsQueryPermissionType[] = [
    'VatUeManage',
    'InvoiceWrite',
    'InvoiceRead',
    'Introspection',
    'CollectiveIdentifierManage',
  ];

  it('covers every value of the type', () => {
    for (const p of all) assertExhaustive(p);
    expect(new Set(all).size).toBe(all.length);
  });

  it('matches the EuEntityPermissionsQueryPermissionType enum in the vendored OpenAPI spec', () => {
    const spec = JSON.parse(
      readFileSync(new URL('../../../docs/open-api.json', import.meta.url), 'utf8'),
    ) as { components: { schemas: Record<string, { enum?: string[] }> } };
    const specEnum = spec.components.schemas.EuEntityPermissionsQueryPermissionType?.enum;

    expect(specEnum).toBeDefined();
    expect([...all].sort()).toEqual([...specEnum!].sort());
  });
});
