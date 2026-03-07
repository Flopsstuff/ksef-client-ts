/**
 * All KSeF API v2 route definitions.
 *
 * Static routes are plain string literals.
 * Parameterized routes are arrow functions returning template-literal `as const`.
 */
export const Routes = {
  TestData: {
    createSubject: 'testdata/subject',
    removeSubject: 'testdata/subject/remove',
    createPerson: 'testdata/person',
    removePerson: 'testdata/person/remove',
    grantPerms: 'testdata/permissions',
    revokePerms: 'testdata/permissions/revoke',
    enableAttach: 'testdata/attachment',
    disableAttach: 'testdata/attachment/revoke',
    changeSessionLimitsInCurrentContext: 'testdata/limits/context/session',
    restoreDefaultSessionLimitsInCurrentContext: 'testdata/limits/context/session',
    changeCertificatesLimitInCurrentSubject: 'testdata/limits/subject/certificate',
    restoreDefaultCertificatesLimitInCurrentSubject: 'testdata/limits/subject/certificate',
    rateLimits: 'testdata/rate-limits',
    productionRateLimits: 'testdata/rate-limits/production',
    blockContext: 'testdata/context/block',
    unblockContext: 'testdata/context/unblock',
  },

  Limits: {
    currentContext: 'limits/context',
    currentSubject: 'limits/subject',
    rateLimits: 'rate-limits',
  },

  ActiveSessions: {
    session: 'auth/sessions',
    currentSession: 'auth/sessions/current',
  },

  Authorization: {
    challenge: 'auth/challenge',
    xadesSignature: 'auth/xades-signature',
    ksefToken: 'auth/ksef-token',
    status: (ref: string) => `auth/${ref}` as const,
    Token: {
      redeem: 'auth/token/redeem',
      refresh: 'auth/token/refresh',
    },
  },

  Sessions: {
    root: 'sessions',
    byReference: (ref: string) => `sessions/${ref}` as const,
    invoices: (ref: string) => `sessions/${ref}/invoices` as const,
    invoice: (ref: string, invoiceRef: string) =>
      `sessions/${ref}/invoices/${invoiceRef}` as const,
    failedInvoices: (ref: string) =>
      `sessions/${ref}/invoices/failed` as const,
    upoByKsefNumber: (ref: string, ksefNumber: string) =>
      `sessions/${ref}/invoices/ksef/${ksefNumber}/upo` as const,
    upoByInvoiceReference: (ref: string, invoiceRef: string) =>
      `sessions/${ref}/invoices/${invoiceRef}/upo` as const,
    upo: (ref: string, upoRef: string) =>
      `sessions/${ref}/upo/${upoRef}` as const,
    Online: {
      open: 'sessions/online',
      invoices: (sessionRef: string) =>
        `sessions/online/${sessionRef}/invoices` as const,
      close: (sessionRef: string) =>
        `sessions/online/${sessionRef}/close` as const,
    },
    Batch: {
      open: 'sessions/batch',
      close: (batchRef: string) =>
        `sessions/batch/${batchRef}/close` as const,
    },
  },

  Invoices: {
    byKsefNumber: (ksefNumber: string) =>
      `invoices/ksef/${ksefNumber}` as const,
    queryMetadata: 'invoices/query/metadata',
    exports: 'invoices/exports',
    exportByReference: (ref: string) =>
      `invoices/exports/${ref}` as const,
  },

  Permissions: {
    Grants: {
      persons: 'permissions/persons/grants',
      entities: 'permissions/entities/grants',
      authorizations: 'permissions/authorizations/grants',
      indirect: 'permissions/indirect/grants',
      subunits: 'permissions/subunits/grants',
      euEntities: 'permissions/eu-entities/administration/grants',
      euEntitiesRepresentatives: 'permissions/eu-entities/grants',
    },
    Common: {
      grantById: (id: string) =>
        `permissions/common/grants/${id}` as const,
    },
    Authorizations: {
      grantById: (id: string) =>
        `permissions/authorizations/grants/${id}` as const,
    },
    Query: {
      personalGrants: 'permissions/query/personal/grants',
      personsGrants: 'permissions/query/persons/grants',
      subunitsGrants: 'permissions/query/subunits/grants',
      entitiesRoles: 'permissions/query/entities/roles',
      entitiesGrants: 'permissions/query/entities/grants',
      subordinateEntitiesRoles: 'permissions/query/subordinate-entities/roles',
      authorizationsGrants: 'permissions/query/authorizations/grants',
      euEntitiesGrants: 'permissions/query/eu-entities/grants',
    },
    Operations: {
      byReference: (ref: string) =>
        `permissions/operations/${ref}` as const,
    },
    Attachments: {
      status: 'permissions/attachments/status',
    },
  },

  Certificates: {
    limits: 'certificates/limits',
    enrollmentData: 'certificates/enrollments/data',
    enrollments: 'certificates/enrollments',
    enrollmentStatus: (ref: string) =>
      `certificates/enrollments/${ref}` as const,
    retrieve: 'certificates/retrieve',
    revoke: (serialNumber: string) =>
      `certificates/${serialNumber}/revoke` as const,
    query: 'certificates/query',
  },

  Tokens: {
    root: 'tokens',
    byReference: (ref: string) => `tokens/${ref}` as const,
  },

  Peppol: {
    query: 'peppol/query',
  },

  Security: {
    publicKeyCertificates: 'security/public-key-certificates',
  },

  Lighthouse: {
    status: 'lighthouse/status',
    messages: 'lighthouse/messages',
  },
} as const;
