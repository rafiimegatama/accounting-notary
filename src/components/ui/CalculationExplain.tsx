"use client";

import { useEffect, useId, useRef, useState } from "react";

// On-demand "Bagaimana dihitung?" (Calculation Transparency) disclosure for
// the KPI tiles in FinancialPositionView. Deliberately a DIFFERENT
// affordance from FieldHelp (`src/components/ui/FieldHelp.tsx`, the "(?)"
// icon) — FieldHelp answers "what does this field mean," this answers "how
// was this specific number arrived at." Kept visually and structurally
// distinct on purpose (see FinancialPositionView.tsx SummaryStat), not
// merged into one tooltip.
//
// This mirrors FieldHelp's hover/focus/click/outside-click/Escape
// interaction logic (a second small self-contained implementation, not an
// extraction) — FieldHelp.tsx (v19, complete) is left untouched per this
// feature's constraints. The one deliberate behavioral difference: this
// popover's content is interactive (drill-down links), so unlike FieldHelp
// it does NOT close on the trigger button's `blur` — tabbing forward from
// the button into a link inside the popover must not immediately dismiss
// it. Close is instead outside-click/-touch, Escape, or the pointer leaving
// the whole wrapper (trigger + popover together).
export function CalculationExplain({
  title,
  triggerLabel = "Bagaimana dihitung?",
  ariaLabel,
  align = "left",
  children,
}: {
  title: string;
  triggerLabel?: string;
  ariaLabel: string;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div
      ref={wrapperRef}
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-describedby={popoverId}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onClick={(e) => {
          // Same guard as FieldHelp: this trigger sits inside a tile whose
          // top region is a navigation <a> (see SummaryStat) — never let a
          // tap here bubble into an unrelated click handler.
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="text-[11px] text-muted underline decoration-dotted underline-offset-2 transition-colors hover:text-text focus:outline-none focus-visible:text-text"
      >
        {triggerLabel}
      </button>
      <div
        id={popoverId}
        role="dialog"
        aria-modal="false"
        aria-label={title}
        className={`absolute top-full z-20 mt-1 w-[280px] max-w-[300px] rounded-control border border-border bg-white p-3 text-xs leading-relaxed text-text shadow-md ${
          align === "right" ? "right-0" : "left-0"
        } ${open ? "block" : "hidden"}`}
      >
        <div className="mb-1.5 font-medium text-text">{title}</div>
        {children}
      </div>
    </div>
  );
}

// Compact 2-3 row formula (minuend / subtrahend / result) — used for
// Outstanding, Unallocated, and Deposit Remaining. `rows` are the terms
// above the line; `resultValue` must always be the tile's own headline
// number (passed in by the caller from `props.summary.*`, never
// recomputed here) so the popover can never disagree with the tile.
export function FormulaRows({
  rows,
  resultLabel,
  resultValue,
}: {
  rows: { label: string; value: string; href?: string }[];
  resultLabel: string;
  resultValue: string;
}) {
  return (
    <dl className="space-y-1">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-3">
          <dt className="text-muted">{r.label}</dt>
          <dd className="font-mono">{r.href ? <a href={r.href} className="text-primary hover:underline">{r.value}</a> : r.value}</dd>
        </div>
      ))}
      <hr className="my-1 border-border" />
      <div className="flex items-center justify-between gap-3 font-semibold">
        <dt>{resultLabel}</dt>
        <dd className="font-mono">{resultValue}</dd>
      </div>
    </dl>
  );
}

// List-style breakdown (Total Cost/Invoice/Payment/Deposit Received/Deposit
// Used) — shows the contributing rows already rendered in the table below
// on this same page, capped so the popover never grows unbounded. Always
// links back to that table's anchor so the full list stays one click away.
export function ListBreakdown({
  rows,
  emptyLabel,
  moreHref,
  cap = 6,
}: {
  rows: { key: string; label: string; value: string; href?: string }[];
  emptyLabel: string;
  moreHref: string;
  cap?: number;
}) {
  if (rows.length === 0) {
    return <p className="text-muted">{emptyLabel}</p>;
  }
  const shown = rows.slice(0, cap);
  const remaining = rows.length - shown.length;
  return (
    <div>
      <ul className="space-y-1">
        {shown.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-3">
            <span className="truncate text-muted">{r.label}</span>
            <span className="shrink-0 font-mono">
              {r.href ? <a href={r.href} className="text-primary hover:underline">{r.value}</a> : r.value}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-muted">
        {remaining > 0 && `dan ${remaining} lainnya — `}
        <a href={moreHref} className="text-primary hover:underline">
          lihat tabel lengkap di bawah
        </a>
      </p>
    </div>
  );
}
