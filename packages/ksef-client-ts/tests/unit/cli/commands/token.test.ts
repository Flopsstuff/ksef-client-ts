import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tokenCommand } from '../../../../src/cli/commands/token.js';
import * as clientFactory from '../../../../src/cli/client-factory.js';
import * as output from '../../../../src/cli/output.js';
import { renderCliError } from '../../../../src/cli/error-renderer.js';
import { KSeFBadRequestError } from '../../../../src/errors/index.js';
import { createMockClient, validSession } from './_helpers.js';

vi.mock('consola', () => ({ consola: { level: 0, info: vi.fn(), error: vi.fn() } }));
vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandler: vi.fn((fn) => fn()),
}));
vi.mock('../../../../src/cli/client-factory.js', () => ({
  requireSession: vi.fn(),
}));
vi.mock('../../../../src/cli/output.js', () => ({
  outputResult: vi.fn(),
  outputKeyValue: vi.fn(),
  outputTable: vi.fn(),
  outputSuccess: vi.fn(),
  outputWarning: vi.fn(),
}));

const mockRequireSession = vi.mocked(clientFactory.requireSession);
let mockClient: ReturnType<typeof createMockClient>;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockClient();
  mockRequireSession.mockResolvedValue({ client: mockClient as any, session: { ...validSession } });
});

