import { describe, it, expect } from 'vitest';
import { PersonPermissionGrantBuilder } from '../../../src/builders/permissions/person-permission.js';
import { EntityPermissionGrantBuilder } from '../../../src/builders/permissions/entity-permission.js';
import { AuthorizationPermissionGrantBuilder } from '../../../src/builders/permissions/authorization-permission.js';
import { KSeFValidationError } from '../../../src/errors/index.js';

describe('PersonPermissionGrantBuilder', () => {
  const validBuilder = () =>
    new PersonPermissionGrantBuilder()
      .withSubjectIdentifier('Pesel', '12345678901')
      .addPermission('Read')
      .withDescription('Test permission')
      .withSubjectDetails({ firstName: 'Jan', lastName: 'Kowalski' });

  it('should build a valid request', () => {
    const req = validBuilder().build();
    expect(req).toEqual({
      subjectIdentifier: { type: 'Pesel', value: '12345678901' },
      permissions: ['Read'],
      description: 'Test permission',
      subjectDetails: { firstName: 'Jan', lastName: 'Kowalski' },
    });
  });

  it('should support multiple permissions', () => {
    const req = validBuilder().addPermission('Write').build();
    expect(req.permissions).toEqual(['Read', 'Write']);
  });

  it('should support withPermissions replacing all', () => {
    const req = validBuilder().withPermissions(['Write', 'ReadAndArchive']).build();
    expect(req.permissions).toEqual(['Write', 'ReadAndArchive']);
  });

  it('should throw when subject identifier missing', () => {
    const builder = new PersonPermissionGrantBuilder()
      .addPermission('Read')
      .withDescription('d')
      .withSubjectDetails({ firstName: 'J', lastName: 'K' });
    expect(() => builder.build()).toThrow(KSeFValidationError);
    try { builder.build(); } catch (e) {
      expect((e as KSeFValidationError).details[0].field).toBe('subjectIdentifier');
    }
  });

  it('should throw when permissions empty', () => {
    const builder = new PersonPermissionGrantBuilder()
      .withSubjectIdentifier('Pesel', '123')
      .withDescription('d')
      .withSubjectDetails({ firstName: 'J', lastName: 'K' });
    expect(() => builder.build()).toThrow(KSeFValidationError);
    expect(() => builder.build()).toThrow('At least one permission is required');
  });

  it('should throw when description missing', () => {
    const builder = new PersonPermissionGrantBuilder()
      .withSubjectIdentifier('Pesel', '123')
      .addPermission('Read')
      .withSubjectDetails({ firstName: 'J', lastName: 'K' });
    expect(() => builder.build()).toThrow(KSeFValidationError);
  });

  it('should throw when subject details missing', () => {
    const builder = new PersonPermissionGrantBuilder()
      .withSubjectIdentifier('Pesel', '123')
      .addPermission('Read')
      .withDescription('d');
    expect(() => builder.build()).toThrow(KSeFValidationError);
  });
});

describe('EntityPermissionGrantBuilder', () => {
  const validBuilder = () =>
    new EntityPermissionGrantBuilder()
      .withNip('1234567890')
      .addPermission('Read')
      .withDescription('Entity permission')
      .withSubjectDetails({ tradeName: 'Firma Sp. z o.o.' });

  it('should build a valid request', () => {
    const req = validBuilder().build();
    expect(req.subjectIdentifier).toEqual({ type: 'Nip', value: '1234567890' });
    expect(req.permissions).toEqual([{ type: 'Read', canDelegate: false }]);
    expect(req.description).toBe('Entity permission');
  });

  it('should support canDelegate flag', () => {
    const req = new EntityPermissionGrantBuilder()
      .withNip('123')
      .addPermission('Write', true)
      .withDescription('d')
      .withSubjectDetails({ tradeName: 'T' })
      .build();
    expect(req.permissions[0]).toEqual({ type: 'Write', canDelegate: true });
  });

  it('should support withPermissions replacing all', () => {
    const req = validBuilder()
      .withPermissions([{ type: 'Write', canDelegate: true }])
      .build();
    expect(req.permissions).toEqual([{ type: 'Write', canDelegate: true }]);
  });

  it('should throw when NIP missing', () => {
    const builder = new EntityPermissionGrantBuilder()
      .addPermission('Read')
      .withDescription('d')
      .withSubjectDetails({ tradeName: 'T' });
    expect(() => builder.build()).toThrow(KSeFValidationError);
    expect(() => builder.build()).toThrow('NIP is required');
  });

  it('should throw when permissions empty', () => {
    const builder = new EntityPermissionGrantBuilder()
      .withNip('123')
      .withDescription('d')
      .withSubjectDetails({ tradeName: 'T' });
    expect(() => builder.build()).toThrow(KSeFValidationError);
  });

  it('should throw when description missing', () => {
    const builder = new EntityPermissionGrantBuilder()
      .withNip('123')
      .addPermission('Read')
      .withSubjectDetails({ tradeName: 'T' });
    expect(() => builder.build()).toThrow(KSeFValidationError);
  });

  it('should throw when subject details missing', () => {
    const builder = new EntityPermissionGrantBuilder()
      .withNip('123')
      .addPermission('Read')
      .withDescription('d');
    expect(() => builder.build()).toThrow(KSeFValidationError);
  });
});

describe('AuthorizationPermissionGrantBuilder', () => {
  const validBuilder = () =>
    new AuthorizationPermissionGrantBuilder()
      .withSubjectIdentifier('Nip', '1234567890')
      .withPermission('ReadAndArchive')
      .withDescription('Auth permission')
      .withSubjectDetails({ tradeName: 'Firma' });

  it('should build a valid request', () => {
    const req = validBuilder().build();
    expect(req).toEqual({
      subjectIdentifier: { type: 'Nip', value: '1234567890' },
      permission: 'ReadAndArchive',
      description: 'Auth permission',
      subjectDetails: { tradeName: 'Firma' },
    });
  });

  it('should throw when subject identifier missing', () => {
    const builder = new AuthorizationPermissionGrantBuilder()
      .withPermission('Read')
      .withDescription('d')
      .withSubjectDetails({ tradeName: 'T' });
    expect(() => builder.build()).toThrow(KSeFValidationError);
  });

  it('should throw when permission missing', () => {
    const builder = new AuthorizationPermissionGrantBuilder()
      .withSubjectIdentifier('Nip', '123')
      .withDescription('d')
      .withSubjectDetails({ tradeName: 'T' });
    expect(() => builder.build()).toThrow(KSeFValidationError);
    expect(() => builder.build()).toThrow('Permission is required');
  });

  it('should throw when description missing', () => {
    const builder = new AuthorizationPermissionGrantBuilder()
      .withSubjectIdentifier('Nip', '123')
      .withPermission('Read')
      .withSubjectDetails({ tradeName: 'T' });
    expect(() => builder.build()).toThrow(KSeFValidationError);
  });

  it('should throw when subject details missing', () => {
    const builder = new AuthorizationPermissionGrantBuilder()
      .withSubjectIdentifier('Nip', '123')
      .withPermission('Read')
      .withDescription('d');
    expect(() => builder.build()).toThrow(KSeFValidationError);
  });
});
