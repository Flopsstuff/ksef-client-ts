export interface AuthManager {
  getAccessToken(): string | undefined;
  setAccessToken(token: string | undefined): void;
  getRefreshToken(): string | undefined;
  setRefreshToken(token: string | undefined): void;
  onUnauthorized(): Promise<string | null>;
}

export class DefaultAuthManager implements AuthManager {
  private token: string | undefined;
  private refreshToken: string | undefined;
  private readonly refreshFn: () => Promise<string | null>;
  private refreshPromise: Promise<string | null> | null = null;

  constructor(refreshFn: () => Promise<string | null>, initialToken?: string) {
    this.refreshFn = refreshFn;
    this.token = initialToken;
  }

  getAccessToken(): string | undefined {
    return this.token;
  }

  setAccessToken(token: string | undefined): void {
    this.token = token;
  }

  getRefreshToken(): string | undefined {
    return this.refreshToken;
  }

  setRefreshToken(token: string | undefined): void {
    this.refreshToken = token;
  }

  async onUnauthorized(): Promise<string | null> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.refreshFn()
      .then(newToken => {
        this.token = newToken ?? undefined;
        return newToken;
      })
      .finally(() => {
        this.refreshPromise = null;
      });
    return this.refreshPromise;
  }
}
