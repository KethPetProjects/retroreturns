const CAVEATS: { title: string; body: string }[] = [
  {
    title: 'Early death benefit value',
    body: 'In year 1, the guaranteed death benefit is already $402,389 against only $15,493 of cash value — the S&P side has no equivalent protection at any point. A client who dies early is not comparably situated between the two products; this tool only measures accumulation value, not protection value.',
  },
  {
    title: 'Dividend scale is not guaranteed',
    body: 'The non-guaranteed cash value and IRR (roughly 4.8–5.0% in this illustration) depend on the insurer continuing its current dividend scale. Dividend scales have been reduced industry-wide before, during sustained low-interest-rate environments. The guaranteed track (roughly 1.3–1.8% IRR) is the contractual floor if that happened.',
  },
  {
    title: 'Policy loan risk (relevant to future distribution-phase modeling)',
    body: 'Over-borrowing against a policy can cause it to lapse if the loan balance plus accrued interest exceeds cash value. A lapse with an outstanding loan can trigger a large, immediate taxable event on the gain — a materially different risk profile than simply running out of money in a brokerage account.',
  },
  {
    title: 'Behavioral risk asymmetry',
    body: "The S&P side's modeled numbers assume the investor never deviates from the plan — no panic-selling in a crash, no stopping contributions. Real investor behavior often underperforms the market itself for this reason. Whole life cash value is contractually guaranteed not to lose value from market movement, which removes this behavioral risk — though it introduces the dividend-scale and loan risks noted above instead.",
  },
  {
    title: 'Tax treatment differs structurally, not just numerically',
    body: "S&P withdrawals are taxed as capital gains (taxable account) or ordinary income (401k/IRA); whole life loans are typically received tax-free if the policy remains in force. This tool models both, but a client's actual tax situation should be reviewed with a qualified tax advisor before relying on either projection.",
  },
  {
    title: 'This tool is illustrative, not a guarantee of future results for either product',
    body: 'Historical S&P sequences are real market history, not a prediction. Whole life dividend scales are current company projections, not guarantees (see above).',
  },
];

/**
 * Required, always-visible on the Phase 2 screen (Section 12.10) — this tool
 * is explicitly designed to educate, not to steer a client toward either
 * product, so this panel must never be collapsed, buried in a footnote, or
 * de-emphasized relative to the comparison numbers above it.
 */
export function CaveatsPanel() {
  return (
    <section className="card border-amber-700/40 p-4 sm:p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-amber-400">
        Read Before Relying On This Comparison
      </h2>
      <p className="mb-4 text-xs text-slate-400">
        This tool is another tool in the toolbox — not a recommendation for either product. Both
        the S&amp;P and whole life sides carry real, distinct risks.
      </p>
      <ol className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {CAVEATS.map((c, i) => (
          <li key={c.title} className="text-sm">
            <p className="font-semibold text-slate-200">
              {i + 1}. {c.title}
            </p>
            <p className="mt-1 text-slate-400">{c.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
