"use client";

import { useEffect, useRef, type RefObject } from "react";

// Objective P2 "Keyboard-first workflow" — shared focus trap for this app's
// `fixed inset-0` overlay modals. Attach the returned ref to the modal's
// inner panel element (the card/drawer/form div — NEVER the backdrop, which
// keeps its own existing onClick={onClose} untouched).
//
// getClientRects().length > 0 is used (not `offsetParent !== null`) to
// filter for visible focusable elements: offsetParent is null for
// `position: fixed` elements, which every one of these panels is, so that
// check would incorrectly treat every descendant as hidden.
//
// Escape yields to an already-open inner popover: FieldHelp/
// CalculationExplain/Typeahead (all three, untouched by this task) already
// set aria-expanded="true" on their own trigger while open and already
// handle their own Escape correctly — if one of those is open inside this
// panel, this hook does nothing on Escape and lets that inner handler close
// just the popover, not the whole modal underneath it.
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function isVisible(el: Element): boolean {
  return el.getClientRects().length > 0;
}

function getFocusable(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
}

export function useModalFocusTrap<T extends HTMLElement>(open: boolean, onClose: () => void): RefObject<T> {
  const panelRef = useRef<T>(null);
  const triggerRef = useRef<Element | null>(null);
  // Latest-value ref (same pattern as LockScreen.tsx's useInactivityLock
  // lockRef) rather than an [open, onClose] dependency array — most callers
  // pass an inline `() => setOpen(false)`, a new function identity every
  // render, and this effect must NOT re-run (and re-steal focus) on every
  // parent re-render while the modal is simply sitting open (e.g. while
  // staff are typing into a field inside it).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    triggerRef.current = document.activeElement;

    const focusable = panel ? getFocusable(panel) : [];
    if (focusable.length > 0) {
      focusable[0].focus();
    } else {
      panel?.focus();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (!panel) return;

      if (e.key === "Escape") {
        if (panel.querySelector('[aria-expanded="true"]')) return;
        onCloseRef.current();
        return;
      }

      if (e.key === "Tab") {
        const items = getFocusable(panel);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;

        if (e.shiftKey) {
          if (active === first || !panel.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else if (active === last || !panel.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    panel?.addEventListener("keydown", handleKeyDown);
    return () => {
      panel?.removeEventListener("keydown", handleKeyDown);
      const trigger = triggerRef.current;
      if (trigger instanceof HTMLElement && document.contains(trigger)) {
        trigger.focus();
      }
    };
  }, [open]);

  return panelRef;
}
