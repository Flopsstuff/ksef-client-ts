import type {
  GrantPermissionsEntityRequest,
  EntityPermissionItemType,
  EntityPermission,
  EntityDetails,
} from '../../models/permissions/types.js';

export class EntityPermissionGrantBuilder {
  private nip?: string;
  private permissions: EntityPermission[] = [];
  private _description?: string;
  private _subjectDetails?: EntityDetails;

  withNip(nip: string): this {
    this.nip = nip;
    return this;
  }

  addPermission(type: EntityPermissionItemType, canDelegate = false): this {
    this.permissions.push({ type, canDelegate });
    return this;
  }

  withPermissions(permissions: EntityPermission[]): this {
    this.permissions = [...permissions];
    return this;
  }

  withDescription(description: string): this {
    this._description = description;
    return this;
  }

  withSubjectDetails(subjectDetails: EntityDetails): this {
    this._subjectDetails = subjectDetails;
    return this;
  }

  build(): GrantPermissionsEntityRequest {
    if (!this.nip) {
      throw new Error('NIP is required');
    }
    if (this.permissions.length === 0) {
      throw new Error('At least one permission is required');
    }
    if (!this._description) {
      throw new Error('Description is required');
    }
    if (!this._subjectDetails) {
      throw new Error('Subject details are required');
    }

    return {
      subjectIdentifier: { type: 'Nip', value: this.nip },
      permissions: this.permissions,
      description: this._description,
      subjectDetails: this._subjectDetails,
    };
  }
}
