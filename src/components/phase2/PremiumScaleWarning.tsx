export function PremiumScaleWarning() {
  return (
    <div
      role="alert"
      className="rounded-md border border-amber-600/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-300"
    >
      <span className="font-semibold">⚠️ Approximation only — not a real quote.</span> Whole life
      pricing does not scale linearly with premium; fixed policy costs and mortality charges make
      smaller premiums proportionally more expensive, typically resulting in a lower real-world
      rate of return than shown here. This scaled projection assumes the same IRR as the original
      $20,000/year illustration, which is unlikely to hold exactly at a different funding level.
      For an accurate number, request a real illustration at your target premium from a licensed
      agent.
    </div>
  );
}
