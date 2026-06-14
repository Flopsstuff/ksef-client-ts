import { KSeFValidationError } from '../../errors/ksef-validation-error.js';
import type {
  GrantPermissionsAuthorizationRequest,
  EntityAuthorizationPermissionType,
  EntityAuthorizationSubjectIdentifier,
  EntityAuthorizationPermissionsSubjectIdentifierType,
  EntityDetails,
} from '../../models/permissions/types.js';

export class AuthorizationPermissionGrantBuilder {
  private _subjectIdentifier?: EntityAuthorizationSubjectIdentifier;
  private _permission?: EntityAuthorizationPermissionType;
  private _description?: string;
  private _subjectDetails?: EntityDetails;

  withSubjectIdentifier(type: EntityAuthorizationPermissionsSubjectIdentifierType, value: string): this {
    this._subjectIdentifier = { type, value };
    return this;
  }

  withPermission(permission: EntityAuthorizationPermissionType): this {
    this._permission = permission;
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

  build(): GrantPermissionsAuthorizationRequest {
    if (!this._subjectIdentifier) {
      throw KSeFValidationError.fromField('subjectIdentifier', 'Subject identifier is required');
    }
    if (!this._permission) {
      throw KSeFValidationError.fromField('permission', 'Permission is required');
    }
    if (!this._description) {
      throw KSeFValidationError.fromField('description', 'Description is required');
    }
    if (!this._subjectDetails) {
      throw KSeFValidationError.fromField('subjectDetails', 'Subject details are required');
    }

    return {
      subjectIdentifier: this._subjectIdentifier,
      permission: this._permission,
      description: this._description,
      subjectDetails: this._subjectDetails,
    };
  }
}
