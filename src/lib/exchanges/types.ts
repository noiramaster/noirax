export interface TestResult {
  ok: boolean;
  error?: string;
}

export interface ExchangeAdapter {
  id: string;
  testConnection(apiKey: string, apiSecret: string, passphrase?: string): Promise<TestResult>;
}

export interface ExchangeInfo {
  id: string;
  name: string;
  signupUrl: string;
  docsUrl: string;
  hasAffiliate: boolean; // shows the "affiliate link" disclosure label (UE/CNMC)
  supportsSpot: boolean;
  supportsFutures: boolean;
  needsPassphrase: boolean;
}
