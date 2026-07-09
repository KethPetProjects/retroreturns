# Investment Return Calculator — Requirements Document
> For Claude Code / Vibe Coding Session
> **Status:** Phase 1 (Accumulation) — v2 draft. Distribution phase and Whole Life comparison reserved for later phases.

---

## 1. Project Overview

Build a **React + Vite web app** that shows what a 401k-style S&P 500 index fund investment would *actually* have returned historically — year by year, using real sequenced annual returns — compared side-by-side against what a financial advisor's flat "average return" projection would show for the exact same contributions. The core purpose is to expose **volatility drag / sequence-of-returns risk**: two investments with the same average return can end at very different dollar amounts depending on the order the returns happened in.

**Design philosophy (applies to all phases, especially 2 and 4):** This tool is built to educate, not to steer a client toward any particular product. Both the S&P and whole life sides carry real, distinct risks and tradeoffs, and both should be presented with equal seriousness. The goal is for a client (or the user, as a licensed agent showing this to clients) to walk away understanding the real mechanics and real caveats of each option — "another tool in the toolbox," not a sales instrument for either side.

**Comparable product:** Truth Concepts financial calculators — but clean, web-native, and not Excel-based.

**Deployment target:** GitHub (source control) → Azure Static Web Apps (free tier hosting), via GitHub Actions CI/CD — see Section 15 for full deployment architecture, matching the user's existing project pattern.

**Phasing:**
- **Phase 1 (this doc):** Accumulation-phase calculator — real sequenced returns vs. flat average returns
- **Phase 2 (reserved):** Whole life insurance high cash value comparison module
- **Phase 3 (reserved):** Distribution phase — how long funds last under withdrawal/expense assumptions

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Framework | React + Vite |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Data source | Live API (see Section 4) |
| Charts | Recharts |
| Deployment | Azure Static Web Apps (free tier), via GitHub Actions — see Section 15 |

No backend required. All computation happens client-side. API calls go directly from the browser.

---

## 3. Core Features

### 3.1 Layout

```
┌─────────────────────────────────────────────────────┐
│  Header: App name + subtitle                        │
├───────────────────────────────────────────────────────┤
│  [ Tab: Accumulation ]   [ Tab: Distribution ]           │  ← Phase 3 adds this tab bar
├───────────────────────────────────────────────────────┤
│  INPUT PANEL (top, full width)                         │
│  Starting Year | # of Years | Starting Balance |       │
│  Annual Contribution | Mgmt Fee % | Tax Rate %          │
├───────────────────────────────────────────────────────┤
│  GROWTH CHART (below inputs, above table)                │
│  Line chart: Actual vs. Average-Rate balance over time   │
├───────────────────────────────────────────────────────┤
│  RESULTS TABLE (below chart, full width, scrollable)     │
│  Year-by-year rows...                                   │
├───────────────────────────────────────────────────────┤
│  SUMMARY SECTION (bottom)                                │
│  Totals, final CAGR, average rate used, dollar delta     │
└─────────────────────────────────────────────────────┘
```

**Tab structure note:** Phase 1 (this section) ships as a single-tab app. When Phase 3 is added, a tab bar appears with "Accumulation" and "Distribution" tabs — the Distribution tab reuses this same chart/table/summary layout pattern, just fed by Phase 3's withdrawal-mode calculations instead of contribution-mode. See Section 13 for how the two tabs hand off data to each other.

On mobile: inputs stack vertically, table scrolls horizontally.

Results recalculate live as inputs change (debounced 300ms).

---

### 3.2 Input Panel

