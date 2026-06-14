import { KSeFValidationError } from '../../errors/ksef-validation-error.js';
import type { PermissionSubjectIdentifierType } from '../../models/common.js';
import type {
  GrantPermissionsPersonRequest,
  PersonPermissionType,
  PersonSubjectIdentifier,
  PersonPermissionSubjectDetails,
} from '../../models/permissions/types.js';

export class PersonPermissionGrantBuilder {
  private subjectIdentifier?: PersonSubjectIdentifier;
  private permissions: PersonPermissionType[] = [];
  private _description?: string;
  private _subjectDetails?: PersonPermissionSubjectDetails;

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

  withDescription(description: string): this {
    this._description = description;
    return this;
  }

  withSubjectDetails(subjectDetails: PersonPermissionSubjectDetails): this {
    this._subjectDetails = subjectDetails;
    return this;
  }

  build(): GrantPermissionsPersonRequest {
    if (!this.subjectIdentifier) {
      throw KSeFValidationError.fromField('subjectIdentifier', 'Subject identifier is required');
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
      subjectIdentifier: this.subjectIdentifier,
      permissions: this.permissions,
      description: this._description,
      subjectDetails: this._subjectDetails,
    };
  }
}
