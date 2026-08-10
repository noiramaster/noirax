// Exchange adapter registry — modular architecture.
//
// One adapter per exchange file. Adding a new exchange = add one file + one
// entry here; the rest of the app (UI, storage, limits) is exchange-agnostic.
//
// This phase implements credential VALIDATION (a signed read-only call to
// prove the key works and has trading access) for all 12 supported exchanges.
// Real order EXECUTION is a later phase; adapters expose the seam for it.

import binance from './binance';
import bybit from './bybit';
import okx from './okx';
import kucoin from './kucoin';
import kraken from './kraken';
import coinbase from './coinbase';
import mexc from './mexc';
import gate from './gate';
import htx from './htx';
import bingx from './bingx';
import bitget from './bitget';
import cryptocom from './cryptocom';
import type { ExchangeAdapter, ExchangeInfo } from './types';

export type { ExchangeAdapter, ExchangeInfo, TestResult } from './types';

export const EXCHANGES: ExchangeInfo[] = [
  { id: 'binance', name: 'Binance', signupUrl: 'https://www.binance.com/en/register', apiKeyUrl: 'https://www.binance.com/en/my/settings/api-management', docsUrl: 'https://www.binance.com/en/support/faq/how-to-create-api-keys-on-binance', hasAffiliate: true, supportsSpot: true, supportsFutures: true, needsPassphrase: false },
  { id: 'bybit', name: 'Bybit', signupUrl: 'https://www.bybit.com/en-US/invite', apiKeyUrl: 'https://www.bybit.com/en-US/user-center/api-management', docsUrl: 'https://www.bybit.com/en/help-center/s/article/How-to-create-API-key', hasAffiliate: true, supportsSpot: true, supportsFutures: true, needsPassphrase: false },
  { id: 'okx', name: 'OKX', signupUrl: 'https://www.okx.com/join', apiKeyUrl: 'https://www.okx.com/account/my-api', docsUrl: 'https://www.okx.com/help/how-do-i-create-an-api-key', hasAffiliate: true, supportsSpot: true, supportsFutures: true, needsPassphrase: true },
  { id: 'kucoin', name: 'KuCoin', signupUrl: 'https://www.kucoin.com/ucenter/signup', apiKeyUrl: 'https://www.kucoin.com/account/api', docsUrl: 'https://www.kucoin.com/support/70000000126', hasAffiliate: true, supportsSpot: true, supportsFutures: true, needsPassphrase: true },
  { id: 'kraken', name: 'Kraken', signupUrl: 'https://www.kraken.com/sign-up', apiKeyUrl: 'https://pro.kraken.com/settings/api', docsUrl: 'https://docs.kraken.com/rest/', hasAffiliate: false, supportsSpot: true, supportsFutures: false, needsPassphrase: false },
  { id: 'coinbase', name: 'Coinbase Advanced', signupUrl: 'https://www.coinbase.com/signup', apiKeyUrl: 'https://www.coinbase.com/settings/api', docsUrl: 'https://docs.cdp.coinbase.com/advanced-trade/docs/create-api-keys', hasAffiliate: false, supportsSpot: true, supportsFutures: false, needsPassphrase: false },
  { id: 'mexc', name: 'MEXC', signupUrl: 'https://www.mexc.com/register', apiKeyUrl: 'https://www.mexc.com/login?forward=%2Fusercenter%2Fapi-management', docsUrl: 'https://mexcdevelop.github.io/apidocs/spot_v3_en/', hasAffiliate: true, supportsSpot: true, supportsFutures: true, needsPassphrase: false },
  { id: 'gate', name: 'Gate.io', signupUrl: 'https://www.gate.io/signup', apiKeyUrl: 'https://www.gate.io/myaccount/api', docsUrl: 'https://www.gate.io/docs/developers/apiv4/en/', hasAffiliate: true, supportsSpot: true, supportsFutures: true, needsPassphrase: false },
  { id: 'htx', name: 'HTX', signupUrl: 'https://www.htx.com/signup', apiKeyUrl: 'https://www.htx.com/en-us/login?forward=%2Fen-us%2Fuser%2Fapi-manage', docsUrl: 'https://huobiapi.github.io/docs/spot/v1/en/', hasAffiliate: true, supportsSpot: true, supportsFutures: true, needsPassphrase: false },
  { id: 'bingx', name: 'BingX', signupUrl: 'https://bingx.com/invite', apiKeyUrl: 'https://bingx.com/en-us/account/api', docsUrl: 'https://bingx-api.github.io/docs/', hasAffiliate: true, supportsSpot: true, supportsFutures: true, needsPassphrase: false },
  { id: 'bitget', name: 'Bitget', signupUrl: 'https://www.bitget.com/register', apiKeyUrl: 'https://www.bitget.com/account/api-key-manager', docsUrl: 'https://www.bitget.com/docs/spot/', hasAffiliate: true, supportsSpot: true, supportsFutures: true, needsPassphrase: true },
  { id: 'cryptocom', name: 'Crypto.com', signupUrl: 'https://crypto.com/app/signup', apiKeyUrl: 'https://exchange.crypto.com/exchange/api/access', docsUrl: 'https://exchange-docs.crypto.com/rest/', hasAffiliate: true, supportsSpot: true, supportsFutures: true, needsPassphrase: false },
];

const ADAPTERS: Record<string, ExchangeAdapter> = {
  binance,
  bybit,
  okx,
  kucoin,
  kraken,
  coinbase,
  mexc,
  gate,
  htx,
  bingx,
  bitget,
  cryptocom,
};

export function getExchangeInfo(id: string): ExchangeInfo | undefined {
  return EXCHANGES.find((e) => e.id === id);
}

export function getAdapter(id: string): ExchangeAdapter | undefined {
  return ADAPTERS[id];
}
