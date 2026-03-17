export interface AuthManager {
  getAccessToken(): string | undefined;
  onUnauthorized(): Promise<string | null>;
}

export class DefaultAuthManager implements AuthManager {
  private token: string | undefined;
  private readonly refreshFn: () => Promise<string | null>;

  constructor(refreshFn: () => Promise<string | null>, initialToken?: string) {
    this.refreshFn = refreshFn;
    this.token = initialToken;
  }

  getAccessToken(): string | undefined {
    return this.token;
  }

  async onUnauthorized(): Promise<string | null> {
    const newToken = await this.refreshFn();
    this.token = newToken ?? undefined;
    return newToken;
  }
}
