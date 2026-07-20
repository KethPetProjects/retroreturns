# Investment Return Calculator — Requirements Document
> For Claude Code / Vibe Coding Session
> **Status:** Phases 1–3 built and deployed (Accumulation, Whole Life comparison, Distribution). Phase 4 (whole life policy loans) reserved, blocked on real policy data.

---

## 1. Project Overview

Build a **React + Vite web app** that shows what a 401k-style S&P 500 index fund investment would *actually* have returned historically — year by year, using real sequenced annual returns — compared side-by-side against what a financial advisor's flat "average return" projection would show for the exact same contributions. The core purpose is to expose **volatility drag / sequence-of-returns risk**: two investments with the same average return can end at very different dollar amounts depending on the order the returns happened in.

**Design philosophy (applies to all phases, especially 2 and 4):** This tool is built to educate, not to steer a client toward any particular product. Both the S&P and whole life sides carry real, distinct risks and tradeoffs, and both should be presented with equal seriousness. The goal is for a client (or the user, as a licensed agent showing this to clients) to walk away understanding the real mechanics and real caveats of each option — "another tool in the toolbox," not a sales instrument for either side.

**Comparable product:** Truth Concepts financial calculators — but clean, web-native, and not Excel-based.

**Deployment target:** GitHub (source control) → Azure Static Web Apps (free tier hosting), via GitHub Actions CI/CD — see Section 15 for full deployment architecture, matching the user's existing project pattern.

**Phasing:**
- **Phase 1 (built):** Accumulation-phase calculator — real sequenced returns vs. flat average returns
- **Phase 2 (built):** Whole life insurance high cash value comparison module, benchmarked against a real Penn Mutual illustration
- **Phase 3 (built):** Distribution phase — Monte Carlo retirement withdrawal modeling, see Section 13
- **Phase 4 (reserved):** Whole life distribution via policy loans, see Section 14 — blocked on real policy data

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
| Annual Contribution | Dollar amount | $10,000 | Added at the **start** of each year (earns that year's return) |
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

- Whole life insurance comparison (Phase 2 — now built, see Section 12)
- Distribution phase / withdrawal modeling / fund longevity (Phase 3 — now built, see Section 13)
- Auto-generated insight text (explicitly deferred)
- User accounts / saved scenarios
- Export to PDF/CSV (candidate for later phase)
- Multiple side-by-side scenario comparison
- Proper lot-level/withdrawal-based tax treatment (Phase 1 uses a simplified end-of-period tax haircut only; Phase 3 has its own real withdrawal-based tax model — see Section 13.5)

**Explicitly considered and rejected during Phase 3 build:**
- **Stock/bond glide path allocation** — started, then reverted per user decision before any code landed. Portfolio stays 100% S&P 500 in Distribution; risk mitigation instead comes from the cash bucket strategy (Section 13.3), which was deliberately designed to generalize into Phase 4's growth-asset-plus-buffer-asset pattern.
- **Smooth "Average-Rate" distribution scenario** — built, then removed. It never failed and added no signal beyond what the Monte Carlo success rate/outcome distribution already shows.

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
4. **Tax treatment (Phase 1):** Simple end-of-period haircut on final balance only. Phase 3 has its own separate, real withdrawal-based tax model (combined federal + state flat rate above a standard deduction, pooling all income sources) — see Section 13.5.

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

## 13. Phase 3 — Distribution Phase (Built)

**Status:** Built and deployed. Consumes Phase 1's accumulation engine — the Distribution tab picks up wherever accumulation ends (or at any point during it, see 13.2) and models the drawdown via Monte Carlo simulation, not a two-scenario comparison as originally drafted.

### 13.1 Concept

Once contributions stop, the balance is drawn down at a fixed, inflation-adjusted, tax-grossed-up net spending target every year. The question this phase answers: **"How long will my money actually last, given real market volatility — not just an assumed flat average return?"**

Unlike the original draft's two-line "Actual vs. Average-Rate" comparison (which mirrored Phase 1's chart), Phase 3 ships as a **Monte Carlo simulation**: hundreds to thousands of independent trials, each bootstrap-resampling annual returns *with replacement* from the real historical S&P 500 total-return pool (1928–2025), rather than replaying one fixed historical sequence or a smooth average rate. This captures a full distribution of possible outcomes instead of a single arbitrary path. A flat "Average-Rate" scenario was built and then explicitly removed — it never failed and added no signal beyond what the Monte Carlo success rate and outcome distribution already show.

