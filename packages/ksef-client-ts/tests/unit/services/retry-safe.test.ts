import { AuthService } from '../../../src/services/auth.js';
import { CertificateApiService } from '../../../src/services/certificates.js';
import { CollectiveIdentifiersService } from '../../../src/services/collective-identifiers.js';
import { InvoiceDownloadService } from '../../../src/services/invoice-download.js';
import { PermissionsService } from '../../../src/services/permissions.js';
import { OnlineSessionService } from '../../../src/services/online-session.js';
import { TokenService } from '../../../src/services/tokens.js';
import type { RestClient } from '../../../src/http/rest-client.js';
import { createMockRestClient, getRequest } from './_helpers.js';

type Call = (client: RestClient) => Promise<unknown>;

// POSTs without side effects: retried like a GET after a timeout or a 5xx.
const retrySafe: [string, Call][] = [
  ['auth.getChallenge', (c) => new AuthService(c).getChallenge()],
  ['auth.refreshAccessToken', (c) => new AuthService(c).refreshAccessToken('refresh')],
  ['certificates.retrieve', (c) => new CertificateApiService(c).retrieve({ certificateSerialNumbers: [] })],
  ['certificates.query', (c) => new CertificateApiService(c).query({})],
  ['collectiveIdentifiers.query', (c) => new CollectiveIdentifiersService(c).query({} as any)],
  ['collectiveIdentifiers.queryInvoices', (c) => new CollectiveIdentifiersService(c).queryInvoices({} as any)],
  ['invoices.queryInvoiceMetadata', (c) => new InvoiceDownloadService(c).queryInvoiceMetadata({} as any)],
  ['permissions.queryPersonalGrants', (c) => new PermissionsService(c).queryPersonalGrants({} as any)],
  ['permissions.queryPersonsGrants', (c) => new PermissionsService(c).queryPersonsGrants({} as any)],
  ['permissions.querySubunitsGrants', (c) => new PermissionsService(c).querySubunitsGrants({} as any)],
  ['permissions.queryEntitiesGrants', (c) => new PermissionsService(c).queryEntitiesGrants({} as any)],
  ['permissions.querySubordinateEntitiesRoles', (c) => new PermissionsService(c).querySubordinateEntitiesRoles({} as any)],
  ['permissions.queryAuthorizationsGrants', (c) => new PermissionsService(c).queryAuthorizationsGrants({} as any)],
  ['permissions.queryEuEntitiesGrants', (c) => new PermissionsService(c).queryEuEntitiesGrants({} as any)],
];

// POSTs that create or change something: a repeat could duplicate the effect.
const notRetrySafe: [string, Call][] = [
  ['auth.submitXadesAuthRequest', (c) => new AuthService(c).submitXadesAuthRequest('<xml/>')],
  ['auth.submitKsefTokenAuthRequest', (c) => new AuthService(c).submitKsefTokenAuthRequest({} as any)],
  ['auth.getAccessToken', (c) => new AuthService(c).getAccessToken('auth')],
  ['certificates.enroll', (c) => new CertificateApiService(c).enroll({} as any)],
  ['invoices.exportInvoices', (c) => new InvoiceDownloadService(c).exportInvoices({} as any)],
  ['onlineSession.openSession', (c) => new OnlineSessionService(c).openSession({} as any)],
  ['onlineSession.sendInvoice', (c) => new OnlineSessionService(c).sendInvoice('ref', {} as any)],
  ['permissions.grantPersonPermissions', (c) => new PermissionsService(c).grantPersonPermissions({} as any)],
  ['tokens.generateToken', (c) => new TokenService(c).generateToken({} as any)],
];

describe('retry-safe POST requests', () => {
  it.each(retrySafe)('%s is marked retry-safe', async (_name, call) => {
    const client = createMockRestClient();
    await call(client);
    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('POST');
    expect(req.isRetrySafe()).toBe(true);
  });

  it.each(notRetrySafe)('%s is not marked retry-safe', async (_name, call) => {
    const client = createMockRestClient();
    await call(client);
    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('POST');
    expect(req.isRetrySafe()).toBe(false);
  });
});
