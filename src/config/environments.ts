export interface EnvironmentConfig {
  apiUrl: string;
  qrUrl: string;
  lighthouseUrl: string;
}

export const Environment = {
  TEST: {
    apiUrl: 'https://ksef-test.mf.gov.pl/api',
    qrUrl: 'https://ksef-test.mf.gov.pl/web',
    lighthouseUrl: 'https://ksef-test.mf.gov.pl/api',
  },
  DEMO: {
    apiUrl: 'https://ksef-demo.mf.gov.pl/api',
    qrUrl: 'https://ksef-demo.mf.gov.pl/web',
    lighthouseUrl: 'https://ksef-demo.mf.gov.pl/api',
  },
  PRD: {
    apiUrl: 'https://ksef.mf.gov.pl/api',
    qrUrl: 'https://ksef.mf.gov.pl/web',
    lighthouseUrl: 'https://ksef.mf.gov.pl/api',
  },
} as const satisfies Record<string, EnvironmentConfig>;

export type EnvironmentName = keyof typeof Environment;