### 13.2 Inputs

| Field | Type | Default | Notes |
|---|---|---|---|
| Current Age | Number | 35 | User's age today |
| Stop-Working Age | Number | 65 | The age at which contributions stop and withdrawals begin. Can fall **anywhere during Phase 1's accumulation window**, not just at its end — retiring 27 years into a 30-year accumulation run uses year 27's actual balance, not year 30's |
| Plan Through Age | Number | 95 | Horizon the simulation runs to if funds don't deplete first |
| Current Balance ($, today) | Dollar amount | $0 | Optional, highest priority. See 13.11 — projects this forward to Stop-Working Age itself, correlated with the withdrawal phase, rather than requiring a pre-computed retirement-age figure |
| Pre-Retirement Annual Contribution ($) | Dollar amount | $10,000 | Flat nominal $/year until Stop-Working Age (does not inflate). Only relevant when Current Balance > 0 |
| Starting Balance Override ($) | Dollar amount | $0 | Optional, second priority (used only if Current Balance is $0). Replaces the balance otherwise carried over from the Accumulation tab with a manually entered figure, treated as the balance AT Stop-Working Age. See note below the table |
| Annual Expense ($, net) | Dollar amount | $80,000 | Year-1 **take-home** spend target — each year's gross portfolio withdrawal is solved so that, after tax, the retiree nets this amount (adjusted for inflation). Replaces the original draft's "Distribution Rate (%) of balance" input |
| Inflation Adjustment (%) | Percentage | 3% | Grows the net expense target, standard deduction, and other income streams each year |
| Standard Deduction ($) | Dollar amount | $15,000 | Year-1 dollars, grows with inflation; the threshold above which the combined tax rate applies |
| Federal Tax Rate (%) | Percentage | 15% | Flat rate, not real progressive brackets — a deliberate simplification |
| State Tax Rate (%) | Percentage | 5% | Combined with Federal Tax Rate into one flat rate — a simplification of real state tax rules (own brackets/deductions), not a full state tax model |
| Management Fee (%) | Percentage | 0.03% | Deducted from the stock portion's return every year |
| Cash Bucket (years of expenses) | Number | 2 | See 13.3. 0 disables the bucket entirely |
| Cash Bucket Interest Rate (%) | Percentage | 2.5% | Money-market rate on the cash bucket — fixed, not tied to historical volatility |
| Social Security Annual Benefit ($) | Dollar amount | $0 | Today's-dollars annual benefit, starting at Social Security Claiming Age and inflating from there |
| Social Security Claiming Age | Number | 67 | **Independent of Stop-Working Age** — many people delay claiming past when they stop working |
| Social Security Taxable Portion (%) | Percentage | 85% | Simplified flat stand-in for the real up-to-85%-taxable sliding-scale IRS rule |
| Other Annual Income ($) | Dollar amount | $0 | Rents/dividends outside the main account, today's dollars, starting at Stop-Working Age and inflating |
| Reverse Mortgage Annual Income ($) | Dollar amount | $0 | See 13.6 — simplified, tax-free, held flat in nominal dollars (does NOT inflate, unlike Social Security/Other Income), placeholder pending Phase 4-style dedicated treatment |
| Long-Term Care Annual Cost ($) | Dollar amount | $0 | See 13.7 — extra spending (not income) added on top of Annual Expense starting at Long-Term Care Start Age. 0 disables it |
| Long-Term Care Start Age | Number | 80 | Independent of Stop-Working Age/Plan Through Age. Runs through the rest of the plan once started (no separate end age) |
| Long-Term Care Inflation Rate (%) | Percentage | 5% | Own inflation rate for LTC costs, separate from and typically higher than the general Inflation Adjustment rate |
| Historical Data Start Year | Number (year) | 1928 (dataset's earliest) | See 13.4. Restricts the Monte Carlo return pool to real years on/after this one — e.g. 1960 excludes the volatile 1928–1958 era. Every sampled value stays real, unaltered data; this only changes which years are eligible |
| *(no input — always on)* | — | — | **Required Minimum Distributions** (see 13.9): start age (73/75) derived automatically from Current Age via SECURE 2.0's birth-year rule, no toggle to disable |

All dollar income fields (Social Security, Other Income, Reverse Mortgage) and Long-Term Care Annual Cost are **annual**, matching Annual Expense's convention.

**Three ways to set the starting balance, in priority order:** Accumulation models one clean, continuous contribution stream from a single chosen Starting Year — real savings histories essentially never look like that (people start saving late, pause to buy a house, change jobs/contribution amounts, etc.). Rather than trying to model every possible real-world contribution pattern, Distribution offers three ways to arrive at a starting balance:
1. **Current Balance + Pre-Retirement Annual Contribution** (highest priority) — see 13.11. Projects forward from what the user actually has today, correlated with the withdrawal phase.
2. **Starting Balance Override** (used only if Current Balance is $0) — a manually entered figure, for users who already have a retirement-age estimate from elsewhere.
3. **Accumulation tab carry-over** (the fallback) — today's original default behavior.

Purely an input-selection choice at the App/`runDistributionComparison` level — `runWithdrawalTrack` and everything below it has no awareness of which of the three determined its starting balance.

**Validation rule:** `starting_year + (stop_working_age - current_age)` must fall within (or at most one year past) Phase 1's simulated accumulation window, so the two phases stay temporally consistent. Retiring before accumulation starts, or long enough after it ends that there's an unmodeled growth gap, is rejected with a clear message — **unless Current Balance or Starting Balance Override is in use**, in which case this check is skipped entirely. The whole point of the check is keeping Accumulation's dollar output temporally consistent with Stop-Working Age; both alternatives replace that dollar output, so the constraint has nothing left to protect, and Stop-Working Age can be set freely (e.g. 62 instead of the Accumulation window's implied age).

