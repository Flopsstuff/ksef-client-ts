import { KSeFValidationError } from '../../errors/ksef-validation-error.js';
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
      throw KSeFValidationError.fromField('nip', 'NIP is required');
    }
    if (this.permissions.length === 0) {
      throw KSeFValidationError.fromField('permissions', 'At least one permission is required');
    }
    if (!this._description) {
      throw KSeFValidationError.fromField('description', 'Description is required');
    }
    if (!this._subjectDetails) {
      throw KSeFValidationError.fromField('subjectDetails', 'Subject details are required');
    }

    return {
      subjectIdentifier: { type: 'Nip', value: this.nip },
      permissions: this.permissions,
      description: this._description,
      subjectDetails: this._subjectDetails,
    };
  }
}
