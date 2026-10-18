import { readFileSync } from 'node:fs';
import type { OwnerPermissionScope } from '../../../src/models/permissions/types.js';

describe('OwnerPermissionScope', () => {
  // Compile-time drift guard: if a new value is added to OwnerPermissionScope
  // without extending this switch, the `_never: never` assignment fails tsc.
  // This keeps the literal array below in sync with the type, so comparing it
  // with the vendored spec also checks the type itself.
  function assertExhaustive(p: OwnerPermissionScope): void {
    switch (p) {
      case 'CredentialsManage':
      case 'CredentialsRead':
      case 'InvoiceWrite':
      case 'InvoiceRead':
      case 'Introspection':
      case 'SubunitManage':
      case 'EnforcementOperations':
      case 'CollectiveIdentifierManage':
        return;
      default: {
        const _never: never = p;
        return _never;
      }
    }
  }

  const all: OwnerPermissionScope[] = [
    'CredentialsManage',
    'CredentialsRead',
    'InvoiceWrite',
    'InvoiceRead',
    'Introspection',
    'SubunitManage',
    'EnforcementOperations',
    'CollectiveIdentifierManage',
  ];

  it('covers every value of the type', () => {
    for (const p of all) assertExhaustive(p);
    expect(new Set(all).size).toBe(all.length);
  });

  it('matches the OwnerPermissionScope enum in the vendored OpenAPI spec', () => {
    const spec = JSON.parse(
      readFileSync(new URL('../../../docs/open-api.json', import.meta.url), 'utf8'),
    ) as { components: { schemas: Record<string, { enum?: string[] }> } };
    const specEnum = spec.components.schemas.OwnerPermissionScope?.enum;

    expect(specEnum).toBeDefined();
    expect([...all].sort()).toEqual([...specEnum!].sort());
  });
});
