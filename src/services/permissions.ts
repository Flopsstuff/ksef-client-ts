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
  AuthorizationGrant,
  EuEntityPermission,
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
} from '../models/permissions/types.js';

export class PermissionsService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  // Grant methods

  async grantPersonPermissions(request: GrantPermissionsPersonRequest, accessToken: string): Promise<OperationResponse> {
    const req = RestRequest.post(Routes.Permissions.Grants.persons)
      .accessToken(accessToken)
      .body(request);
    const response = await this.restClient.execute<OperationResponse>(req);
    return response.body;
  }

  async grantEntityPermissions(request: GrantPermissionsEntityRequest, accessToken: string): Promise<OperationResponse> {
    const req = RestRequest.post(Routes.Permissions.Grants.entities)
      .accessToken(accessToken)
      .body(request);
    const response = await this.restClient.execute<OperationResponse>(req);
    return response.body;
  }

  async grantAuthorizationPermissions(request: GrantPermissionsAuthorizationRequest, accessToken: string): Promise<OperationResponse> {
    const req = RestRequest.post(Routes.Permissions.Grants.authorizations)
      .accessToken(accessToken)
      .body(request);
    const response = await this.restClient.execute<OperationResponse>(req);
    return response.body;
  }

  async grantIndirectPermissions(request: GrantPermissionsIndirectRequest, accessToken: string): Promise<OperationResponse> {
    const req = RestRequest.post(Routes.Permissions.Grants.indirect)
      .accessToken(accessToken)
      .body(request);
    const response = await this.restClient.execute<OperationResponse>(req);
    return response.body;
  }

  async grantSubunitPermissions(request: GrantPermissionsSubunitRequest, accessToken: string): Promise<OperationResponse> {
    const req = RestRequest.post(Routes.Permissions.Grants.subunits)
      .accessToken(accessToken)
      .body(request);
    const response = await this.restClient.execute<OperationResponse>(req);
    return response.body;
  }

  async grantEuEntityAdminPermissions(request: GrantPermissionsEuEntityAdminRequest, accessToken: string): Promise<OperationResponse> {
    const req = RestRequest.post(Routes.Permissions.Grants.euEntities)
      .accessToken(accessToken)
      .body(request);
    const response = await this.restClient.execute<OperationResponse>(req);
    return response.body;
  }

  /** @deprecated Use grantEuEntityAdminPermissions instead */
  async grantEuEntityPermissions(request: GrantPermissionsEuEntityAdminRequest, accessToken: string): Promise<OperationResponse> {
    return this.grantEuEntityAdminPermissions(request, accessToken);
  }

  async grantEuEntityRepresentativePermissions(request: GrantPermissionsEuEntityRepresentativeRequest, accessToken: string): Promise<OperationResponse> {
    const req = RestRequest.post(Routes.Permissions.Grants.euEntitiesRepresentatives)
      .accessToken(accessToken)
      .body(request);
    const response = await this.restClient.execute<OperationResponse>(req);
    return response.body;
  }

  // Revoke methods

  async revokeCommonGrant(grantId: string, accessToken: string): Promise<OperationResponse> {
    const req = RestRequest.delete(Routes.Permissions.Common.grantById(grantId))
      .accessToken(accessToken);
    const response = await this.restClient.execute<OperationResponse>(req);
    return response.body;
  }

  async revokeAuthorizationGrant(grantId: string, accessToken: string): Promise<OperationResponse> {
    const req = RestRequest.delete(Routes.Permissions.Authorizations.grantById(grantId))
      .accessToken(accessToken);
    const response = await this.restClient.execute<OperationResponse>(req);
    return response.body;
  }

  // Search methods

  async queryPersonalGrants(
    accessToken: string,
    options?: QueryPersonalGrantsRequest,
    pageOffset?: number,
    pageSize?: number,
  ): Promise<PagedPermissionsResponse<PersonalPermission>> {
    const req = RestRequest.post(Routes.Permissions.Query.personalGrants)
      .accessToken(accessToken)
      .body(options ?? {});
    if (pageOffset !== undefined) req.query('pageOffset', String(pageOffset));
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    const response = await this.restClient.execute<PagedPermissionsResponse<PersonalPermission>>(req);
    return response.body;
  }

  async queryPersonsGrants(
    accessToken: string,
    options: QueryPersonsGrantsRequest,
    pageOffset?: number,
    pageSize?: number,
  ): Promise<PagedPermissionsResponse<PersonPermission>> {
    const req = RestRequest.post(Routes.Permissions.Query.personsGrants)
      .accessToken(accessToken)
      .body(options);
    if (pageOffset !== undefined) req.query('pageOffset', String(pageOffset));
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    const response = await this.restClient.execute<PagedPermissionsResponse<PersonPermission>>(req);
    return response.body;
  }

  async querySubunitsGrants(
    accessToken: string,
    options?: QuerySubunitsGrantsRequest,
    pageOffset?: number,
    pageSize?: number,
  ): Promise<PagedPermissionsResponse<SubunitPermission>> {
    const req = RestRequest.post(Routes.Permissions.Query.subunitsGrants)
      .accessToken(accessToken)
      .body(options ?? {});
    if (pageOffset !== undefined) req.query('pageOffset', String(pageOffset));
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    const response = await this.restClient.execute<PagedPermissionsResponse<SubunitPermission>>(req);
    return response.body;
  }

  async queryEntitiesRoles(
    accessToken: string,
    options?: QueryEntitiesRolesRequest,
  ): Promise<PagedRolesResponse<EntityRole>> {
    const req = RestRequest.get(Routes.Permissions.Query.entitiesRoles)
      .accessToken(accessToken);
    if (options?.pageOffset !== undefined) req.query('pageOffset', String(options.pageOffset));
    if (options?.pageSize !== undefined) req.query('pageSize', String(options.pageSize));
    const response = await this.restClient.execute<PagedRolesResponse<EntityRole>>(req);
    return response.body;
  }

  async queryEntitiesGrants(
    accessToken: string,
    options?: QueryEntitiesGrantsRequest,
    pageOffset?: number,
    pageSize?: number,
  ): Promise<PagedPermissionsResponse<EntityRole>> {
    const req = RestRequest.post(Routes.Permissions.Query.entitiesGrants)
      .accessToken(accessToken)
      .body(options ?? {});
    if (pageOffset !== undefined) req.query('pageOffset', String(pageOffset));
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    const response = await this.restClient.execute<PagedPermissionsResponse<EntityRole>>(req);
    return response.body;
  }

  async querySubordinateEntitiesRoles(
    accessToken: string,
    options?: QuerySubordinateEntitiesRolesRequest,
    pageOffset?: number,
    pageSize?: number,
  ): Promise<PagedRolesResponse<SubordinateEntityRole>> {
    const req = RestRequest.post(Routes.Permissions.Query.subordinateEntitiesRoles)
      .accessToken(accessToken)
      .body(options ?? {});
    if (pageOffset !== undefined) req.query('pageOffset', String(pageOffset));
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    const response = await this.restClient.execute<PagedRolesResponse<SubordinateEntityRole>>(req);
    return response.body;
  }

  async queryAuthorizationsGrants(
    accessToken: string,
    options: QueryAuthorizationsGrantsRequest,
    pageOffset?: number,
    pageSize?: number,
  ): Promise<PagedAuthorizationsResponse<AuthorizationGrant>> {
    const req = RestRequest.post(Routes.Permissions.Query.authorizationsGrants)
      .accessToken(accessToken)
      .body(options);
    if (pageOffset !== undefined) req.query('pageOffset', String(pageOffset));
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    const response = await this.restClient.execute<PagedAuthorizationsResponse<AuthorizationGrant>>(req);
    return response.body;
  }

  async queryEuEntitiesGrants(
    accessToken: string,
    options?: QueryEuEntitiesGrantsRequest,
    pageOffset?: number,
    pageSize?: number,
  ): Promise<PagedPermissionsResponse<EuEntityPermission>> {
    const req = RestRequest.post(Routes.Permissions.Query.euEntitiesGrants)
      .accessToken(accessToken)
      .body(options ?? {});
    if (pageOffset !== undefined) req.query('pageOffset', String(pageOffset));
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    const response = await this.restClient.execute<PagedPermissionsResponse<EuEntityPermission>>(req);
    return response.body;
  }

  // Operation status methods

  async getOperationStatus(ref: string, accessToken: string): Promise<PermissionsOperationStatusResponse> {
    const req = RestRequest.get(Routes.Permissions.Operations.byReference(ref))
      .accessToken(accessToken);
    const response = await this.restClient.execute<PermissionsOperationStatusResponse>(req);
    return response.body;
  }

  async getAttachmentStatus(accessToken: string): Promise<PermissionsAttachmentAllowedResponse> {
    const req = RestRequest.get(Routes.Permissions.Attachments.status)
      .accessToken(accessToken);
    const response = await this.restClient.execute<PermissionsAttachmentAllowedResponse>(req);
    return response.body;
  }
}
