"use client";

import { useEffect, useId, useRef, useState } from "react";

// Lightweight, accessible contextual-help "(?)" affordance. Deliberately NOT
// built on this codebase's modal shape (`fixed inset-0 z-50` overlay + click
// backdrop, see AddCostDetailModal/NewTransactionModal/etc.) — that's a
// full-screen modal, the wrong tool for an inline tooltip. This is a small
// absolutely-positioned popover anchored to the trigger button itself, no
// backdrop, no scroll lock, no focus trap.
//
// Open state is driven by hover (desktop), focus (keyboard Tab), and click
// (touch — iOS Safari famously does not reliably focus a tapped <button>,
// so click must open it independently of focus). Dismiss is driven by
// Escape, blur, mouse-leave, and a document-level outside pointerdown
// listener (covers touch taps elsewhere, which don't fire `blur` on this
// button on every platform). See Typeahead.tsx for this codebase's existing
// blur-timer/click-outside precedent — same spirit, adapted for a
// non-interactive popover (no options list to click into).
export function FieldHelp({
  content,
  ariaLabel,
  align = "right",
}: {
  content: string;
  ariaLabel: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const wrapperRef = useRef<HTMLSpanElement>(null);

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
    <span ref={wrapperRef} className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-describedby={popoverId}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          // Always stop propagation: this trigger is sometimes placed inside
          // a clickable summary tile (FinancialPositionView's SummaryStat is
          // a sibling <a>, not a parent here, but callers elsewhere may
          // still wrap it) — never let a "?" tap perform an unrelated
          // navigation or submit action.
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold leading-none text-muted transition-colors hover:bg-slate-100 hover:text-text focus:outline-none focus-visible:bg-slate-100 focus-visible:text-text focus-visible:ring-1 focus-visible:ring-primary/40"
      >
        ?
      </button>
      <span
        id={popoverId}
        role="tooltip"
        className={`absolute top-full z-20 mt-1 w-64 max-w-[280px] rounded-control border border-border bg-white p-2 text-xs font-normal leading-relaxed text-text shadow-md ${
          align === "right" ? "right-0" : "left-0"
        } ${open ? "block" : "hidden"}`}
      >
        {content}
      </span>
    </span>
  );
}
