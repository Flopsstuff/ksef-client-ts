export interface EnvironmentConfig {
  apiUrl: string;
  qrUrl: string;
  lighthouseUrl: string;
}

export const Environment = {
  TEST: {
    apiUrl: 'https://ksef-test.mf.gov.pl/api',
    qrUrl: 'https://qr-test.ksef.mf.gov.pl',
    lighthouseUrl: 'https://ksef-test.mf.gov.pl/api',
  },
  DEMO: {
    apiUrl: 'https://ksef-demo.mf.gov.pl/api',
    qrUrl: 'https://qr-demo.ksef.mf.gov.pl',
    lighthouseUrl: 'https://ksef-demo.mf.gov.pl/api',
  },
  PRD: {
    apiUrl: 'https://ksef.mf.gov.pl/api',
    qrUrl: 'https://qr.ksef.mf.gov.pl',
    lighthouseUrl: 'https://ksef.mf.gov.pl/api',
  },
} as const satisfies Record<string, EnvironmentConfig>;

export type EnvironmentName = keyof typeof Environment;
