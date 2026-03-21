export interface PeppolProvider {
  id: string;
  name: string;
  dateCreated: string;
}

export interface QueryPeppolProvidersResponse {
  peppolProviders: PeppolProvider[];
  hasMore: boolean;
}
