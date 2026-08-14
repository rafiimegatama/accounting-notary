"use client";

import { useEffect, useRef, useState } from "react";

export interface TypeaheadOption {
  value: string;
  label: string;
}

// Deterministic, keyboard-driven suggestion UI — NOT AI, NOT fuzzy/semantic
// matching, NOT automatic classification or auto-claim (CLAUDE.md
// constraint 3). This component only owns the input/keyboard/selection
// contract; the caller decides what `options` to show (a locally filtered
// static list, or a debounced network search result) and whether free
// text is still allowed on submit — see docs/ROADMAP.md "predefined value
// autocomplete."
//
// Keyboard contract: ArrowUp/Down moves the highlighted option; Enter
// commits the highlighted option; Tab commits it too but does NOT
// preventDefault, so focus still advances to the next field ("Tab to
// accept" from the P0 spec); Escape dismisses the list without touching
// the typed text (free text always remains possible).
// Recent-selection query threshold: both call sites that pass
// `recentOptions` (NewTransactionModal.tsx / LinkDrawer.tsx) debounce their
// own network search starting at 2 typed characters. Recent items are only
// ever a "before you've typed enough to search" starting point — matching
// that same threshold here means they hand off to real search results the
// moment typing starts, never lingering mixed into a real result set.
const RECENT_QUERY_THRESHOLD = 2;

export function Typeahead({
  id,
  value,
  onChange,
  options,
  onSelect,
  placeholder,
  inputClassName = "input",
  emptyHint,
  required,
  recentOptions = [],
}: {
  id?: string;
  value: string;
  onChange: (text: string) => void;
  options: TypeaheadOption[];
  onSelect: (option: TypeaheadOption) => void;
  placeholder?: string;
  inputClassName?: string;
  emptyHint?: string;
  required?: boolean;
  // Optional "Recent" shortcut list (client-side only, see
  // src/lib/recentSelections.ts) — shown instead of `options` while the
  // query is empty/very short, per Job C's "zero-effort starting point"
  // design. Selecting one goes through the exact same `onSelect` callback
  // as a normal search result — never a different code path.
  recentOptions?: TypeaheadOption[];
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>();

  const showRecent = value.trim().length < RECENT_QUERY_THRESHOLD && recentOptions.length > 0;
  const displayedOptions = showRecent ? recentOptions : options;

  useEffect(() => setHighlighted(0), [displayedOptions]);
  useEffect(() => () => clearTimeout(blurTimer.current), []);

  function commit(option: TypeaheadOption) {
    onSelect(option);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || displayedOptions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, displayedOptions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(displayedOptions[highlighted]);
    } else if (e.key === "Tab" && displayedOptions[highlighted]) {
      commit(displayedOptions[highlighted]);
    }
  }

  const listboxId = id ? `${id}-listbox` : undefined;

  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listboxId}
        required={required}
        value={value}
        placeholder={placeholder}
        className={inputClassName}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => (value || recentOptions.length > 0) && setOpen(true)}
        onBlur={() => {
          // mousedown on an option fires (and commits) before this blur
          // handler runs, so the short delay just lets that happen first.
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={handleKeyDown}
      />
      {open && displayedOptions.length > 0 && (
        <ul id={listboxId} role="listbox" className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-control border border-border bg-white shadow-md">
          {/* Section header row, not a `role="option"` — purely visual, so
              it never enters the ArrowUp/Down/highlighted index math above,
              which is computed off `displayedOptions` alone. Labeled
              "Recent" only (never "Recommended"/"Suggested") — this is
              exactly what the current user picked before, not an inference. */}
          {showRecent && (
            <li role="presentation" className="px-3 py-1 text-[11px] font-medium text-muted">
              Recent
            </li>
          )}
          {displayedOptions.map((opt, i) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={i === highlighted}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(opt);
              }}
              onMouseEnter={() => setHighlighted(i)}
              className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm ${
                i === highlighted ? "bg-blue-50 text-primary" : "hover:bg-bg"
              }`}
            >
              <span>{opt.label}</span>
              {i === highlighted && <span className="text-[10px] text-muted">Tab ↵</span>}
            </li>
          ))}
        </ul>
      )}
      {open && displayedOptions.length === 0 && emptyHint && (
        <div className="absolute z-10 mt-1 w-full rounded-control border border-border bg-white px-3 py-2 text-xs text-muted shadow-md">{emptyHint}</div>
      )}
    </div>
  );
}
