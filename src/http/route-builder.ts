export class RouteBuilder {
  private readonly apiVersion: string;

  constructor(apiVersion: string) {
    this.apiVersion = apiVersion;
  }

  build(endpoint: string, apiVersion?: string): string {
    const version = apiVersion ?? this.apiVersion;
    return `/${version}/${endpoint}`;
  }
}
