// "Recent Client/Matter" — client-side, per-browser convenience cache, NOT
// a recommendation engine. Only ever records what THIS user explicitly
// selected via the existing Client/Matter pickers (NewTransactionModal,
// LinkDrawer) and replays it back through those same pickers as a
// zero-effort shortcut into the existing explicit-selection flow (see
// Typeahead's `recentOptions` prop). Never inferred, never fuzzy-matched,
// never auto-linked/auto-submitted — CLAUDE.md §7 constraint 3.
//
// Deliberately plain browser localStorage (not sessionStorage, not a
// cookie) — recents should survive across browser restarts the same way a
// human's own memory of "who did I just work with" would, and unlike
// `ui_lite_mode` (a cookie, since it must be readable by the Server
// Component that renders the Dashboard) this is pure client-side UI sugar
// with nothing for the server to ever see. Key prefix `notary:` keeps this
// from colliding with `ui_lite_mode` or the signed session cookie.
//
// Storing {id, label} pairs (not a bare id) is deliberate: the whole point
// of "Recent" is rendering "CV Bumi Persada" the instant the picker opens,
// with zero network round-trip — a bare id alone can't do that on first
// paint. This is not "duplicating the record," just enough to render
// instantly; the id remains the single source of truth for the actual
// selection (`pickClient()` / the matter `<select>`/button list use it
// exactly as they already do for a normal search result).
//
// Every read/write is wrapped in try/catch: private browsing, disabled
// storage, a full quota, or corrupted JSON must all degrade to "no recent
// items shown," never throw and break the picker (task constraint).

export interface RecentClient {
  id: string;
  name: string;
}

export interface RecentMatter {
  id: string;
  matterName: string;
  clientId: string;
  clientName: string;
}

const RECENT_CLIENTS_KEY = "notary:recentClients";
const RECENT_MATTERS_KEY = "notary:recentMatters";

// Display cap, per the task spec ("cap at 5 items, most-recent-first").
const MAX_RECENT = 5;
// Matters are stored in one flat list across all clients (not one list per
// client — that would mean an unbounded number of localStorage keys as
// staff work with more clients over time). This raw buffer is kept larger
// than the per-client display cap so recent matters from several different
// clients can survive at once; getRecentMattersForClient() re-applies
// MAX_RECENT after filtering down to the requested client.
const MAX_RECENT_MATTERS_STORED = MAX_RECENT * 6;

function hasId(value: unknown): value is { id: string } {
  return typeof value === "object" && value !== null && typeof (value as { id?: unknown }).id === "string";
}

function readList<T extends { id: string }>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(hasId) as T[];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, list: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Quota exceeded / storage disabled mid-session — drop silently, same
    // graceful-degradation rule as the read side.
  }
}

// MRU insert: any existing entry with the same id is removed first, then
// the new one is unshifted to the front — so re-selecting an item already
// in the list both dedupes it and moves it to the top, and refreshes its
// cached label in case it changed (e.g. client renamed) since it was last
// recorded.
function pushMru<T extends { id: string }>(list: T[], item: T, cap: number): T[] {
  return [item, ...list.filter((existing) => existing.id !== item.id)].slice(0, cap);
}

export function getRecentClients(): RecentClient[] {
  return readList<RecentClient>(RECENT_CLIENTS_KEY).slice(0, MAX_RECENT);
}

export function recordRecentClient(client: RecentClient): void {
  const next = pushMru(readList<RecentClient>(RECENT_CLIENTS_KEY), client, MAX_RECENT);
  writeList(RECENT_CLIENTS_KEY, next);
}

// Filtered to the requested client only — matter is always scoped under an
// already-chosen client in this app (both call sites), so there is no
// client-independent "recent matter" view.
export function getRecentMattersForClient(clientId: string): RecentMatter[] {
  return readList<RecentMatter>(RECENT_MATTERS_KEY)
    .filter((m) => m.clientId === clientId)
    .slice(0, MAX_RECENT);
}

export function recordRecentMatter(matter: RecentMatter): void {
  const next = pushMru(readList<RecentMatter>(RECENT_MATTERS_KEY), matter, MAX_RECENT_MATTERS_STORED);
  writeList(RECENT_MATTERS_KEY, next);
}
