import type { GrantPermissionsEntityRequest, EntityStandardPermissionType, PermissionWithDelegate } from '../../models/permissions/types.js';

export class EntityPermissionGrantBuilder {
  private nip?: string;
  private permissions: PermissionWithDelegate<EntityStandardPermissionType>[] = [];

  withNip(nip: string): this {
    this.nip = nip;
    return this;
  }

  addPermission(permission: EntityStandardPermissionType, canDelegate = false): this {
    this.permissions.push({ permission, canDelegate });
    return this;
  }

  withPermissions(permissions: PermissionWithDelegate<EntityStandardPermissionType>[]): this {
    this.permissions = [...permissions];
    return this;
  }

  build(): GrantPermissionsEntityRequest {
    if (!this.nip) {
      throw new Error('NIP is required');
    }
    if (this.permissions.length === 0) {
      throw new Error('At least one permission is required');
    }

    return {
      subjectIdentifier: { nip: this.nip },
      permissions: this.permissions,
    };
  }
}
