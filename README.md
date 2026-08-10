This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## NOIRAX — Auto Trading & Signal Platform

- **Signal pipeline** (`pipeline/`): technical analysis from Bybit/OKX public market data (Binance geo-blocks datacenter IPs), fundamental analysis, weekly summaries. Runs every 10 minutes on GitHub Actions, triggered by an external cron pinger (cron-job.org -> workflow_dispatch).
- **Auto trading** (`/trading`): users connect exchange API keys (AES-256-GCM encrypted with `EXCHANGE_MASTER_KEY`), choose an operation mode and a risk profile. Hard safety caps are enforced server-side. Order execution is a future phase.

## Execution engine (real order placement)

- Trigger: cron-job.org job `NOIRAX trading engine` -> `POST /api/trading/engine` with header `x-engine-token` (env `TRADING_ENGINE_TOKEN`) every 3 minutes.
- Order placement: entry LIMIT + SL/TP protection placed BEFORE the entry (Binance OCO, Bybit spot OCO, OKX conditional algo + TP ladder). A position can never be unprotected.
- Safety: hard caps (15% position, 1-15% daily brake, 8 max trades), risk <= 4% per trade, mandatory SL/TP per signal, dedupe per user+signal, per-trade audit in `trading_events`, email alerts via Resend on failures.

### Testnet -> real money switch (ONE env var)

- `TRADING_TESTNET_FORCE=true` (CURRENT default for the launch week): every connection executes against **testnet/demo** (Binance testnet, Bybit testnet, OKX demo trading) regardless of per-connection flags. **No real money can move.**
- To go live with real money: set `TRADING_TESTNET_FORCE=false` in Vercel (production), verify each exchange with real keys on testnet first, then enable. Also consider `TRADING_SAFETY_MODE=true` (3% position for the first 10 trades or 7 days) for the first real users.

## Deployment prerequisites

- **Vercel env vars** (production + preview): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `EXCHANGE_MASTER_KEY`, Stripe keys, `GEMINI_API_KEY`, `AI_PROVIDER`, `NEXT_PUBLIC_APP_URL`.
- **Supabase**: migrations `supabase/migrations/*` applied; Vault enabled (Database -> Vault) with a secret named `exchange_master_key` (64 hex chars = 32 bytes). The app reads the key from Vault first, then falls back to the `EXCHANGE_MASTER_KEY` env var.
- **Vercel Hobby note**: production deploys only pass when the commit author is linked to the Vercel account (see Vercel docs on project collaboration).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
