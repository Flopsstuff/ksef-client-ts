import type {
  AuthTokenRequest,
  AuthorizationPolicy,
  SubjectIdentifierType,
} from '../models/auth/types.js';
import type { ContextIdentifier, ContextIdentifierType } from '../models/common.js';

export class AuthTokenRequestBuilder {
  private challenge?: string;
  private contextIdentifier?: ContextIdentifier;
  private subjectIdentifierType?: SubjectIdentifierType;
  private authorizationPolicy?: AuthorizationPolicy;

  withChallenge(challenge: string): this {
    this.challenge = challenge;
    return this;
  }

  withContextNip(nip: string): this {
    return this.withContext('Nip', nip);
  }

  withContextInternalId(id: string): this {
    return this.withContext('InternalId', id);
  }

  withContextNipVatUe(value: string): this {
    return this.withContext('NipVatUe', value);
  }

  withContextPeppolId(id: string): this {
    return this.withContext('PeppolId', id);
  }

  withSubjectType(type: SubjectIdentifierType): this {
    this.subjectIdentifierType = type;
    return this;
  }

  withAuthorizationPolicy(policy: AuthorizationPolicy): this {
    this.authorizationPolicy = policy;
    return this;
  }

  build(): AuthTokenRequest {
    if (!this.challenge) {
      throw new Error('Challenge is required');
    }
    if (!this.contextIdentifier) {
      throw new Error('Context identifier is required');
    }
    if (!this.subjectIdentifierType) {
      throw new Error('Subject identifier type is required');
    }

    return {
      challenge: this.challenge,
      contextIdentifier: this.contextIdentifier,
      subjectIdentifierType: this.subjectIdentifierType,
      ...(this.authorizationPolicy && { authorizationPolicy: this.authorizationPolicy }),
    };
  }

  private withContext(type: ContextIdentifierType, value: string): this {
    this.contextIdentifier = { type, value };
    return this;
  }
}
