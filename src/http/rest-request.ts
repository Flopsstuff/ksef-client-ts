export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export class RestRequest {
  readonly method: HttpMethod;
  readonly path: string;
  private _body?: unknown;
  private _headers: Record<string, string> = {};
  private _query: [string, string][] = [];
  private _presigned = false;
  private _skipAuthRetry = false;

  private constructor(method: HttpMethod, path: string) {
    this.method = method;
    this.path = path;
  }

  static get(path: string): RestRequest {
    return new RestRequest('GET', path);
  }

  static post(path: string): RestRequest {
    return new RestRequest('POST', path);
  }

  static put(path: string): RestRequest {
    return new RestRequest('PUT', path);
  }

  static delete(path: string): RestRequest {
    return new RestRequest('DELETE', path);
  }

  body(data: unknown): this {
    this._body = data;
    return this;
  }

  header(name: string, value: string): this {
    this._headers[name] = value;
    return this;
  }

  headers(headers: Record<string, string>): this {
    Object.assign(this._headers, headers);
    return this;
  }

  accessToken(token: string): this {
    this._headers['Authorization'] = `Bearer ${token}`;
    return this;
  }

  query(key: string, value: string): this {
    this._query.push([key, value]);
    return this;
  }

  presigned(flag = true): this {
    this._presigned = flag;
    return this;
  }

  isPresigned(): boolean {
    return this._presigned;
  }

  skipAuthRetry(flag = true): this {
    this._skipAuthRetry = flag;
    return this;
  }

  isSkipAuthRetry(): boolean {
    return this._skipAuthRetry;
  }

  getBody(): unknown | undefined {
    return this._body;
  }

  getHeaders(): Record<string, string> {
    return { ...this._headers };
  }

  getQuery(): [string, string][] {
    return [...this._query];
  }
}
