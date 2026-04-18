import { KSeFValidationError } from '../errors/ksef-validation-error.js';
import { RestClient } from '../http/rest-client.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import type { OperationResponse } from '../models/common.js';
import type {
  GrantPermissionsPersonRequest,
  GrantPermissionsEntityRequest,
  GrantPermissionsAuthorizationRequest,
  GrantPermissionsIndirectRequest,
  GrantPermissionsSubunitRequest,
  GrantPermissionsEuEntityAdminRequest,
  GrantPermissionsEuEntityRepresentativeRequest,
  PagedPermissionsResponse,
  PagedRolesResponse,
  PagedAuthorizationsResponse,
  PersonalPermission,
  PersonPermission,
  SubunitPermission,
  EntityRole,
  SubordinateEntityRole,
  EntityAuthorizationGrant,
  EuEntityPermission,
  EntityPermissionItem,
  PermissionsOperationStatusResponse,
  PermissionsAttachmentAllowedResponse,
  QueryPersonalGrantsRequest,
  QueryPersonsGrantsRequest,
  QuerySubunitsGrantsRequest,
  QueryEntitiesRolesRequest,
  QueryEntitiesGrantsRequest,
  QuerySubordinateEntitiesRolesRequest,
  QueryAuthorizationsGrantsRequest,
  QueryEuEntitiesGrantsRequest,
  EntityPermissionsContextIdentifier,
} from '../models/permissions/types.js';

