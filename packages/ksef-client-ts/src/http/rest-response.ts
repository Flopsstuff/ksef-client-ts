export interface RestResponse<T> {
  body: T;
  headers: Headers;
  statusCode: number;
}
