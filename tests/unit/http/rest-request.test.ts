import { RestRequest } from '../../../src/http/rest-request.js';

describe('RestRequest', () => {
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