export class PermissionsService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  // Grant methods

  async grantPersonPermissions(request: GrantPermissionsPersonRequest): Promise<OperationResponse> {
    const req = RestRequest.post(Routes.Permissions.Grants.persons)
      .body(request);
    const response = await this.restClient.execute<OperationResponse>(req);
    return response.body;
  }

  async grantEntityPermissions(request: GrantPermissionsEntityRequest): Promise<OperationResponse> {
    const req = RestRequest.post(Routes.Permissions.Grants.entities)
      .body(request);
    const response = await this.restClient.execute<OperationResponse>(req);
    return response.body;
  }

  async grantAuthorizationPermissions(request: GrantPermissionsAuthorizationRequest): Promise<OperationResponse> {
    const req = RestRequest.post(Routes.Permissions.Grants.authorizations)
      .body(request);
    const response = await this.restClient.execute<OperationResponse>(req);
    return response.body;
  }

  async grantIndirectPermissions(request: GrantPermissionsIndirectRequest): Promise<OperationResponse> {
    const req = RestRequest.post(Routes.Permissions.Grants.indirect)
      .body(request);
    const response = await this.restClient.execute<OperationResponse>(req);
    return response.body;
  }

  async grantSubunitPermissions(request: GrantPermissionsSubunitRequest): Promise<OperationResponse> {
    const req = RestRequest.post(Routes.Permissions.Grants.subunits)
      .body(request);
    const response = await this.restClient.execute<OperationResponse>(req);
    return response.body;
  }

  async grantEuEntityAdminPermissions(request: GrantPermissionsEuEntityAdminRequest): Promise<OperationResponse> {
    const req = RestRequest.post(Routes.Permissions.Grants.euEntities)
      .body(request);
    const response = await this.restClient.execute<OperationResponse>(req);
    return response.body;
  }

  /** @deprecated Use grantEuEntityAdminPermissions instead */
  async grantEuEntityPermissions(request: GrantPermissionsEuEntityAdminRequest): Promise<OperationResponse> {
    return this.grantEuEntityAdminPermissions(request);
  }

  async grantEuEntityRepresentativePermissions(request: GrantPermissionsEuEntityRepresentativeRequest): Promise<OperationResponse> {
    const req = RestRequest.post(Routes.Permissions.Grants.euEntitiesRepresentatives)
      .body(request);
    const response = await this.restClient.execute<OperationResponse>(req);
    return response.body;
  }

  // Revoke methods

  async revokeCommonGrant(grantId: string): Promise<OperationResponse> {
    const req = RestRequest.delete(Routes.Permissions.Common.grantById(grantId));
    const response = await this.restClient.execute<OperationResponse>(req);
    return response.body;
  }

  async revokeAuthorizationGrant(grantId: string): Promise<OperationResponse> {
    const req = RestRequest.delete(Routes.Permissions.Authorizations.grantById(grantId));
    const response = await this.restClient.execute<OperationResponse>(req);
    return response.body;
  }

  // Search methods

  async queryPersonalGrants(
    options?: QueryPersonalGrantsRequest,
    pageOffset?: number,
    pageSize?: number,
  ): Promise<PagedPermissionsResponse<PersonalPermission>> {
    PermissionsService.validateContextIdentifier(options?.contextIdentifier);
    const req = RestRequest.post(Routes.Permissions.Query.personalGrants)
      .body(options ?? {});
    if (pageOffset !== undefined) req.query('pageOffset', String(pageOffset));
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    const response = await this.restClient.execute<PagedPermissionsResponse<PersonalPermission>>(req);
    return response.body;
  }

  async queryPersonsGrants(
    options: QueryPersonsGrantsRequest,
    pageOffset?: number,
    pageSize?: number,
  ): Promise<PagedPermissionsResponse<PersonPermission>> {
    const req = RestRequest.post(Routes.Permissions.Query.personsGrants)
      .body(options);
    if (pageOffset !== undefined) req.query('pageOffset', String(pageOffset));
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    const response = await this.restClient.execute<PagedPermissionsResponse<PersonPermission>>(req);
    return response.body;
  }

  async querySubunitsGrants(
    options?: QuerySubunitsGrantsRequest,
    pageOffset?: number,
    pageSize?: number,
  ): Promise<PagedPermissionsResponse<SubunitPermission>> {
    const req = RestRequest.post(Routes.Permissions.Query.subunitsGrants)
      .body(options ?? {});
    if (pageOffset !== undefined) req.query('pageOffset', String(pageOffset));
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    const response = await this.restClient.execute<PagedPermissionsResponse<SubunitPermission>>(req);
    return response.body;
  }

  async queryEntitiesRoles(
    options?: QueryEntitiesRolesRequest,
  ): Promise<PagedRolesResponse<EntityRole>> {
    const req = RestRequest.get(Routes.Permissions.Query.entitiesRoles);
    if (options?.pageOffset !== undefined) req.query('pageOffset', String(options.pageOffset));
    if (options?.pageSize !== undefined) req.query('pageSize', String(options.pageSize));
    const response = await this.restClient.execute<PagedRolesResponse<EntityRole>>(req);
    return response.body;
  }

  async queryEntitiesGrants(
    options?: QueryEntitiesGrantsRequest,
    pageOffset?: number,
    pageSize?: number,
  ): Promise<PagedPermissionsResponse<EntityPermissionItem>> {
    PermissionsService.validateContextIdentifier(options?.contextIdentifier);
    const req = RestRequest.post(Routes.Permissions.Query.entitiesGrants)
      .body(options ?? {});
    if (pageOffset !== undefined) req.query('pageOffset', String(pageOffset));
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    const response = await this.restClient.execute<PagedPermissionsResponse<EntityPermissionItem>>(req);
    return response.body;
  }

  async querySubordinateEntitiesRoles(
    options?: QuerySubordinateEntitiesRolesRequest,
    pageOffset?: number,
    pageSize?: number,
  ): Promise<PagedRolesResponse<SubordinateEntityRole>> {
    const req = RestRequest.post(Routes.Permissions.Query.subordinateEntitiesRoles)
      .body(options ?? {});
    if (pageOffset !== undefined) req.query('pageOffset', String(pageOffset));
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    const response = await this.restClient.execute<PagedRolesResponse<SubordinateEntityRole>>(req);
    return response.body;
  }

  async queryAuthorizationsGrants(
    options: QueryAuthorizationsGrantsRequest,
    pageOffset?: number,
    pageSize?: number,
  ): Promise<PagedAuthorizationsResponse<EntityAuthorizationGrant>> {
    const req = RestRequest.post(Routes.Permissions.Query.authorizationsGrants)
      .body(options);
    if (pageOffset !== undefined) req.query('pageOffset', String(pageOffset));
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    const response = await this.restClient.execute<PagedAuthorizationsResponse<EntityAuthorizationGrant>>(req);
    return response.body;
  }

  async queryEuEntitiesGrants(
    options?: QueryEuEntitiesGrantsRequest,
    pageOffset?: number,
    pageSize?: number,
  ): Promise<PagedPermissionsResponse<EuEntityPermission>> {
    const req = RestRequest.post(Routes.Permissions.Query.euEntitiesGrants)
      .body(options ?? {});
    if (pageOffset !== undefined) req.query('pageOffset', String(pageOffset));
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    const response = await this.restClient.execute<PagedPermissionsResponse<EuEntityPermission>>(req);
    return response.body;
  }

  // Operation status methods

  async getOperationStatus(ref: string): Promise<PermissionsOperationStatusResponse> {
    const req = RestRequest.get(Routes.Permissions.Operations.byReference(ref));
    const response = await this.restClient.execute<PermissionsOperationStatusResponse>(req);
    return response.body;
  }

  async getAttachmentStatus(): Promise<PermissionsAttachmentAllowedResponse> {
    const req = RestRequest.get(Routes.Permissions.Attachments.status);
    const response = await this.restClient.execute<PermissionsAttachmentAllowedResponse>(req);
    return response.body;
  }

  private static validateContextIdentifier(
    ctx?: EntityPermissionsContextIdentifier | null,
  ): void {
    if (!ctx) return;
    if (ctx.type === 'InternalId') {
      const len = ctx.value.length;
      if (len < 10 || len > 16) {
        throw KSeFValidationError.fromField(
          'contextIdentifier.value',
          `InternalId must be 10-16 characters, got ${len}`,
        );
      }
    }
  }
}
