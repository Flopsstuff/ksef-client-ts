export type TransportFn = (url: string, init: RequestInit) => Promise<Response>;

export const defaultTransport: TransportFn = (url, init) => fetch(url, init);