describe('token', () => {
  it('generate — throws without permissions', async () => {
    await expect(
      (tokenCommand.subCommands!.generate as any).run!({ args: {} }),
    ).rejects.toThrow('--permissions is required');
  });

  it('generate — splits permissions and calls generateToken', async () => {
    mockClient.tokens.generateToken.mockResolvedValue({ referenceNumber: 'ref-1', token: 'tok-1' });
    await (tokenCommand.subCommands!.generate as any).run!({
      args: { permissions: 'InvoiceRead,InvoiceWrite', description: 'Test token' },
    });
    expect(mockClient.tokens.generateToken).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: ['InvoiceRead', 'InvoiceWrite'] }),
    );
  });

  it('generate — outputs JSON when --json flag is set', async () => {
    const result = { referenceNumber: 'ref-1', token: 'tok-1' };
    mockClient.tokens.generateToken.mockResolvedValue(result);
    await (tokenCommand.subCommands!.generate as any).run!({
      args: { permissions: 'InvoiceRead', description: 'Test token', json: true },
    });
    expect(vi.mocked(output.outputResult)).toHaveBeenCalledWith(result, { json: true });
  });

  it('revoke — calls revokeToken', async () => {
    await (tokenCommand.subCommands!.revoke as any).run!({ args: { ref: 'tok-ref-1' } });
    expect(mockClient.tokens.revokeToken).toHaveBeenCalledWith('tok-ref-1');
  });

  it('revoke — outputs JSON when --json flag is set', async () => {
    await (tokenCommand.subCommands!.revoke as any).run!({ args: { ref: 'tok-ref-1', json: true } });
    expect(mockClient.tokens.revokeToken).toHaveBeenCalledWith('tok-ref-1');
    expect(vi.mocked(output.outputResult)).toHaveBeenCalledWith(
      { status: 'revoked', referenceNumber: 'tok-ref-1' },
      { json: true },
    );
  });

  describe('list', () => {
    it('outputs JSON when --json flag is set', async () => {
      const result = { tokens: [{ referenceNumber: 'ref-1' }], continuationToken: undefined };
      mockClient.tokens.queryTokens.mockResolvedValue(result);
      await (tokenCommand.subCommands!.list as any).run!({ args: { json: true } });
      expect(vi.mocked(output.outputResult)).toHaveBeenCalledWith(result, { json: true });
    });

    it('shows warning when no tokens found', async () => {
      mockClient.tokens.queryTokens.mockResolvedValue({ tokens: [], continuationToken: undefined });
      await (tokenCommand.subCommands!.list as any).run!({ args: {} });
      expect(vi.mocked(output.outputWarning)).toHaveBeenCalledWith('No tokens found.');
    });

    it('shows continuation token info when available', async () => {
      const { consola } = await import('consola');
      mockClient.tokens.queryTokens.mockResolvedValue({
        tokens: [
          {
            referenceNumber: 'ref-1',
            description: 'Test',
            status: 'Active',
            requestedPermissions: ['InvoiceRead'],
            dateCreated: '2024-01-01',
          },
        ],
        continuationToken: 'next-page-token',
      });
      await (tokenCommand.subCommands!.list as any).run!({ args: {} });
      expect(vi.mocked(output.outputTable)).toHaveBeenCalled();
      expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('next-page-token'));
    });
  });

  describe('get', () => {
    const tokenDetail = {
      referenceNumber: 'tok-ref-1',
      description: 'My Token',
      status: 'Active',
      requestedPermissions: ['InvoiceRead', 'InvoiceWrite'],
      authorIdentifier: { type: 'Nip', value: '1234567890' },
      contextIdentifier: { type: 'Nip', value: '9876543210' },
      dateCreated: '2024-01-01',
      lastUseDate: '2024-06-01',
    };

    it('displays token details as key-value', async () => {
      mockClient.tokens.getToken.mockResolvedValue(tokenDetail);
      await (tokenCommand.subCommands!.get as any).run!({ args: { ref: 'tok-ref-1' } });
      expect(mockClient.tokens.getToken).toHaveBeenCalledWith('tok-ref-1');
      expect(vi.mocked(output.outputKeyValue)).toHaveBeenCalledWith(
        expect.objectContaining({
          'Reference': 'tok-ref-1',
          'Description': 'My Token',
          'Status': 'Active',
          'Last Used': '2024-06-01',
        }),
        { json: false },
      );
    });

    it('displays "Never" for lastUseDate when null', async () => {
      mockClient.tokens.getToken.mockResolvedValue({ ...tokenDetail, lastUseDate: null });
      await (tokenCommand.subCommands!.get as any).run!({ args: { ref: 'tok-ref-1' } });
      expect(vi.mocked(output.outputKeyValue)).toHaveBeenCalledWith(
        expect.objectContaining({ 'Last Used': 'Never' }),
        { json: false },
      );
    });

    it('outputs JSON when --json flag is set', async () => {
      mockClient.tokens.getToken.mockResolvedValue(tokenDetail);
      await (tokenCommand.subCommands!.get as any).run!({ args: { ref: 'tok-ref-1', json: true } });
      expect(vi.mocked(output.outputResult)).toHaveBeenCalledWith(tokenDetail, { json: true });
    });
  });

  describe('rev2', () => {
    const rev2Token = {
      referenceNumber: 'tok-ref-2',
      description: 'Rev2 token',
      status: { code: 'AwaitingApproval', rawCode: 'AwaitingApproval', displayName: 'Awaiting approval' },
      requestedPermissions: [
        { code: 'InvoiceRead', rawCode: 'InvoiceRead', displayName: 'Invoice read' },
        { code: 'FutureValue', rawCode: 'NewPermission', displayName: 'New permission' },
      ],
      authorIdentifier: { type: { code: 'Nip', rawCode: 'Nip', displayName: 'NIP' }, value: '1234567890' },
      contextIdentifier: { type: { code: 'FutureValue', rawCode: 'NewContext', displayName: 'New' }, value: '9876543210' },
      dateCreated: '2026-11-21T10:00:00Z',
      lastUseDate: null,
      validFrom: '2026-11-21T10:00:00Z',
      validTo: '2027-02-19T10:00:00Z',
      failure: null,
    };

    describe('generate', () => {
      it('uses the old operation without rev2 flags', async () => {
        mockClient.tokens.generateToken.mockResolvedValue({ referenceNumber: 'ref-1', token: 'tok-1' });
        await (tokenCommand.subCommands!.generate as any).run!({
          args: { permissions: 'InvoiceRead', description: 'Old token' },
        });
        expect(mockClient.tokens.generateToken).toHaveBeenCalled();
        expect(mockClient.tokens.generateTokenRev2).not.toHaveBeenCalled();
      });

      it('--rev2 alone sends no dates, leaving the server defaults', async () => {
        mockClient.tokens.generateTokenRev2.mockResolvedValue({ referenceNumber: 'ref-2', token: 'tok-2' });
        await (tokenCommand.subCommands!.generate as any).run!({
          args: { permissions: 'InvoiceRead, InvoiceWrite', description: 'Rev2 token', rev2: true },
        });
        expect(mockClient.tokens.generateTokenRev2).toHaveBeenCalledWith({
          description: 'Rev2 token',
          permissions: ['InvoiceRead', 'InvoiceWrite'],
        });
        expect(mockClient.tokens.generateToken).not.toHaveBeenCalled();
      });

      it.each([
        { flag: 'validFrom', value: '2026-12-01', expected: { validFrom: '2026-12-01T00:00:00+00:00' } },
        { flag: 'validTo', value: '2027-01-31', expected: { validTo: '2027-01-31T23:59:59.999+00:00' } },
      ])('--$flag implies --rev2', async ({ flag, value, expected }) => {
        mockClient.tokens.generateTokenRev2.mockResolvedValue({ referenceNumber: 'ref-2', token: 'tok-2' });
        await (tokenCommand.subCommands!.generate as any).run!({
          args: { permissions: 'InvoiceRead', description: 'Rev2 token', [flag]: value },
        });
        expect(mockClient.tokens.generateTokenRev2).toHaveBeenCalledWith({
          description: 'Rev2 token',
          permissions: ['InvoiceRead'],
          ...expected,
        });
        expect(mockClient.tokens.generateToken).not.toHaveBeenCalled();
      });

      it('passes full ISO 8601 datetimes through unchanged', async () => {
        mockClient.tokens.generateTokenRev2.mockResolvedValue({ referenceNumber: 'ref-2', token: 'tok-2' });
        await (tokenCommand.subCommands!.generate as any).run!({
          args: {
            permissions: 'InvoiceRead', description: 'Rev2 token',
            validFrom: '2026-12-01T08:00:00+01:00', validTo: '2027-01-31T18:00:00+01:00',
          },
        });
        expect(mockClient.tokens.generateTokenRev2).toHaveBeenCalledWith(expect.objectContaining({
          validFrom: '2026-12-01T08:00:00+01:00',
          validTo: '2027-01-31T18:00:00+01:00',
        }));
      });

      it('rejects an invalid date before calling the API', async () => {
        await expect((tokenCommand.subCommands!.generate as any).run!({
          args: { permissions: 'InvoiceRead', description: 'Rev2 token', validTo: '2027-13-45' },
        })).rejects.toThrow('Invalid date');
        expect(mockClient.tokens.generateTokenRev2).not.toHaveBeenCalled();
      });

      it('prints the approval hint in text mode', async () => {
        const { consola } = await import('consola');
        mockClient.tokens.generateTokenRev2.mockResolvedValue({ referenceNumber: 'ref-2', token: 'tok-2' });
        await (tokenCommand.subCommands!.generate as any).run!({
          args: { permissions: 'InvoiceRead', description: 'Rev2 token', rev2: true },
        });
        expect(vi.mocked(output.outputKeyValue)).toHaveBeenCalledWith(
          { 'Reference': 'ref-2', 'Token': 'tok-2' },
          { json: false },
        );
        expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('`ksef token approve ref-2`'));
        expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('24 hours'));
      });

      it('prints the raw response and no hint with --json', async () => {
        const { consola } = await import('consola');
        const result = { referenceNumber: 'ref-2', token: 'tok-2' };
        mockClient.tokens.generateTokenRev2.mockResolvedValue(result);
        await (tokenCommand.subCommands!.generate as any).run!({
          args: { permissions: 'InvoiceRead', description: 'Rev2 token', rev2: true, json: true },
        });
        expect(vi.mocked(output.outputResult)).toHaveBeenCalledWith(result, { json: true });
        expect(consola.info).not.toHaveBeenCalled();
      });
    });

    describe('list', () => {
      it('passes filters to queryTokensRev2 and normalises the dates', async () => {
        mockClient.tokens.queryTokensRev2.mockResolvedValue({ tokens: [], continuationToken: null });
        await (tokenCommand.subCommands!.list as any).run!({
          args: {
            rev2: true, status: 'AwaitingApproval, Expired', description: 'ci', author: '1234567890',
            authorType: 'Nip', continue: 'cont-1', pageSize: '20', validFrom: '2026-11-01', validTo: '2026-12-31',
          },
        });
        expect(mockClient.tokens.queryTokensRev2).toHaveBeenCalledWith({
          continuationToken: 'cont-1',
          pageSize: 20,
          status: ['AwaitingApproval', 'Expired'],
          description: 'ci',
          authorIdentifier: '1234567890',
          authorIdentifierType: 'Nip',
          validFrom: '2026-11-01T00:00:00+00:00',
          validTo: '2026-12-31T23:59:59.999+00:00',
        });
        expect(mockClient.tokens.queryTokens).not.toHaveBeenCalled();
        expect(vi.mocked(output.outputWarning)).toHaveBeenCalledWith('No tokens found.');
      });

      it('sends no filters when none are given', async () => {
        mockClient.tokens.queryTokensRev2.mockResolvedValue({ tokens: [], continuationToken: null });
        await (tokenCommand.subCommands!.list as any).run!({ args: { rev2: true } });
        expect(mockClient.tokens.queryTokensRev2).toHaveBeenCalledWith({
          continuationToken: undefined,
          pageSize: undefined,
          status: undefined,
          description: undefined,
          authorIdentifier: undefined,
          authorIdentifierType: undefined,
          validFrom: undefined,
          validTo: undefined,
        });
      });

      it('shows validity, status code (rawCode for FutureValue) and the failure reason', async () => {
        const { consola } = await import('consola');
        mockClient.tokens.queryTokensRev2.mockResolvedValue({
          tokens: [
            rev2Token,
            {
              ...rev2Token,
              referenceNumber: 'tok-ref-3',
              status: { code: 'FutureValue', rawCode: 'Suspended', displayName: 'Suspended' },
              requestedPermissions: [{ code: 'InvoiceWrite', rawCode: 'InvoiceWrite', displayName: 'Write' }],
              failure: { code: 'token.context-limit-exceeded', description: 'Token limit reached' },
            },
          ],
          continuationToken: 'next-page',
        });
        await (tokenCommand.subCommands!.list as any).run!({ args: { rev2: true } });
        const [rows, columns] = vi.mocked(output.outputTable).mock.calls[0];
        expect(rows).toEqual([
          {
            reference: 'tok-ref-2', description: 'Rev2 token', status: 'AwaitingApproval',
            permissions: 'InvoiceRead, NewPermission',
            validFrom: '2026-11-21T10:00:00Z', validTo: '2027-02-19T10:00:00Z', failure: '',
          },
          {
            reference: 'tok-ref-3', description: 'Rev2 token', status: 'Suspended',
            permissions: 'InvoiceWrite',
            validFrom: '2026-11-21T10:00:00Z', validTo: '2027-02-19T10:00:00Z', failure: 'Token limit reached',
          },
        ]);
        expect(columns.map((c: { label: string }) => c.label)).toEqual(
          ['Reference', 'Description', 'Status', 'Permissions', 'Valid From', 'Valid To', 'Failure'],
        );
        expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('next-page'));
      });

      it('prints the raw response with --json', async () => {
        const result = { tokens: [rev2Token], continuationToken: null };
        mockClient.tokens.queryTokensRev2.mockResolvedValue(result);
        await (tokenCommand.subCommands!.list as any).run!({ args: { rev2: true, json: true } });
        expect(vi.mocked(output.outputResult)).toHaveBeenCalledWith(result, { json: true });
        expect(vi.mocked(output.outputTable)).not.toHaveBeenCalled();
      });

      it.each(['validFrom', 'validTo'])('rejects --%s without --rev2', async (flag) => {
        await expect((tokenCommand.subCommands!.list as any).run!({
          args: { [flag]: '2026-11-01' },
        })).rejects.toThrow('Add --rev2');
        expect(mockClient.tokens.queryTokens).not.toHaveBeenCalled();
        expect(mockClient.tokens.queryTokensRev2).not.toHaveBeenCalled();
      });
    });

    describe('get', () => {
      it('shows the rev2 fields', async () => {
        mockClient.tokens.getTokenRev2.mockResolvedValue(rev2Token);
        await (tokenCommand.subCommands!.get as any).run!({ args: { ref: 'tok-ref-2', rev2: true } });
        expect(mockClient.tokens.getTokenRev2).toHaveBeenCalledWith('tok-ref-2');
        expect(mockClient.tokens.getToken).not.toHaveBeenCalled();
        const rows = vi.mocked(output.outputKeyValue).mock.calls[0][0];
        expect(rows).toEqual({
          'Reference': 'tok-ref-2',
          'Description': 'Rev2 token',
          'Status': 'AwaitingApproval',
          'Permissions': 'InvoiceRead, NewPermission',
          'Author': 'Nip: 1234567890',
          'Context': 'NewContext: 9876543210',
          'Created': '2026-11-21T10:00:00Z',
          'Valid From': '2026-11-21T10:00:00Z',
          'Valid To': '2027-02-19T10:00:00Z',
          'Last Used': 'Never',
        });
      });

      it('shows the failure with its details', async () => {
        mockClient.tokens.getTokenRev2.mockResolvedValue({
          ...rev2Token,
          status: { code: 'Failed', rawCode: 'Failed', displayName: 'Failed' },
          lastUseDate: '2026-11-22T10:00:00Z',
          failure: { code: 'token.permission-grant-failed', description: 'Grant failed', details: ['InvoiceWrite', 'not held'] },
        });
        await (tokenCommand.subCommands!.get as any).run!({ args: { ref: 'tok-ref-2', rev2: true } });
        expect(vi.mocked(output.outputKeyValue)).toHaveBeenCalledWith(
          expect.objectContaining({
            'Status': 'Failed',
            'Last Used': '2026-11-22T10:00:00Z',
            'Failure': 'token.permission-grant-failed: Grant failed',
            'Failure Details': 'InvoiceWrite; not held',
          }),
          { json: false },
        );
      });

      it('omits the failure details line when there are none', async () => {
        mockClient.tokens.getTokenRev2.mockResolvedValue({
          ...rev2Token,
          failure: { code: 'token.unknown-error', description: 'Unknown', details: null },
        });
        await (tokenCommand.subCommands!.get as any).run!({ args: { ref: 'tok-ref-2', rev2: true } });
        const rows = vi.mocked(output.outputKeyValue).mock.calls[0][0];
        expect(rows).toHaveProperty('Failure', 'token.unknown-error: Unknown');
        expect(rows).not.toHaveProperty('Failure Details');
      });

      it('prints the raw response with --json', async () => {
        mockClient.tokens.getTokenRev2.mockResolvedValue(rev2Token);
        await (tokenCommand.subCommands!.get as any).run!({ args: { ref: 'tok-ref-2', rev2: true, json: true } });
        expect(vi.mocked(output.outputResult)).toHaveBeenCalledWith(rev2Token, { json: true });
      });
    });
  });

  describe('approve', () => {
    it('calls approveToken and reports success', async () => {
      mockClient.tokens.approveToken.mockResolvedValue(undefined);
      await (tokenCommand.subCommands!.approve as any).run!({ args: { ref: 'tok-ref-2' } });
      expect(mockClient.tokens.approveToken).toHaveBeenCalledWith('tok-ref-2');
      expect(vi.mocked(output.outputSuccess)).toHaveBeenCalledWith('Token tok-ref-2 approved.');
    });

    it('outputs JSON when --json flag is set', async () => {
      mockClient.tokens.approveToken.mockResolvedValue(undefined);
      await (tokenCommand.subCommands!.approve as any).run!({ args: { ref: 'tok-ref-2', json: true } });
      expect(vi.mocked(output.outputResult)).toHaveBeenCalledWith(
        { status: 'approved', referenceNumber: 'tok-ref-2' },
        { json: true },
      );
    });

    it('explains error 26005: approval needs a certificate or XAdES session', async () => {
      const { consola } = await import('consola');
      const error = new KSeFBadRequestError({
        title: 'Bad Request',
        status: 400,
        errors: [{ code: 26005, description: 'Approval not allowed for token authentication' }],
      });
      mockClient.tokens.approveToken.mockRejectedValue(error);
      const failure = await (tokenCommand.subCommands!.approve as any).run!({ args: { ref: 'tok-ref-2' } })
        .catch((e: unknown) => e);
      expect(failure).toBe(error);

      renderCliError(failure);
      expect(consola.info).toHaveBeenCalledWith(expect.stringMatching(
        /^Hint \[26005\]: A token cannot be approved from a session signed in with a KSeF token\. Sign in with a certificate or a XAdES signature/,
      ));
    });
  });
});
