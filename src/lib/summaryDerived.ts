// Rearranges the Outstanding/Unallocated formulas position.ts already
// computes (Outstanding = Total Invoice − Allocated; Unallocated = Total
// Payment − Allocated) to recover the "Allocated" figure for display —
// FinancialPositionView needs it both in its Calculation Transparency
// popovers and its Payment/Invoice table TOTAL rows, and this is the one
// place it's computed so those two call sites can never drift apart.
// Pure arithmetic only; `total`/`remaining` must already come from
// `summary.*` (position.ts), never recomputed from breakdown rows here.
export function computeAllocatedAmount(total: number, remaining: number): number {
  return total - remaining;
}