| Field | Type | Default | Notes |
|---|---|---|---|
| Starting Year | Number (year) | — required | Between 1928 and (current year − 1) |
| Number of Years | Number (integer) | — required | Starting year + years must not exceed current year |
| Starting Balance | Dollar amount | $0 | Initial lump sum at start of year 1 |
| Annual Contribution | Dollar amount | $0 | Added at the **start** of each year (earns that year's return) |
| Management Fee (%) | Percentage | 0.03% | Deducted from return every single year |
| Tax Rate (%) | Percentage | 0% | Deducted once at the end, on total growth. *(Placeholder logic — will be replaced with proper withdrawal-based tax treatment in the Phase 3 distribution module.)* |

**Validation rules:**
- Starting year + number of years must not exceed the current year
- Starting balance and annual contribution cannot both be $0
- Tax rate: 0–50%. Management fee: 0–2%

---

### 3.3 Data Source — Historical S&P 500 Annual Returns

Need **two return series per year**:
1. **Price-only return** (index price change, no dividends) — the single-year % change, not cumulative
2. **Total return** (price + dividends reinvested) — also a single-year % change — this is the realistic number for an actual index fund investment and should be the default used in the "My Actual Amount" calculation

**Recommended API options (Claude Code to implement/evaluate):**

**Option A — Alpha Vantage (free tier)**
- `TIME_SERIES_ANNUAL_ADJUSTED` for SPY gives adjusted close (dividend-inclusive) and can derive unadjusted price-only return from the raw close
- Free API key required (stored in `.env`, never hardcoded)

**Option B — Stooq (no API key)**
- CSV endpoint for `^SPX` gives price-only annual data
- Dividend data would need a secondary source (e.g., multpl.com or a hardcoded dividend yield series) if using this option

**Option C — Fallback hardcoded dataset**
- Static hardcoded array, 1928–2024, with both price-only and total-return annual percentages (this dataset is widely published — e.g., via Damodaran's NYU Stern historical returns data — and is fine as a permanent fallback)
- App should clearly flag in the UI when it's using cached/fallback data vs. live API data

**Caching:** Store fetched data in `localStorage` with a 24-hour TTL to avoid repeated API calls / rate limits.

---

### 3.4 Calculation Logic

For each simulated year `i` (1 to N), where `contribution` is constant annual input, `fee` is management fee, `tax` is tax rate:

```
// --- ACTUAL (sequenced) column ---
actual_balance[0] = starting_balance

For year i (1 to N):
  year_label = starting_year + i - 1
  total_return[i] = historical_sp500_total_return[year_label]   // with dividends

  // contribution added at START of year, earns that year's return
  beg_balance[i] = actual_balance[i-1] + contribution
  gross_growth[i] = beg_balance[i] * total_return[i]              // dollar interest earned, can be negative
  fee_amount[i] = beg_balance[i] * fee                            // fee is % of BEGINNING balance, charged every year regardless of gain/loss (matches real-world AUM fee mechanics)
  actual_balance[i] = beg_balance[i] + gross_growth[i] - fee_amount[i]

  // NOTE: per-row CAGR is money-weighted (XIRR-style), not this simplified ratio — see Section 3.5
  cagr[i] = xirr(cash_flows_through_year(i), actual_balance[i])

// --- AVERAGE-RATE (flat) comparison column ---
avg_rate = arithmetic_mean(total_return[1..N])   // auto-calculated from actual sequence

average_balance[0] = starting_balance
For year i (1 to N):
  beg_avg_balance[i] = average_balance[i-1] + contribution
  gross_avg_growth[i] = beg_avg_balance[i] * avg_rate
  fee_avg_amount[i] = beg_avg_balance[i] * fee
  average_balance[i] = beg_avg_balance[i] + gross_avg_growth[i] - fee_avg_amount[i]

// --- End of period ---
total_contributed = starting_balance + (contribution * N)
final_actual_value = actual_balance[N] * (1 - tax)      // tax applied once, on final balance, Phase 1 placeholder
final_average_value = average_balance[N] * (1 - tax)

dollar_difference = final_average_value - final_actual_value
final_cagr = cagr[N]
```

**Fee mechanic note:** the fee is charged as a **percentage of the beginning-of-year balance**, every year, regardless of whether that year's market return was positive or negative — this matches how real-world AUM-based advisor fees actually work (you pay the fee even in down years). This replaces an earlier "fee subtracted from the return rate" approach, corrected after reviewing a real-world example table where fee dollars clearly scaled with account balance rather than with that year's return.

**Handling negative years:** A negative `net_return[i]` simply reduces `actual_balance[i]` below `base` — no special-casing needed, the formula naturally handles drawdowns and the next year compounds from the reduced amount.

---

### 3.5 CAGR Formula with Ongoing Contributions

Standard CAGR (`(End/Start)^(1/years) - 1`) is only clean for a lump sum with no additional contributions. Since this model has recurring annual contributions — often large relative to the starting balance — a naive formula badly understates the true annualized return, because it stretches the ratio of ending balance to total contributed across the full period even though most contributions were only invested for a fraction of that time.

**Decision: use money-weighted return (XIRR-style) as the primary "Final CAGR (Actual)" metric.**

**Methodology:**
- Treat every cash flow as its own dated entry: the starting balance (at year 0), each annual contribution (at the start of its respective year), and the ending balance (at year N, as a final negative/terminal cash flow for solving purposes)
- Solve for the single annualized rate `r` that makes the net present value of all cash flows equal zero (standard XIRR / Newton's-method IRR solve)
- This is the rate that actually reconciles what was put in, when, against what came out at the end — i.e., the honest answer to "what annual rate did I really earn on my money"

**Implementation notes for Claude Code:**
- Implement via an iterative solver (Newton's method or bisection) since there's no closed-form solution for IRR with irregular/multiple cash flows
- A standard JS finance library (e.g., a small XIRR utility, or hand-rolled Newton's method) is sufficient — no need for a heavy dependency
- Compute this **once for the final year** (the "Final CAGR (Actual)" summary metric) — this is the headline number
- For the **per-row "CAGR (Actual, to date)" table column**, running an XIRR solve on every single row (each with a growing list of cash flows) is more expensive but still feasible client-side for typical ranges (≤50 years); use the same solver, computed against the subset of cash flows through that row's year
- Apply this same methodology to the Average-Rate track as well, for an apples-to-apples comparison in the summary (though for that track, since the rate is flat, the money-weighted return should closely approximate the flat rate itself minus fee)

**Superseded:** the previously-planned "simplified running CAGR" (`balance / total_contributed_so_far ^ (1/years) - 1`) is no longer used — it's replaced by the money-weighted approach above for both the table column and the summary metric.

---

### 3.6 Growth Chart

A line chart showing both balance tracks compounding over the full simulated period, so the divergence caused by volatility is visible at a glance rather than requiring the user to scan table rows.

**Chart type:** Line chart (Recharts)

**Axes:**
- X-axis: Year (starting_year to starting_year + N)
- Y-axis: Dollar balance

**Lines:**
1. **My Actual Amount** — solid line, using the real sequenced-return balance from Section 3.4
2. **Average-Rate Amount** — dashed line, using the flat-average-rate balance from Section 3.4

**Interactivity:**
- Hover tooltip shows: Year, Actual Amount, Average-Rate Amount, dollar gap between the two, and that year's actual S&P 500 total return %
- Legend distinguishing the two lines

**Placement:** Directly below the input panel, above the results table — so the visual "reveal" comes before the user has to read table rows.

**Behavior:** Recalculates live with the table on any input change (same debounce), and should visually update in sync with the table and summary section.

**Purpose note for Claude Code:** The visual gap between the solid and dashed lines *is the point of the app* — it should be immediately obvious, even without reading numbers, that the two lines diverge over time due to volatility/sequencing even when they share the same average rate.

---

### 3.7 Results Table

| Column | Description |
|---|---|
| Year | Calendar year (e.g., 1995) |
| Beg. of Year Amount | Prior year's ending balance + this year's contribution (the base this year's return applies to) |
| Contribution | That year's contribution amount |
| S&P 500 Return (Price Only) | Annual % return for that specific year, no dividends |
| S&P 500 Return (Total Return) | Annual % return for that specific year, with dividends reinvested — this is what drives the Actual Amount calc |
| Avg Rate Used | The flat arithmetic-mean rate used in the comparison column — same value repeated every row, shown for easy visual reference against that year's real return |
| Interest Earnings ($) | Dollar amount of growth (or loss) this year = Beg. of Year Amount × Total Return % |
| Fee ($) | Dollar amount of fee this year = Beg. of Year Amount × Fee % (charged every year regardless of gain/loss) |
| My Actual Amount | Running ending balance using real sequenced returns (col defined in 3.4) |
| CAGR (Actual, to date) | Annualized real return through this year (per 3.5 methodology) |
| Average-Rate Amount | Running ending balance using the flat arithmetic-mean rate applied evenly every year |

**Row styling:** years with negative total return get a subtle red-tinted row; positive years subtle green tint (visual scan aid, not a full chart).

**Table is sortable by year** (default ascending, oldest to newest).

---

### 3.8 Summary Section (below table)

| Metric | Value |
|---|---|
| Total Contributed | Starting balance + (contribution × years) |
| Final Actual Amount | Ending value using real sequenced returns, net of fee and tax |
| Final Average-Rate Amount | Ending value using flat average rate, net of fee and tax |
| Dollar Difference | Average-Rate amount − Actual amount (shows the "myth of average returns" gap) |
| % Difference | Dollar Difference as a % of Final Actual Amount — makes the gap comparable across different scenarios/dollar scales |
| Final CAGR (Actual) | The real annualized growth rate actually achieved |
| Average Rate Used | The arithmetic mean rate that was applied in the comparison column, for reference |
| Management Fee Applied | Echo back the fee % used |
| **Fee Impact ($)** | **Dollar cost of the management fee alone — computed by re-running the Actual track at a 0.03% baseline fee (typical low-cost index fund) instead of the user's input fee, holding everything else constant, then showing the difference between that baseline result and the actual result. Isolates what the fee alone cost in real dollars over the period, separate from tax and separate from market performance.** |
| Tax Rate Applied | Echo back the tax % used |

This summary section is the "payoff" of the tool — it should visually emphasize the **Dollar Difference** since that's the number that demonstrates volatility drag.

---

## 4. UI / UX Design Direction

**Aesthetic:** Clean financial dashboard. Dark navy + white + green/red accent for return sign. Professional, data-dense but readable — think a well-designed spreadsheet, not a marketing page.

**UX behaviors:**
- Live recalculation on input change (debounced 300ms)
- Loading state while API data fetches
- Clear error/fallback state if live API fails — show a banner indicating fallback data is in use
- Dollar formatting: commas + 2 decimals (e.g., $1,234,567.89)
- Percentage formatting: 2 decimals with % sign (e.g., 8.47%)
- Sticky header row on the results table when scrolling long year ranges

---

## 5. App Name & Branding

**App name:** `RetroReturns` (placeholder — Claude Code or user can revise)
**Tagline:** *"What your S&P 500 investment actually returned — not what the average implies."*

---

## 6. File Structure (suggested)

```
/src
  /components
    InputPanel.tsx
    GrowthChart.tsx
    ResultsTable.tsx
    SummarySection.tsx
    LoadingSpinner.tsx
    ErrorState.tsx
  /hooks
    useHistoricalReturns.ts   // API fetch + localStorage cache + fallback
    useSimulation.ts          // Core calculation logic (actual + average tracks)
  /data
    sp500Fallback.ts          // Hardcoded 1928–2024 price-only + total-return annual data
  /utils
    formatters.ts             // Dollar, percent, year formatting helpers
    calculations.ts           // Pure calculation functions (testable) — actual balance, average balance, CAGR
  /types
    index.ts
  App.tsx
  main.tsx
```

**Forward-compatibility note:** Phase 1 ships as a single screen, but Phase 3 will introduce a second tab (Distribution) alongside this one (Accumulation), with the Distribution tab consuming this phase's ending balances as its starting input. It's reasonable for Claude Code to keep `App.tsx` and the calculation hooks structured in a way that doesn't hard-block adding a tab/router layer later (e.g., keep simulation logic in hooks/utils rather than tightly coupled to a single-page App.tsx), but Phase 1 itself should NOT pre-build tab navigation, routing, or Distribution-tab scaffolding — that's explicitly Phase 3 scope, built when Phase 3 requirements are finalized.

---

## 7. Out of Scope for Phase 1

- Whole life insurance comparison (Phase 2)
- Distribution phase / withdrawal modeling / fund longevity (Phase 3)
- Auto-generated insight text (explicitly deferred)
- User accounts / saved scenarios
- Export to PDF/CSV (candidate for later phase)
- Multiple side-by-side scenario comparison
- Proper lot-level/withdrawal-based tax treatment (Phase 1 uses a simplified end-of-period tax haircut only)

---

## 8. API Key Handling

- Store any required API key in `.env` as `VITE_ALPHA_VANTAGE_KEY` (or equivalent)
- Never hardcode keys in source
- Document key setup in README

---

## 9. README Requirements

1. What the app does (2–3 sentences)
2. How to get an API key (if applicable)
3. `.env.example` contents
4. `npm install` + `npm run dev` quickstart
5. Deploy instructions for Azure Static Web Apps (see Section 15.5 for full detail)

---

## 10. Acceptance Criteria

- [ ] User enters starting year 1995, 30 years, $10,000 starting balance, $6,000/year contribution — table populates with 30 rows of real historical data
- [ ] Price-only and total-return columns both populate correctly from live API, with graceful fallback to hardcoded data
- [ ] "My Actual Amount" column correctly compounds using sequenced total returns, contribution added at start of year
- [ ] A negative-return year correctly reduces the balance before the next year's contribution is added
- [ ] "Average-Rate Amount" column uses the arithmetic mean of the actual return sequence, applied flat across all years
- [ ] Growth chart renders both balance tracks (actual solid, average-rate dashed) and visibly diverges over the simulated period
- [ ] Chart hover tooltip shows year, both balances, dollar gap, and that year's total return
- [ ] Chart updates live in sync with the table and summary on any input change
- [ ] Summary section shows correct total contributed, final actual value, final average value, and dollar difference
- [ ] Changing management fee or tax rate live-updates all calculated columns and the summary
- [ ] Fee Impact ($) correctly isolates the fee's dollar cost by comparing against a 0.03% baseline-fee re-run of the same actual sequence, holding contributions/years/tax constant
- [ ] CAGR column and Final CAGR summary metric use money-weighted (XIRR-style) methodology (Section 3.5), not a simplified balance-over-contributions ratio
- [ ] Table is responsive / horizontally scrollable on mobile
- [ ] No console errors in production build
- [ ] Builds cleanly with `npm run build` and deploys successfully to Azure Static Web Apps via the GitHub Actions workflow

---

## 11. Confirmed Decisions

1. **CAGR methodology:** Money-weighted return (XIRR-style) — solves for the single annualized rate that reconciles the starting balance, every dated contribution, and the ending balance. Replaces the earlier simplified-ratio approach so the "Final CAGR" number reflects what was actually earned per dollar-year invested, not distorted by late-arriving contributions that had little time to compound.
2. **Average-rate benchmark:** Auto-calculated as the arithmetic mean of the actual sequenced total returns over the selected period; same management fee deducted each year as the actual track, for an apples-to-apples comparison
3. **Contribution timing:** Start of year — contributions earn that year's return
4. **Tax treatment (Phase 1):** Simple end-of-period haircut on final balance only; will be replaced with real withdrawal-based tax logic in Phase 3 (distribution phase)

---

## 12. Phase 2 — Whole Life Insurance Comparison (Requirements — Populated with Real Illustration Data)

**Status:** Real illustration data received (modeled on spouse's age/premium, Penn Mutual over-funded high-cash-value design). Requirements below are now build-ready.

**✅ IN SCOPE for the current build session**, alongside Phase 1.

### 12.1 Policy Design Context

The reference illustration is an **over-funded, high-cash-value (HCV) design** — issue age 44, using a 7-year front-loaded funding pattern:
- **Years 1–7:** Total annual premium of **$20,000** (Base Contract $3,151 + FPR $781 + APPUA — Additional Paid-Up Additions — $16,069)
- **Years 8+:** Total annual premium drops to **$3,931** (Base $3,151 + FPR $781; APPUA drops to $0)

This is a classic **7-pay funding structure** — heavy early funding via paid-up additions (to build cash value fast) for exactly 7 years, then minimum-funding the base contract thereafter to keep the policy in force without adding further APPUA premium. This is a materially different premium *shape* than a flat annual amount, and Phase 2 needs to model this two-tier schedule rather than assuming one constant contribution like Phase 1 does for the S&P side.

**This design trades a lower initial death benefit per premium dollar for materially faster and higher cash value accumulation** — confirmed by the real numbers below.

### 12.2 Real Illustration Data (Reference Case)

| Year | Age | Total Premium | Guaranteed Cash Value | Non-Guaranteed Cash Value | Dividend | Guaranteed Death Benefit | Non-Guaranteed Death Benefit |
|---|---|---|---|---|---|---|---|
| 1 | 44 | 20,000 | 15,493 | 15,889 | 396 | 402,389 | 402,785 |
| 5 | 48 | 20,000 | 93,348 | 100,466 | 2,497 | 434,809 | 450,039 |
| 6 | 49 | 20,000 | 114,933 | 125,426 | 3,184 | 478,458 | 501,258 |
| 7 | 50 | 20,000 | 137,120 | 151,844 | 3,949 | 520,963 | 553,072 |
| 8 | 51 | 3,931 | 144,410 | 163,820 | 4,293 | 522,881 | 565,655 |
| 15 | 58 | 3,931 | 200,324 | 268,109 | 7,316 | 534,991 | 670,802 |
| 22 | 65 | 3,931 | 261,244 | 414,594 | 11,860 | 545,139 | 810,577 |
| 25 | 68 | 3,931 | 288,893 | 494,848 | 14,562 | 548,995 | 883,930 |
| 30 | 73 | 3,931 | 336,183 | 657,959 | 20,137 | 554,879 | 1,028,947 |
| 31 | 74 | 3,931 | 345,770 | 695,506 | 21,401 | 555,983 | 1,061,619 |
| 40 | 83 | 3,931 | 430,797 | 1,118,226 | 35,687 | 565,028 | 1,418,409 |
| 55 | 98 | 3,931 | 532,302 | 2,196,218 | 72,049 | 577,746 | 2,364,283 |

**Full continuous dataset now available, years 1–55, no gaps** — years 1–22 and 23–30 confirmed via illustration screenshots, years 31–55 confirmed via a third screenshot. Source: The Penn Mutual Life Insurance Company, Policy Form ICC18-TL, illustration dated 2023.07.03 (WL2021 product). Claude Code should hardcode the complete row-by-row dataset from all three source screenshots — the table above is a representative excerpt for spec readability, not the full dataset to implement.

### 12.3 Break-Even Point — Confirmed

- **Total premiums paid through year 6:** $120,000
- **Guaranteed cash value, year 6:** $114,933 → still **$5,067 below** break-even
- **Non-guaranteed cash value, year 6:** $125,426 → **$5,426 above** break-even

**Confirmed: break-even occurs at Year 6 on the non-guaranteed/dividend-inclusive track**, matching what the user described. The guaranteed-only track doesn't cross break-even until partway through year 7.

### 12.4 Implied Growth Rate (IRR) — Confirmed via Calculation

Using the actual premium schedule (7 years @ $20,000, then $3,931/year after) and the actual illustrated cash values as terminal values, the money-weighted internal rate of return works out to:

| Checkpoint | Guaranteed IRR | Non-Guaranteed IRR |
|---|---|---|
| Year 22 | 1.83% | **4.86%** |
| Year 30 | 1.84% | **4.96%** |
| Year 31 | — | **4.97%** |
| Year 55 | 1.31% | **4.76%** |

**This confirms the user's stated 4–5% non-guaranteed IRR range precisely**, calculated directly from the real illustration data using the same money-weighted (XIRR-style) methodology as Phase 1's Section 3.5 — meaning Phase 1 and Phase 2 will use a **consistent, comparable rate-of-return methodology** across both the S&P and whole life tracks. The guaranteed-only IRR (1.3–1.8%) represents the contractual floor if dividends were ever reduced to zero going forward — a genuinely useful "worst case" reference alongside the non-guaranteed projection.

### 12.5 Two-Line Structure — Confirmed

As planned, Phase 2 shows **two whole life lines**, matching the illustration's own structure:
1. **Guaranteed cash value** — contractual, ~1.3–1.8% effective IRR over the long run in this example
2. **Non-guaranteed (dividend-inclusive) cash value** — ~4.8–5.0% effective IRR, dependent on continuation of the current dividend scale

Both should be plotted against the S&P Phase 1 tracks (Actual and Average-Rate) on the same or an adjacent chart, using the **same annual funding schedule** ($20,000/year for 7 years, then $3,931/year after) applied to the S&P side as well, for a true apples-to-apples comparison — this replaces Phase 1's flat-contribution assumption *for the purposes of this specific comparison* (Phase 1 itself remains flat-contribution by default, but Phase 2's comparison mode should mirror the WL policy's actual funding shape).

### 12.6 Additional Data Points Available for Future Use

The illustration also includes **Total Death Benefit (with and without dividends)** at every year, which isn't part of Phase 2's core cash-value comparison but is exactly the data needed for **Phase 4** (whole life loan-based distribution), where death benefit erosion from outstanding loans is a key output. This data should be retained/hardcoded now even though Phase 4 isn't being built yet, so it doesn't need to be re-sourced later.

### 12.7 Data Source Implementation

- Hardcode the full year-by-year illustration (guaranteed CV, non-guaranteed CV, dividend, total premium, guaranteed DB, non-guaranteed DB) as a static reference dataset — same pattern as Phase 1's `sp500Fallback.ts`, e.g. `/data/wholeLifeIllustration.ts`
- Clearly label this dataset in the UI as **"Reference illustration — Penn Mutual, issue age 44, non-guaranteed values are not guaranteed and assume continuation of the current dividend scale"** — matching the honesty standard already set for the S&P side's fallback-data labeling
- No live API exists for personalized insurance illustrations, so this remains a static hardcoded dataset only, unlike the S&P side's live-API-with-fallback approach

### 12.8 Remaining Open Items

- [x] ~~Full year-by-year data for years 23–30~~ — **Resolved.** Gap closed via third screenshot (Penn Mutual illustration, Policy Form ICC18-TL, dated 2023.07.03). Continuous data now available for years 1–55.
- [ ] Data for years 56+ (if the illustration extends further — the source document is 26 pages total per the page footer, so additional years likely exist beyond year 55 if needed later)
- [ ] Confirm whether this exact illustration (spouse's age 44, "Ramiya Arthi" per the source filename) is the one to hardcode as the app's default reference case, or whether the user's own policy (different age/premium) should be used instead, once available
- [ ] Decide whether Phase 2's comparison should let the user adjust the WL funding schedule (e.g., different premium amounts) or treat it as a fixed reference case that isn't user-editable in v1

### 12.9 Opportunity Cost of Insurance Costs (Uninvested Dollars)

**Purpose:** Every dollar of the $20,000/year premium that goes toward the **Base Contract Premium ($3,151/year) and FPR ($781/year) — combined $3,932/year, every year, for the full 55-year illustration** — is not itself accumulating as cash value the way APPUA dollars are. This is the cost of the insurance protection itself (mortality charges, policy expenses), and it's money a pure S&P investor would never spend, since a taxable brokerage or 401k account has no insurance cost component at all.

**This must be shown explicitly, not left implicit**, so a client can see: *"here's what these same non-APPUA dollars would have been worth if they'd gone into the market instead, rather than paying for the insurance wrapper."*

**Calculation:**
```
non_appua_premium[year] = base_contract_premium + fpr_premium   // 3,932/year, every year of the illustration
// Run this stream through the SAME Phase 1 engine (actual sequenced returns AND average-rate),
// as its own independent side calculation — starting fresh, not blended into the main WL-vs-S&P comparison

opportunity_cost_balance_actual[year] = [Phase 1 engine output using non_appua_premium as the contribution stream, actual sequenced returns]
opportunity_cost_balance_avg[year] = [Phase 1 engine output using non_appua_premium as the contribution stream, average rate]
```

**Display:** a distinct line/metric in Phase 2's chart or a dedicated callout: **"If the $3,932/year insurance-cost portion of your premium had instead been invested in the S&P 500, it would be worth $X (actual) / $Y (average-rate) by year N — this is the opportunity cost of the insurance protection itself, separate from the APPUA dollars that are already being compared."**

**Important framing note for Claude Code / UI copy:** this is not meant to imply the insurance cost was "wasted" — it purchased real death benefit protection the S&P side never had (see Section 12.10). The opportunity cost figure exists so the client can see the full picture and weigh protection value against foregone market growth themselves, not to steer them toward either product.

### 12.10 Caveats Panel — Required on Both Phase 2 and Phase 4 Screens

**Purpose:** This tool is explicitly designed to show volatility and real tradeoffs honestly — **not to steer a client toward either product.** A visible, always-present caveats panel keeps the tool positioned as an education aid ("another tool in your toolbox") rather than a sales instrument, which matters both ethically and for the user's credibility as a licensed agent showing this to real clients.

**Placement:** A persistent, visible panel (not buried in a footnote or a collapsed accordion) on both the Phase 2 (accumulation comparison) and Phase 4 (distribution comparison) screens — e.g., a sidebar card or an always-expanded section directly below the chart.

**Required caveats to include, at minimum:**

1. **Early death benefit value.** In year 1, the guaranteed death benefit is already $402,389 against only $15,493 of cash value — the S&P side has no equivalent protection at any point. A client who dies early is not comparably situated between the two products, and this comparison tool only measures accumulation/distribution value, not protection value.
2. **Dividend scale is not guaranteed.** The non-guaranteed cash value and IRR (4.8–5.0% in this illustration) depend on the insurer continuing its current dividend scale. Dividend scales have been reduced industry-wide in the past during sustained low-interest-rate environments. The guaranteed track (1.3–1.8% IRR in this illustration) is the contractual floor if that happened.
3. **Policy loan risk (Phase 4 specifically).** Over-borrowing against a policy can cause it to lapse if the loan balance plus accrued interest exceeds cash value. A lapse with an outstanding loan can trigger a large, immediate taxable event on the gain — this is a materially different risk profile than simply running out of money in a brokerage account.
4. **Behavioral risk asymmetry.** The S&P side's modeled numbers assume the investor never deviates from the plan — no panic-selling in a crash, no stopping contributions. Real investor behavior often underperforms the market itself for this reason (a well-documented industry finding). Whole life cash value, by contrast, is contractually guaranteed not to lose value from market movement, which removes this particular behavioral risk entirely — though it introduces the dividend-scale and loan risks noted above instead.
5. **Tax treatment differs structurally, not just numerically.** S&P withdrawals are taxed as capital gains (taxable account) or ordinary income (401k/IRA); whole life loans are typically received tax-free if the policy remains in force. This comparison tool models both, but a client's actual tax situation should be reviewed with a qualified tax advisor before relying on either projection.
6. **This tool is illustrative, not a guarantee of future results for either product.** Historical S&P sequences are real market history, not a prediction. Whole life dividend scales are current company projections, not guarantees (see caveat 2).

**Tone requirement:** caveats should read as genuinely balanced — flagging real risks on both the S&P side (volatility, sequence-of-returns risk, behavioral risk) and the whole life side (dividend-scale dependency, loan/lapse risk) with equal seriousness, not softening one product's risks while emphasizing the other's.

### 12.11 Premium Scaling for Different Annual Investment Amounts

**The problem:** the hardcoded illustration in Section 12.2 is a real, priced Penn Mutual policy at a specific funding level ($20,000/year for 7 years, then $3,931/year). Whole life pricing is **not linearly scalable** the way an investment account is — fixed policy fees and mortality costs don't shrink proportionally with a smaller premium, so a real illustration at, say, $10,000/year would almost certainly show a **lower** IRR than this policy's 4.8–5.0%, not the same rate at half the dollars. Unlike the S&P side (where $10K/year is simply half of $20K/year, same rate, done), there is no mathematically correct way to derive a true $10K/year whole life illustration from a $20K/year one.

**Decision: implement a linear scaling toggle as an approximation, not a real quote.**

**Mechanics:**
- User can input a different annual investment amount (e.g., $10,000/year instead of the illustration's $20,000/year for the front-loaded years, and proportionally for the $3,931/year sustaining period)
- All WL cash value, dividend, and death benefit figures scale **linearly by the same ratio** as the premium change (e.g., a 50% premium reduction scales every cash value, dividend, and death benefit figure in the illustration by 0.5)
- This preserves the illustration's IRR exactly (since linear scaling doesn't change a rate of return) — which is the known inaccuracy being accepted here, clearly flagged to the user

**Required UI treatment — prominent, unmissable warning:**
- Displayed immediately adjacent to the premium input whenever the user changes it away from the original $20,000/$3,931 illustration values
- Suggested copy: *"⚠️ Approximation only — not a real quote. Whole life pricing does not scale linearly with premium; fixed policy costs and mortality charges make smaller premiums proportionally more expensive, typically resulting in a lower real-world rate of return than shown here. This scaled projection assumes the same 4.8–5.0% IRR as the original $20,000/year illustration, which is unlikely to hold exactly at a different funding level. For an accurate number, request a real illustration at your target premium from a licensed agent."*
- This warning should be visually persistent (not a one-time dismissible toast) for as long as a scaled (non-original) premium amount is active
- The original $20,000/7-pay illustration should remain easily selectable/resettable as the "real illustration" baseline, clearly distinguished from any scaled/hypothetical amount

**Explicitly out of scope for this toggle:** attempting to model *why* smaller premiums have lower IRRs (e.g., simulating fixed-cost drag) is not part of this approximation — that would require actual insurance pricing/actuarial logic this tool doesn't have access to. The toggle is a simple, transparent linear scale with a clear warning, nothing more sophisticated.

### 12.12 Phase 2 Acceptance Criteria

- [ ] Full year-by-year illustration data (guaranteed CV, non-guaranteed CV, dividend, premium, guaranteed/non-guaranteed death benefit) for years 1–55 is hardcoded and renders correctly
- [ ] Guaranteed and non-guaranteed cash value lines both display on the comparison chart, clearly labeled
- [ ] Break-even year (Year 6 on non-guaranteed, Year 7 on guaranteed) is correctly reflected in the data
- [ ] Money-weighted IRR calculated from the real premium schedule and cash values matches the confirmed ~4.8–5.0% (non-guaranteed) / ~1.3–1.8% (guaranteed) range
- [ ] Opportunity cost calculation (Section 12.9) correctly runs the $3,932/year non-APPUA premium stream through the Phase 1 engine and displays the result distinctly from the main comparison
- [ ] Caveats panel (Section 12.10) is visible by default (not collapsed/hidden) on the Phase 2 screen and includes all six required caveats
- [ ] Premium scaling toggle (Section 12.11) correctly scales all WL figures linearly and displays the prominent approximation warning whenever a non-original premium is active
- [ ] The original $20,000/7-pay illustration remains easily resettable as the baseline "real illustration"

---

## 13. Phase 3 — Distribution Phase (Requirements Draft)

**Status:** Requirements captured, not yet built. Builds on Phase 1's accumulation engine — this phase picks up where accumulation ends and models the drawdown.

**🚫 NOT IN SCOPE for the current build session.** This section is fully documented for future reference and to inform architectural decisions in Phase 1/2 (e.g., keeping calculation logic decoupled per Section 6's forward-compatibility note), but Claude Code should NOT build the Distribution tab, tab navigation/routing, or any Phase 3 calculation logic in this session. Revisit this spec (and refine it against the real, running Phase 1/2 app) before starting a dedicated Phase 3 build session.

### 13.1 Concept

Once contributions stop (retirement / stop-working point), the remaining balance continues to grow — but instead of adding money each year, the user now **withdraws** a percentage of the balance annually. The question this phase answers: **"How long will my money actually last, given real market volatility — not just an assumed flat average return?"**

Like Phase 1, this should show **both tracks side by side**:
1. **Distribution under the Average-Rate assumption** — smooth, predictable, same withdrawal %, easy to model, but unrealistic
2. **Distribution under real sequenced (volatile) returns** — using actual historical year-by-year returns, which is what real retirees actually experience, and which can deplete a portfolio much faster than the average-rate math suggests if bad years hit early in retirement (this is the classic "sequence of returns risk in retirement" problem — the mirror image of what Phase 1 explored in accumulation)

### 13.2 New Inputs for Phase 3

| Field | Type | Notes |
|---|---|---|
| Current Age | Number | User's age today — needed to map the accumulation timeline (Phase 1's Starting Year + Number of Years) to a real age progression |
| Stop-Working Age | Number | The age at which contributions stop and withdrawals begin. Must be validated against Current Age + Phase 1's Number of Years — see validation note below |
| Distribution Rate (%) | Percentage | Annual withdrawal, calculated as a % of the balance **at the moment distribution begins**, then held as a fixed dollar amount going forward (see 13.3) |
| Inflation Adjustment (%) | Percentage | Annual rate used to increase the fixed-dollar withdrawal each year, so real purchasing power is maintained. Reuses Phase 1's inflation input if already provided |

**Validation rule:** Stop-Working Age must correspond to a year within (or immediately following) Phase 1's simulated accumulation window — i.e., `starting_year + (stop_working_age - current_age)` must fall within a sensible range relative to `starting_year + number_of_years`. If the stop-working age implies distribution should begin before accumulation ends, or long after it, surface a clear validation message so the two phases stay temporally consistent.

### 13.3 Distribution Basis — Confirmed: Fixed-Dollar, Inflation-Adjusted

**Decision:** Withdrawals are calculated as a fixed dollar amount, not a % of the current (fluctuating) balance.

- In year 1 of retirement: `initial_withdrawal = balance_at_retirement * distribution_rate`
- Every year after: `withdrawal[j] = initial_withdrawal * (1 + inflation_rate)^(j-1)` — grows with inflation to maintain constant real purchasing power, but does **not** fluctuate with market performance
- This means withdrawals are predictable in dollar terms and the simulation can reach a clean "$0 balance" depletion point — unlike a %-of-current-balance approach, which decays asymptotically and never cleanly hits zero
- This matches how most real-world retirement withdrawal-rate research (e.g., the "4% rule") is modeled, so it's a defensible, industry-standard choice

### 13.3 Calculation Logic (Distribution Phase)

Continues directly from Phase 1's ending balance and reuses the same historical return sequence, just switching from contribution-mode to withdrawal-mode:

```
// Carries over from Phase 1's final actual_balance[N] and average_balance[N]
// Retirement begins at: retirement_year = starting_year + (stop_working_age - current_age)

initial_withdrawal_actual = actual_balance[N] * distribution_rate
initial_withdrawal_avg = average_balance[N] * distribution_rate

For year j (1 to M, where M = years in retirement, until balance hits zero or runs out of historical data):
  year_label = retirement_year + j - 1
  total_return[j] = historical_sp500_total_return[year_label]   // same real sequence, continuing forward

  // fixed-dollar withdrawal, inflation-adjusted each year — does NOT vary with balance or market performance
  withdrawal_actual[j] = initial_withdrawal_actual * (1 + inflation_rate)^(j-1)
  withdrawal_avg[j] = initial_withdrawal_avg * (1 + inflation_rate)^(j-1)

  // ACTUAL (volatile) track
  net_return_actual[j] = total_return[j] - fee
  actual_retirement_balance[j] = (actual_retirement_balance[j-1] - withdrawal_actual[j]) * (1 + net_return_actual[j])

  // AVERAGE-RATE track
  net_avg_return[j] = avg_rate - fee
  average_retirement_balance[j] = (average_retirement_balance[j-1] - withdrawal_avg[j]) * (1 + net_avg_return[j])

  // Depletion check
  if balance <= 0: mark "Funds Depleted in Year j" and stop that track's simulation
```

**Note:** Since withdrawals grow with inflation regardless of market performance, a track can be depleted purely by a bad sequence of early returns even if the average rate would have sustained it indefinitely — this is precisely the sequence-of-returns risk this phase is designed to expose.

**Output:** for each track, either "funds lasted the full M years" with an ending balance, or "funds depleted in year X" with the exact year flagged — this is the headline answer to "how long will my money last."

### 13.4 Open Questions — Resolved and Remaining

**Resolved:**
1. ✅ **Timeline connection:** Age-based stop-working input, connected to Current Age and Phase 1's timeline (Section 13.2)
2. ✅ **Distribution basis:** Fixed-dollar, inflation-adjusted withdrawals (Section 13.3)

3. ✅ **Future retirement modeling — resolved.** Since retirement is modeled as happening in the *future* (not necessarily continuing the exact historical year sequence used in Phase 1), Phase 3 doesn't hit a "historical data runs out" problem in the way originally framed. Instead, Phase 3 runs **two comparison scenarios**, both illustrative rather than tied to specific future calendar years:
   - **Scenario A — Standard/Average S&P 500 Rate:** withdrawals modeled against a smooth flat average rate (the same kind of arithmetic-mean rate used in Phase 1's "Average-Rate" track)
   - **Scenario B — Volatility-Drag Rate:** withdrawals modeled using the **realized sequence of returns from the most recent 30 years** (i.e., replaying that actual historical sequence forward as the assumed future pattern), which captures real-world volatility drag rather than assuming smooth annual growth

   This reuses the same "Actual vs. Average" comparison framework from Phase 1, just applied prospectively to retirement rather than retrospectively to accumulation. **Note for Claude Code:** "most recent 30 years" should be dynamically calculated as of the current date, not hardcoded, so the tool stays accurate as time passes.

4. ✅ **App structure — resolved.** Phase 3 is a **separate tab/screen** from Phase 1, not a single continuous page. Navigation flow:
   - **Tab 1: Accumulation** — Phase 1's existing input panel, chart, and table
   - **Tab 2: Distribution** — Phase 3's retirement withdrawal modeling
   - The Distribution tab's starting balance is **carried over automatically from wherever Phase 1's accumulation simulation ended** (i.e., `actual_balance[N]` and `average_balance[N]` from Tab 1 become the two starting balances for Tab 2's two scenarios) — the user shouldn't have to re-enter their ending balance manually
   - Fee and tax inputs: Phase 3 reuses Phase 1's fee input by default, but should allow override within the Distribution tab if the user wants to model a different (e.g., lower) fee in retirement. Tax treatment for Phase 3 remains a placeholder end-of-period-style haircut for now, consistent with Phase 1, unless/until a more detailed withdrawal-based tax model is scoped separately.

### 13.5 Output Additions for Phase 3

- Extension of the same results table format (Year, Withdrawal Amount, Return %, Ending Balance) for both tracks, continuing the row numbering from Phase 1
- Extension of the same growth chart, now showing the balance declining during retirement — critically, the **Actual (volatile) line and Average-Rate line will diverge in the *opposite* direction from Phase 1's chart**, since sequence-of-returns risk in retirement typically makes the actual/volatile line deplete *faster* than the smooth average-rate line, not slower
- New headline metric: **"Funds lasted X years"** or **"Funds fully depleted in [year]"** for each track
- New summary comparison: **"The real-world sequence of returns depleted your funds N years earlier than the average-rate projection suggested"** (or later, if that's what the data shows — should not assume the direction, just report it)

---

## 14. Phase 4 — Whole Life Distribution via Policy Loans (Requirements Draft)

**Status:** Requirements captured, not yet built. Mirrors Phase 3's distribution concept but applied to the Phase 2 whole life track, using policy loans instead of withdrawals.

**🚫 NOT IN SCOPE for the current build session, and not yet fully data-complete.** In addition to being deferred alongside Phase 3, this phase is specifically blocked on real policy data (direct vs. non-direct recognition status, actual loan interest rate, overloan protection rider status — see Section 14.5). Do not attempt to build this phase with placeholder/generic loan assumptions.

### 14.1 Concept

Instead of withdrawing from the S&P side, this phase models taking **policy loans** against the whole life cash value/face amount for retirement income — the standard "infinite banking" / cash-value-as-income-source approach. Key structural differences from Phase 3's withdrawal model:

- **Loans are not withdrawals** — the cash value itself is typically not directly reduced the same way; instead, the insurer lends against the policy (using cash value/face amount as collateral) and charges loan interest
- **Outstanding loan balance grows over time** (loan principal + accruing loan interest, if unpaid), and this outstanding balance is **deducted from the death benefit / face amount** if the policyholder dies with the loan outstanding
- **The cash value can continue to grow/compound even while a loan is outstanding** (this is the core mechanic behind "infinite banking" — the insurer credits dividends/growth on the full cash value even though a portion is borrowed against), though the specifics depend on the policy's loan provisions (direct recognition vs. non-direct recognition carriers)
- **No forced depletion in the same sense as Phase 3** — a policy loan strategy is typically managed to avoid over-borrowing (insurers have an "overloan protection" rider specifically because unpaid loans + interest can exceed cash value and cause a policy lapse, which is a taxable event)

### 14.2 New Inputs for Phase 4

| Field | Type | Notes |
|---|---|---|
| Annual Loan Amount / Distribution % | Dollar amount or % | How much is borrowed against the policy each year for income |
| Policy Loan Interest Rate | Percentage | Rate charged on outstanding loan balance (typically 5-8% per the researched ranges) |
| Direct Recognition vs. Non-Direct Recognition | Toggle | Affects whether the dividend rate credited on the loaned portion differs from the un-loaned portion — carrier-specific, needs to match the user's actual Penn Mutual policy provisions |

### 14.3 Calculation Logic — Needs Real Policy Mechanics

Unlike Phase 3 (straightforward withdrawal-and-deplete math), Phase 4's loan mechanics are carrier-specific and more complex — this section should **not be finalized with generic assumptions**. Before Claude Code builds this, we need:

- Confirmation of Penn Mutual's specific loan provisions (direct vs. non-direct recognition, current loan interest rate, whether the overloan protection rider applies to the user's policy)
- Whether the comparison should show the **death benefit eroding** over time as loans accrue (since that's the real tradeoff being made — income now vs. legacy/death benefit later), which would be a meaningful and honest addition to the comparison chart
- How this phase defines "success" or "failure" — since a WL loan strategy doesn't deplete in the same binary way Phase 3's withdrawal model does, what should the headline metric be? (Candidates: death benefit remaining at life expectancy, or the year the loan balance would exceed cash value absent intervention)

### 14.4 Output Additions for Phase 4

- Same chart/table format extended, but now showing **two lines**: cash value (continuing to grow) and **outstanding loan balance** (growing from accrued interest), so the user can see the gap between them — that gap is the "safe" zone before the policy is at risk of lapsing
- Comparison against Phase 3's S&P withdrawal track: same annual income need, two different funding mechanisms, side by side
- Headline comparison metric: **effective net legacy/death benefit remaining** at the end of the modeled period, alongside the income actually received — since WL loans preserve (a reduced) death benefit while S&P withdrawals simply deplete an account with no death benefit at all. This is an apples-to-oranges structural difference that should be presented honestly rather than collapsed into a single "which is better" number.
- **Caveats panel required** — reuses the same panel defined in Section 12.10, displayed on this screen as well. Caveat #3 (policy loan/lapse risk) is especially critical here since Phase 4 is exactly where that risk materializes in the simulation.

### 14.5 Data Needed Before Build

Same as Phase 2 — this phase cannot be built on generic assumptions and needs the user's actual Penn Mutual illustration, specifically the loan provisions section, current policy loan interest rate, and (if available) an in-force illustration showing projected loan scenarios.

---

## 15. Source Control & Deployment Architecture

**Pattern:** matches the user's existing personal projects (e.g., NJ Transit delay alert app) — GitHub for source control, Azure Static Web Apps for hosting, GitHub Actions for CI/CD.

### 15.1 GitHub Repository

- New public or private GitHub repo (user's choice) for this project — e.g., `investment-calculator` or `retroreturns`
- Standard `.gitignore` for a Vite + TypeScript project (node_modules, dist, .env, .env.local)
- `.env.example` committed (never the real `.env`) showing required variable names (e.g., `VITE_ALPHA_VANTAGE_KEY`) with placeholder values
- Main branch deploys to production; Claude Code should initialize with a clean commit history (not a single giant initial commit) if building iteratively, so the repo history is useful later

### 15.2 Azure Static Web Apps

- **Free tier** — matches the user's existing pattern (confirmed sufficient for this app: no auth needed, low bandwidth, single custom domain acceptable)
- Static Web Apps is the right fit here since this is a **fully client-side app** (per Section 2 — no backend, all computation in-browser, API calls direct from the browser to Alpha Vantage/Stooq) — no Azure Functions/API backend needed, unlike the user's Ramiya chat app which required a backend proxy to hide an API key. This app's only external API key (if using Alpha Vantage) is a free-tier key with no sensitive backend logic to protect, though it should still not be hardcoded/committed (see 15.4)

### 15.3 GitHub Actions CI/CD

- Claude Code should generate `.github/workflows/azure-static-web-apps.yml` for automatic deployment on every push to `main`
- Workflow should: install dependencies, run `npm run build`, deploy the `/dist` output to Azure Static Web Apps
- Uses the `AZURE_STATIC_WEB_APPS_API_TOKEN` repository secret (standard Azure Static Web Apps deployment token) — placeholder/documented in README, not generated by Claude Code (this is created in the Azure Portal after the Static Web App resource exists, then added to GitHub repo secrets by the user)
- If the user creates the Azure Static Web App resource through the Azure Portal's GitHub-connected setup flow (rather than manually), Azure may auto-generate this same workflow file directly in the repo — Claude Code should note this possibility in the README so the user doesn't end up with duplicate/conflicting workflow files

### 15.4 Environment Variables & Secrets

- Any API key (e.g., Alpha Vantage) goes in `.env` locally (gitignored) and as an Azure Static Web Apps **Application Setting** (Configuration → Environment Variables in the Azure Portal) for production
- Since this is a client-side-only app, any API key exposed via `VITE_*` environment variables **will be visible in the built frontend bundle** — this is an accepted tradeoff for a free-tier API key with generous rate limits (Alpha Vantage) but should be explicitly noted in the README so the user understands it's not a secret in the traditional sense. If this becomes a concern later, a backend proxy (Azure Function, matching the Ramiya app's pattern) could be added, but is out of scope for Phase 1/2.

### 15.5 README Deployment Section (extends Section 9)

In addition to Section 9's README requirements, include:
1. Step-by-step: create Azure Static Web App resource in the Azure Portal, connect to the GitHub repo
2. Where to find/copy the deployment token, and which GitHub repo secret name to paste it into
3. How to set any API key as an Azure Application Setting
4. Confirmation that pushing to `main` triggers automatic deployment via the GitHub Actions workflow
5. The resulting live URL pattern (`https://<app-name>.azurestaticapps.net`, or custom domain if configured)
