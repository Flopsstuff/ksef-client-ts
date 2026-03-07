import type { GrantPermissionsAuthorizationRequest, AuthorizationPermissionType } from '../../models/permissions/types.js';

export class AuthorizationPermissionGrantBuilder {
  private permission?: AuthorizationPermissionType;

  withPermission(permission: AuthorizationPermissionType): this {
    this.permission = permission;
    return this;
  }

  build(): GrantPermissionsAuthorizationRequest {
    if (!this.permission) {
      throw new Error('Permission is required');
    }

    return {
      permission: this.permission,
    };
  }
}