### 13.3 Withdrawal Mechanics: Fixed-Dollar, Tax-Grossed-Up, Cash Bucket

**Basis (confirmed, unchanged from the original draft's intent):** Withdrawals target a fixed, inflation-adjusted **net** dollar amount, not a % of the fluctuating balance — this lets the simulation reach a clean "$0 balance" depletion point and matches how real-world withdrawal-rate research (e.g., the "4% rule") is modeled.

**Cash bucket strategy (added during build, not in the original draft):** An optional number of years of upcoming portfolio withdrawals can be held in a separate low-volatility cash account (its own interest rate) and drawn down first, so ordinary spending doesn't force a stock sale during a downturn. The bucket is topped back up from stocks **only in years the stock return was positive** — refilling after a down year would mean selling stocks at a loss, defeating the point of the buffer. `cashBucketYears = 0` disables it entirely (a plain single-balance withdrawal engine).

This was deliberately built as a reusable "growth asset + buffer asset" pattern — a stock/bond glide path was explored first and explicitly rejected in favor of this, specifically so the same mechanic can later apply to Phase 4 (S&P 500 + cash now, whole life cash value as the buffer later).

**Verified finding:** the cash bucket modestly improves the worst-decile (bad-case) outcome by delaying forced stock sales during downturns, but slightly *reduces* the overall average success rate (a small, consistent cash-drag opportunity cost) — matching published bucket-strategy research. It's a tail-risk tool, not a free win.

### 13.4 Volatility Modeling: Monte Carlo, Not a Two-Scenario Comparison

Each of `monteCarloTrials` (default 1,000) independent trials draws its own random sequence of annual returns, sampled **with replacement** from the real historical S&P 500 total-return pool (`HISTORICAL_TOTAL_RETURN_POOL`, 1928–2025, unaltered real data — verified, not inflated). This replaces the original draft's two fixed scenarios (a smooth average rate and a single replayed 30-year historical sequence).

**Block bootstrap (fixed a real methodological limitation):** returns were originally drawn i.i.d. (one independent single-year pick at a time), which ignores real bull/bear market clustering entirely. Verified against this project's own data: real 30-year rolling CAGR windows in actual history never exceeded ~13.6% (min ~8.0%, median ~10.8%, across 69 overlapping windows in the 98-year dataset), but independent single-year resampling produced trials up to ~24% CAGR over 30 years — growth that's never actually happened. Fixed via `sampleBlockBootstrapReturns`: instead of picking each year independently, it repeatedly picks a random contiguous slice of `blockLengthYears` (default **5**) REAL consecutive historical years (in their real order) and concatenates blocks until the needed length is reached (final block truncated as needed). This preserves real momentum/clustering *within* each block while still varying *which* blocks (and in what order) get picked across trials — narrowed the same 30-year Monte Carlo max CAGR down to ~19-20% in testing, a large improvement though not a perfect match to the tighter real-history bound (500 trials isn't enough to rule out ever exceeding it, and blocks from different eras can still combine in ways no single real 30-year window did). `blockLengthYears` is an internal engine parameter, not user-facing — 5 years was chosen as a standard default from retirement-planning Monte Carlo research, balancing realistic cycle-length preservation against having enough distinct blocks (94 possible 5-year starting points in 98 years) for real trial-to-trial variety.

**Historical Data Start Year (considered and explicitly rejected: capping individual returns):** the user's first instinct on seeing single-year returns above 40% in the table was to ask for a hard cap (e.g. max 30%). Checked the data first: those aren't simulation errors — 5 real years (1928, 1933, 1935, 1954, 1958) genuinely exceeded 40% total return, concentrated in the volatile 1928–1958 era. Capping them would mean silently altering real historical data to make it feel more comfortable — directly contradicting the app's own stated premise ("what your S&P 500 investment actually returned — not what the average implies"), and would bias the distribution asymmetrically unless matching real crash years (1931: −43%, 1937: −35%) were also capped, which would make the simulation *less* historically accurate, not more. Built `historicalDataStartYear` instead (via `historicalReturnPoolFromYear`): restricts WHICH real years are eligible for sampling (e.g. 1960 onward) rather than altering any value. Validated to require at least 10 years of data remain. `DistributionComparisonResult` exposes the actual effective range used (`historicalDataStartYear`/`historicalDataEndYear`) so the Summary can state plainly which years the simulation is actually drawing from.

### 13.5 Tax Model — Real Withdrawal-Based Logic (Not a Placeholder)

Unlike Phase 1's simple end-of-period haircut, Phase 3 solves for the exact gross portfolio withdrawal needed each year so that, after tax, the retiree nets the target spend — closed-form (not iterative).

**Combined multi-source pooling:** portfolio withdrawal + the taxable portion of Social Security + Other Income are pooled into **one** combined taxable-income figure, taxed at the combined (Federal + State) flat rate above **one** standard deduction — mirroring how a real household files one unified tax return rather than taxing each income source separately. Reverse Mortgage income is excluded from taxable income entirely (real reverse mortgage proceeds are loan proceeds, not income), but still counts as spendable cash that reduces how much needs to come from the portfolio.

```
netFromPortfolio = netExpenseTarget - fixedIncome   // fixedIncome = SS + otherIncome + reverseMortgage
grossWithdrawal  = solve G such that:
  G - max(0, (G + taxableFixedIncome) - standardDeduction) * combinedTaxRate = netFromPortfolio
  // taxableFixedIncome = SS * socialSecurityTaxablePortionPct + otherIncome
```

Social Security starts at its own **Claiming Age** (independent of Stop-Working Age) and inflates from that year forward, not from year 1 of retirement — so a not-yet-claimed benefit doesn't look like it already grew with inflation while waiting.

### 13.6 Reverse Mortgage — Simplified Placeholder

Modeled as a flat, tax-free annual income stream only, held **flat in nominal dollars for the rest of the horizon — it does NOT inflate**, unlike Social Security/Other Income. This matches how a real reverse mortgage "tenure payment" actually works (a fixed nominal amount for life, no cost-of-living adjustment). **Deliberately excludes** home value, loan balance, and interest accrual — a full model would need those, but this is a placeholder pending the same dedicated treatment planned for Phase 4's whole life policy loans (Section 14), not a finished reverse-mortgage feature.

### 13.7 Long-Term Care — Flat Extra Expense

Models rising care costs (active adult living / assisted living / skilled nursing) as **extra spending**, not income — added on top of Annual Expense starting at Long-Term Care Start Age (default 80), with its **own inflation rate** (default 5%, higher than the general Inflation Adjustment rate, since real LTC/care costs have historically outpaced general inflation). Runs through the rest of the plan once started (no separate end age — considered and explicitly rejected as an extra input in favor of the simpler "runs to Plan Through Age" default). `longTermCareAnnualCost = 0` disables it entirely.

Because this adds to the net spend target rather than offsetting it, it flows through the *existing* tax-grossup logic (13.5) automatically — no new tax-treatment code was needed, unlike the income sources.

**Deliberate simplification, flagged as a known limitation:** this treats LTC cost as something everyone incurs steadily from the start age onward. Real LTC risk is lumpy — roughly 70% of 65-year-olds will need *some* care, but many need none, and a smaller group needs many years of expensive skilled nursing care. A flat "add $X/year from age Y" model doesn't capture that variance (won't show a $0-LTC-cost outcome, and may understate the worst-case tail of extended skilled care). Considered and rejected for now: a probabilistic per-trial model (each Monte Carlo trial independently draws whether/when a care event starts) — more realistic but a meaningfully bigger lift, layering a second random process on top of the market-return randomness already being modeled. Also considered and rejected: tiered cost stages (independent → assisted → skilled) — adds transition-timing complexity without a clear payoff at this stage. No account-type split either — LTC (like everything else in Distribution) assumes one undifferentiated portfolio.

### 13.8 Outputs

- **Monte Carlo Success Rate:** % of trials that survived the full horizon without depleting
- **Median Outcome:** the depletion year of the trial ranked at the 50th percentile across ALL trials (survivors included, ranked as better than any failure) — the exact same trial the chart/table show, so they can never disagree. Shows "Lasted through age X" whenever that trial is itself a survivor (i.e. success rate ≥ 50%)
- **Worst-Decile Outcome:** same ranking, at the 10th-percentile position — a bad-case reference point, not the single worst trial. Null (shown as "fewer than 10% of trials depleted") whenever that position is also a survivor
- **Chart:** the single trial ranked at the 50th percentile, plotted as Total / S&P 500 Portion (stock) / Cash Bucket lines, anchored at the true pre-withdrawal starting balance (a "year 0" point) so the line doesn't visibly jump on recompute
- **Year-by-Year table:** full breakdown for that same trial — Year, Age, Beginning Balance, S&P Return, Contribution, Gross Withdrawal, RMD?, Social Security, Other Income, Reverse Mortgage, LTC Cost, Tax Owed, Stock Balance, Cash Balance, Refilled?, Ending Balance. When Current Balance (lifecycle mode, 13.11) is active, the SAME median trial's pre-retirement accumulation years are prepended above a "Retirement Begins" divider row, with continuous Year numbering across both phases — retirement-only columns show "—" for those years, and Contribution shows "—" for retirement years

### 13.9 Required Minimum Distributions (RMD)

**Always modeled — no toggle, no new user-facing input.** Assumes the whole modeled portfolio is a tax-deferred account (matching the tool's existing "401(k)-style" framing throughout), so RMDs apply universally rather than being conditioned on an account-type split the tool doesn't otherwise track.

**Start age (SECURE 2.0):** 73 for those born 1951–1959, 75 for those born 1960 or later. Derived automatically from Current Age and today's calendar date — no separate input. `rmdStartAgeForBirthYear(birthYear)` implements the split; `currentCalendarYear` is an overridable parameter (defaults to the real clock) purely so the birth-year math stays deterministic in tests.

**Mechanic:** each year from the start age onward, the required amount is `this year's beginning-of-year balance ÷ IRS Uniform Lifetime Table divisor for that attained age` (`rmdDivisorForAge`, full published table hardcoded, effective 2022–2026). If that exceeds what the expense/LTC plan alone would have withdrawn that year, the withdrawal is forced up to the RMD amount instead — fully taxable, same as any other withdrawal. Unlike every other Distribution input, RMD depends on the simulated balance path (which isn't known until the Monte Carlo trial actually runs), so it's evaluated fresh inside the per-trial simulation loop rather than precomputed alongside the other income/expense streams.

The divisor shrinks as age increases (26.5 at 73 → 12.2 at 90 → 2.0 at 120+), so the required withdrawal percentage climbs from roughly 3.8% to well over 8% in later years — this is exactly the dynamic that was producing unrealistically large surviving balances before RMDs were modeled: a strong-market trial could keep compounding indefinitely with only expense-driven withdrawals, which isn't how a real tax-deferred account works past 73/75.

**Deliberately out of scope:** the excess amount forced out beyond what's needed to cover spending isn't tracked further (reinvested elsewhere, held as cash, etc.) — it simply leaves the modeled portfolio, which is the conservative and honest choice for a tool answering "how long will *this* portfolio last." No account-type split (Traditional/Roth/taxable) and no toggle to disable RMDs — both considered and rejected as unnecessary complexity for the current scope.

### 13.11 Pre-Retirement Lifecycle Projection (Current Balance)

**Motivation:** even Starting Balance Override requires the user to already know (or separately estimate) their balance AT retirement — which most people don't. What people actually know is what they have saved *today*. This section projects that forward automatically instead of requiring the user to have already done the math.

**Design (confirmed over a simpler alternative):** each Monte Carlo trial draws ONE continuous sequence of real historical annual returns spanning BOTH the pre-retirement years (Current Age → Stop-Working Age) and the withdrawal years (Stop-Working Age → Plan Through Age). The first segment grows Current Balance with Pre-Retirement Annual Contribution (flat nominal, contribution-then-return-then-fee each year — identical convention to Phase 1's accumulation engine) into that trial's own balance at retirement; the second segment hands that balance to the existing withdrawal engine (`runWithdrawalTrack`) for the rest of the same trial's draw.

This deliberately correlates pre- and post-retirement market conditions within a trial — a rough decade right before retirement also shapes what that same trial's withdrawal phase looks like — rather than reducing "balance at retirement" to a single fixed, uncertainty-free number. A simpler alternative (run a separate accumulation projection to get one typical/median balance, then feed that single number into the existing withdrawal Monte Carlo, exactly like Starting Balance Override) was considered and rejected: it's less code, but discards the correlation in exactly the scenario that matters most — a bad market sequence right before retirement isn't specially reflected in what happens after.

**Implementation shape:** `runMonteCarloDistribution` gained `preRetirementYears` / `preRetirementStartingBalance` / `preRetirementAnnualContribution` (all optional, default disables — 0 pre-retirement years means `startingBalance` is used directly, exactly as before, so this is fully backward compatible). `runDistributionComparison` derives `preRetirementYears = Stop-Working Age − Current Age` and activates this whenever `currentBalance > 0`, at which point it ignores whatever `startingBalanceActual` was passed in — that value only matters as the fallback when lifecycle mode is off (13.2). The median trial's pre-retirement year-by-year detail is exposed separately via `medianTrialPreRetirementRows` (a much simpler shape than `WithdrawalYearResult` — just beginning balance, contribution, return, ending balance — since none of the withdrawal/tax/income-stream mechanics apply pre-retirement) and rendered above the existing table, so the two phases can be visually distinguished; `medianTrialRows` itself still covers only the withdrawal horizon, unchanged.

**Side effect worth noting:** the "Starting Balance" summary metric, when lifecycle mode is active, now reflects that specific trial's own randomly-grown balance rather than a fixed number — it visibly varies as inputs/seed change, which is more honest than presenting a single deterministic figure.

**Bugfix caught during this build:** `useDistribution`'s debounce effect dependency array never listed `currentBalance`, `preRetirementAnnualContribution`, or `startingBalanceOverride` directly. Starting Balance Override happened to still work because its effect flows entirely through `startingBalanceActual` (which IS in the dependency list) — but lifecycle mode is resolved entirely inside `runDistributionComparison` and never touches `startingBalanceActual` at all, so changing Current Balance silently had no effect until this was fixed by adding all three fields explicitly to the dependency array.

### 13.12 Resolved Decisions Log

1. ✅ Distribution basis: fixed-dollar, inflation-adjusted, tax-grossed-up net spend target (13.3), not a %-of-balance rate
2. ✅ Volatility modeling: Monte Carlo bootstrap over the real historical return pool (13.4), not a smooth Average-Rate scenario or a single replayed historical sequence — both considered, and the Average-Rate scenario was built then removed as low-value
3. ✅ Portfolio allocation stays 100% S&P 500 in Distribution — a stock/bond glide path was explored and reverted before landing; risk mitigation instead comes from the cash bucket (13.3)
4. ✅ Starting balance carries over from Phase 1's **pre-tax** `actualBalance` at whichever accumulation year corresponds to Stop-Working Age (not always the final year), since Phase 3 applies its own withdrawal-based tax treatment year by year — starting from an already-taxed lump sum would double-tax the money
5. ✅ Tax model: combined Federal + State flat rate, pooled across all taxable income sources above one standard deduction (13.5) — not the placeholder end-of-period haircut Phase 1 uses
6. ✅ Median/Worst-Decile Outcome bugfix: originally computed as percentiles of the failed-trials-only subset, independent of the trial actually shown in the table/chart — meant the Summary could report "Depleted at age X" while the table's representative trial visibly survived the full horizon whenever success rate wasn't ~50%. Fixed to read both stats directly off the same full-population trial ranking used for the chart/table (13.8)
7. ✅ Reverse Mortgage bugfix: was inflating year over year like Social Security/Other Income; corrected to hold flat in nominal dollars, matching how a real reverse mortgage tenure payment works (13.6)
8. ✅ Long-Term Care: flat extra expense with its own (higher) inflation rate, runs to Plan Through Age once started — deliberately simpler than a probabilistic or tiered-care model (13.7)
9. ✅ Required Minimum Distributions: always modeled (no toggle), start age derived from Current Age via SECURE 2.0's birth-year rule, forced amount from the real IRS Uniform Lifetime Table (13.9)
10. ✅ Starting Balance Override: optional manual entry of the balance at Stop-Working Age, bypassing Accumulation's carry-over — added because Accumulation's single-contribution-stream model doesn't match most real savings histories (13.2). When in use, the Stop-Working-Age-vs-Accumulation-window validation is also skipped, since that check exists solely to protect the now-bypassed dollar figure — Stop-Working Age can then be set freely (e.g. 62) regardless of the Accumulation tab's Starting Year/Number of Years
11. ✅ Pre-Retirement Lifecycle Projection: Current Balance + Pre-Retirement Annual Contribution, projected forward using ONE continuous per-trial return sequence spanning both accumulation and withdrawal years — correlates pre- and post-retirement market conditions, chosen over a simpler independent-projection alternative that would've discarded that correlation (13.11). Takes priority over both Starting Balance Override and Accumulation's carry-over, and also bypasses the accumulation-window validation
12. ✅ Year-by-Year table shows the pre-retirement accumulation years too, prepended above a "Retirement Begins" divider with continuous Year numbering, so the whole lifecycle (today → retirement → depletion/survival) reads as one continuum (13.8, 13.11) — caught and fixed a real bug in the process: `useDistribution`'s debounce dependencies were missing `currentBalance`/`preRetirementAnnualContribution`/`startingBalanceOverride`, so lifecycle mode silently never activated from the UI until fixed
13. ✅ Block bootstrap (5-year blocks) replaced independent single-year resampling for real — item 2's original i.i.d. choice was revisited once actual simulated output was checked against real historical 30-year windows and found to reach CAGRs (~24%) that have never happened; verified this fix narrows that down to ~19-20% in testing (13.4)
14. ✅ Historical Data Start Year: restricts which real years feed the simulation instead of capping/altering individual return values — capping was explicitly requested, checked against the data, and rejected as historically dishonest and asymmetric; year-range restriction achieves the same "less extreme" goal without touching any real value (13.4)

---

## 14. Phase 4 — Whole Life Distribution via Policy Loans (Requirements Draft)

**Status:** Requirements captured, not yet built. Mirrors Phase 3's distribution concept but applied to the Phase 2 whole life track, using policy loans instead of withdrawals.

**Precedent already in place:** Phase 3's cash bucket strategy (Section 13.3) was deliberately designed as a reusable "growth asset + buffer asset" pattern — S&P 500 as the growth asset, a cash account as the buffer, drawn first and refilled only in up years. Phase 4 is expected to reuse this same shape with whole life cash value standing in for the cash buffer, once real policy loan data is available.

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
