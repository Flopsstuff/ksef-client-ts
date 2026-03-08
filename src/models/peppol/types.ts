export interface PeppolProvider {
  identifier: string;
  name: string;
  description?: string;
  dateCreated?: string;
}

export interface QueryPeppolProvidersResponse {
  providers: PeppolProvider[];
  hasMore: boolean;
}
