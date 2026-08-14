export interface TestResult {
  ok: boolean;
  error?: string;
}

export interface OrderResult {
  ok: boolean;
  orderId?: string;
  error?: string;
}

export interface FilledTrade {
  orderId: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  feeUsd: number;
  timeMs: number;
}

export interface ProtectedEntryParams {
  symbol: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  slPrice: number;
  tpPrices: number[];
  quantity: number;
  passphrase?: string;
}

export interface ExchangeAdapter {
  id: string;
  testConnection(apiKey: string, apiSecret: string, passphrase?: string): Promise<TestResult>;
  // --- Order execution (optional: only exchanges with a real implementation
  //     can execute; the engine skips the rest with a logged event) ---
  getTickerPrice?(symbol: string, opts?: ConnectionOpts): Promise<{ price: number }>;
  /** Available USDT-ish balance used as "capital" for sizing. */
  getBalanceUsdt?(apiKey: string, apiSecret: string, passphrase?: string, opts?: ConnectionOpts): Promise<{ balance: number }>;
  /**
   * Places the entry limit order AND attaches SL + TP protection in the same
   * flow. If the exchange supports atomic protection (OCO / algo order) the
   * protection is placed FIRST so a filled position can never be unprotected.
   */
  placeProtectedEntry?(params: ProtectedEntryParams, apiKey: string, apiSecret: string, opts?: ConnectionOpts): Promise<OrderResult>;
  getOrderStatus?(orderId: string, symbol: string, apiKey: string, apiSecret: string, opts?: ConnectionOpts): Promise<{ status: string; filledQuantity?: number; avgPrice?: number }>;
  cancelOrder?(orderId: string, symbol: string, apiKey: string, apiSecret: string, opts?: ConnectionOpts): Promise<{ ok: boolean; error?: string }>;
  /** Closed fills for a symbol since a timestamp (for TP/SL detection + commission). */
  getClosedFills?(symbol: string, sinceMs: number, apiKey: string, apiSecret: string, opts?: ConnectionOpts): Promise<FilledTrade[]>;
}

export interface ConnectionOpts {
  testnet?: boolean;
  passphrase?: string;
  /** Paper-exchange connection id (simulated trading). */
  connectionId?: string;
}

export interface ExchangeInfo {
  id: string;
  name: string;
  signupUrl: string;
  /** Direct URL to the exchange's API-key management page (verified working). */
  apiKeyUrl: string;
  docsUrl: string;
  hasAffiliate: boolean; // shows the "affiliate link" disclosure label (UE/CNMC)
  supportsSpot: boolean;
  supportsFutures: boolean;
  needsPassphrase: boolean;
}
