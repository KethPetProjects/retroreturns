# RetroReturns

*What your S&P 500 investment actually returned — not what the average implies.*

RetroReturns is a client-side financial dashboard that shows what a 401k-style S&P 500 index fund
investment would *actually* have returned historically — year by year, using real sequenced annual
returns — compared against a flat "average return" projection for the same contributions. It also
includes a whole life insurance high-cash-value comparison module, built from a real Penn Mutual
policy illustration, so the two accumulation strategies can be compared honestly, side by side.

This build covers **Phase 1 (Accumulation)** and **Phase 2 (Whole Life Comparison)**. Phase 3
(Distribution) and Phase 4 (whole life policy loans) are documented in
[`investment-calculator-requirements.md`](investment-calculator-requirements.md) for a future
session but are not built here.

## Data sources

- **S&P 500 returns (1928–2025):** hardcoded reference dataset (`src/data/sp500Fallback.ts`),
  sourced from Aswath Damodaran's (NYU Stern) published historical returns dataset — both
  price-only and total-return (dividends reinvested) series. This build uses this dataset as the
  sole data source; no live market data API is wired up. The `useHistoricalReturns` hook is
  structured so a live API (Alpha Vantage, etc.) could be added later behind the same interface
  without touching any calling code.
- **Whole life illustration (1–55):** hardcoded reference dataset
  (`src/data/wholeLifeIllustration.ts`) from a real Penn Mutual policy illustration (issue age 44,
  7-pay over-funded high-cash-value design). 12 anchor years are exact figures from the source
  illustration; the remaining years are linearly interpolated between those anchors and flagged
  with `isExactFromIllustration: false` in the data file — replace with exact illustration data
  when available. Non-guaranteed values assume continuation of the current dividend scale and are
  not guaranteed.

No API key is required to run this build. `.env.example` documents a placeholder variable
(`VITE_ALPHA_VANTAGE_KEY`) reserved for a future live-data integration only.

## Quickstart

```bash
npm install
npm run dev
```

Then open the printed local URL (typically `http://localhost:5173`).

Other useful commands:

```bash
npm run build      # type-check + production build to /dist
npm test           # run the calculation-engine test suite (Vitest)
npm run test:watch # watch mode
```

## Environment variables

Copy `.env.example` to `.env` (or `.env.local`) if you want the placeholder in place — it isn't
required for this build to run, since the app doesn't call any live API. See `.env.example` for
the one reserved variable name.

## Project structure

```
/src
  /components        Phase 1 UI (input panel, chart, table, summary)
  /components/phase2  Phase 2 UI (whole life comparison, opportunity cost, caveats)
  /hooks              useHistoricalReturns, useSimulation, useWholeLifeComparison
  /data               sp500Fallback.ts, wholeLifeIllustration.ts (hardcoded reference data)
  /utils              xirr.ts, calculations.ts, wholeLifeCalculations.ts, premiumScaling.ts,
                      formatters.ts — pure, unit-tested calculation logic
  /types              Shared TypeScript types
```

Calculation logic lives in `hooks`/`utils`, not in `App.tsx`, so a future Distribution tab (Phase
3) can reuse the same simulation engine without a rewrite.

## Testing

The money-weighted (XIRR) return calculation — the number that answers "what did I actually earn"
— is the most important piece of math in this app. It's covered by unit tests in
`src/utils/__tests__/xirr.test.ts`, including a cross-check against a published Excel XIRR example.
The full accumulation and whole life engines are covered in `calculations.test.ts` and
`wholeLifeCalculations.test.ts`.

```bash
npm test
```

## Deployment — Azure Static Web Apps

This app is fully client-side (no backend), so Azure Static Web Apps' free tier is a good fit.
Deployment is via a GitHub Actions workflow that Azure generates automatically when you connect
the Static Web App resource directly to this GitHub repo.

### 1. Create the Azure Static Web App resource, connected to GitHub

1. In the [Azure Portal](https://portal.azure.com), create a new **Static Web App** resource.
2. Choose the **Free** plan.
3. Under **Deployment details**, set **Source** to **GitHub**, sign in/authorize if prompted, and
   select this repository and the `main` branch.
4. Build presets: **React** (or **Custom** if React isn't offered as a Vite option), app location
   `/`, output location `dist`, api location left blank (no backend).
5. Finish creation. Azure will:
   - Install its GitHub App on this repo
   - Commit a workflow file to `.github/workflows/` (e.g. `azure-static-web-apps-<name>.yml`)
   - Auto-create a deployment token as a GitHub repo secret (named
     `AZURE_STATIC_WEB_APPS_API_TOKEN_<generated-suffix>`) — no manual token copy-paste needed
   - Trigger an initial deployment run automatically

Pull the auto-generated workflow file down locally (`git pull`) after this step, since Azure
commits it directly to the repo.

### 2. (Optional) Set an API key as an Azure Application Setting

Not required for this build (no live API is used). If a live data source is added later and needs
an API key in production, set it in **Static Web App resource → Configuration → Application
settings** (e.g. `VITE_ALPHA_VANTAGE_KEY`). Note: since this is a client-side-only app, any
`VITE_*` variable is bundled into the built JavaScript and visible to anyone who views the site —
this is an accepted tradeoff for a free-tier API key with generous rate limits, not a true secret.

### 3. Deploy

Every push to `main` after the initial setup triggers the workflow automatically:

```bash
git push origin main
```

Check the **Actions** tab in GitHub to watch the deployment.

Your app will be live at:

```
https://<your-app-name>.azurestaticapps.net
```

(or a custom domain, if you configure one in the Static Web App resource).
