import type {
  AuthKsefTokenRequest,
  AuthorizationPolicy,
} from '../models/auth/types.js';
import type { ContextIdentifier, ContextIdentifierType } from '../models/common.js';

export class AuthKsefTokenRequestBuilder {
  private challenge?: string;
  private contextIdentifier?: ContextIdentifier;
  private encryptedToken?: string;
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

  withEncryptedToken(token: string): this {
    this.encryptedToken = token;
    return this;
  }

  withAuthorizationPolicy(policy: AuthorizationPolicy): this {
    this.authorizationPolicy = policy;
    return this;
  }

  build(): AuthKsefTokenRequest {
    if (!this.challenge) {
      throw new Error('Challenge is required');
    }
    if (!this.contextIdentifier) {
      throw new Error('Context identifier is required');
    }
    if (!this.encryptedToken) {
      throw new Error('Encrypted token is required');
    }

    return {
      challenge: this.challenge,
      contextIdentifier: this.contextIdentifier,
      encryptedToken: this.encryptedToken,
      ...(this.authorizationPolicy && { authorizationPolicy: this.authorizationPolicy }),
    };
  }

  private withContext(type: ContextIdentifierType, value: string): this {
    this.contextIdentifier = { type, value };
    return this;
  }
}
