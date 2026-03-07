import type { PermissionSubjectIdentifierType } from '../../models/common.js';
import type { GrantPermissionsPersonRequest, PersonPermissionType, PersonSubjectIdentifier } from '../../models/permissions/types.js';

export class PersonPermissionGrantBuilder {
  private subjectIdentifier?: PersonSubjectIdentifier;
  private permissions: PersonPermissionType[] = [];

  withSubjectIdentifier(type: PermissionSubjectIdentifierType, value: string): this {
    this.subjectIdentifier = { type, value };
    return this;
  }

  addPermission(permission: PersonPermissionType): this {
    this.permissions.push(permission);
    return this;
  }

  withPermissions(permissions: PersonPermissionType[]): this {
    this.permissions = [...permissions];
    return this;
  }

  build(): GrantPermissionsPersonRequest {
    if (!this.subjectIdentifier) {
      throw new Error('Subject identifier is required');
    }
    if (this.permissions.length === 0) {
      throw new Error('At least one permission is required');
    }

    return {
      subjectIdentifier: this.subjectIdentifier,
      permissions: this.permissions,
    };
  }
}
