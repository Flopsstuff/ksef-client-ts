export interface EnvironmentConfig {
  apiUrl: string;
  qrUrl: string;
  lighthouseUrl: string;
}

export const Environment = {
  TEST: {
    apiUrl: 'https://api-test.ksef.mf.gov.pl',
    qrUrl: 'https://qr-test.ksef.mf.gov.pl',
    lighthouseUrl: 'https://api-latarnia-test.ksef.mf.gov.pl',
  },
  DEMO: {
    apiUrl: 'https://api-demo.ksef.mf.gov.pl',
    qrUrl: 'https://qr-demo.ksef.mf.gov.pl',
    lighthouseUrl: '',
  },
  PRD: {
    apiUrl: 'https://api.ksef.mf.gov.pl',
    qrUrl: 'https://qr.ksef.mf.gov.pl',
    lighthouseUrl: 'https://api-latarnia.ksef.mf.gov.pl',
  },
} as const satisfies Record<string, EnvironmentConfig>;

export type EnvironmentName = keyof typeof Environment;
