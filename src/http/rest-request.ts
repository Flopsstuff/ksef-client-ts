export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export class RestRequest {
  readonly method: HttpMethod;
  readonly path: string;
  private _body?: unknown;
  private _headers: Record<string, string> = {};
  private _query: Record<string, string> = {};

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

  query(key: string, value: string): this {
    this._query[key] = value;
    return this;
  }

  getBody(): unknown | undefined {
    return this._body;
  }

  getHeaders(): Record<string, string> {
    return { ...this._headers };
  }

  getQuery(): Record<string, string> {
    return { ...this._query };
  }
}
