"use client";

// Client-side counterpart to src/lib/currentUser.ts (Step 13). Same
// disclaimer applies: this is identification for audit trail purposes,
// not authentication. Persisted in localStorage so staff don't re-type
// their name every page load on their own machine.
const STORAGE_KEY = "notary_staff_name";

export function getStaffName(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function setStaffName(name: string): void {
  window.localStorage.setItem(STORAGE_KEY, name.trim());
}
