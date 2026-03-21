import { RestRequest } from '../../../src/http/rest-request.js';

describe('RestRequest', () => {
  describe('static factory methods', () => {
    it('put() creates a PUT request', () => {
      const req = RestRequest.put('/invoices/123');
      expect(req.method).toBe('PUT');
      expect(req.path).toBe('/invoices/123');
    });

    it('delete() creates a DELETE request', () => {
      const req = RestRequest.delete('/tokens/abc');
      expect(req.method).toBe('DELETE');
      expect(req.path).toBe('/tokens/abc');
    });
  });

  describe('headers()', () => {
    it('merges multiple headers at once', () => {
      const req = RestRequest.get('/test').headers({
        'X-Custom': 'value1',
        'Accept': 'application/xml',
      });
      expect(req.getHeaders()).toEqual({
        'X-Custom': 'value1',
        'Accept': 'application/xml',
      });
    });

    it('overwrites existing headers with same key', () => {
      const req = RestRequest.get('/test')
        .header('Accept', 'text/plain')
        .headers({ 'Accept': 'application/json' });
      expect(req.getHeaders()['Accept']).toBe('application/json');
    });
  });

  describe('presigned flag', () => {
    it('defaults to false', () => {
      const req = RestRequest.get('/test');
      expect(req.isPresigned()).toBe(false);
    });

    it('is set to true via presigned()', () => {
      const req = RestRequest.get('/download').presigned();
      expect(req.isPresigned()).toBe(true);
    });

    it('can be explicitly set to false', () => {
      const req = RestRequest.get('/download').presigned(true).presigned(false);
      expect(req.isPresigned()).toBe(false);
    });

    it('is chainable with other builder methods', () => {
      const req = RestRequest.post('/download')
        .header('Accept', 'application/octet-stream')
        .presigned()
        .query('token', 'abc');

      expect(req.isPresigned()).toBe(true);
      expect(req.method).toBe('POST');
      expect(req.getHeaders()).toEqual({ Accept: 'application/octet-stream' });
      expect(req.getQuery()).toEqual([['token', 'abc']]);
    });
  });
});
