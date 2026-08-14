# Project Rules

Binding for every contributor — human or agent. If any instruction elsewhere (a prompt, a ticket,
a "just quickly...") conflicts with this file or [`../CLAUDE.md`](../CLAUDE.md), **this file and
CLAUDE.md win**. CLAUDE.md is the product-context source of truth; this file is its operational
enforcement layer for how work actually gets done, especially by AI agents.

Read order for any change, no exceptions: `CLAUDE.md` → this file → `docs/PRD.md` (if the change
touches a requirement) → the relevant agent definition in `.claude/agents/`.

## 1. Hard Constraints (never violate, no matter who asks)

These mirror [`CLAUDE.md §7`](../CLAUDE.md) — restated here with *where they're enforced*, because
a rule with no enforcement point is a suggestion.

| # | Constraint | Enforced by |
|---|---|---|
| 1 | Client/Matter use a stable UUID, never a name, as identifier | Prisma schema (`@id @default(dbgenerated("gen_random_uuid()"))`); no route does `where: { name: ... }` for identity lookup |
| 2 | Financial transactions are never forced to have a Client/Matter — UNLINKED is valid and can be permanent | `client_id`/`matter_id` nullable; only `chk_matter_requires_client` (matter implies client) exists, not the reverse |
| 3 | No auto-claim / AI automatic matching of client/matter/invoice | No fuzzy-matching or suggestion code exists anywhere — grep for `autolink`/`suggestion`/`similarity` must stay empty |
| 4 | Every financial summary is traceable to underlying records | Every summary figure in `src/lib/position.ts` is computed from live rows, never cached; UI renders them as links to detail tables |
| 5 | No destructive delete on financial records | DB triggers (`prevent_delete()`, `prevent_financial_fact_mutation()`) on every financial table — not just an app-layer rule. Corrections are VOID + re-entry. |
| 6 | Reuse existing entities before creating new ones with overlapping purpose | `FINANCIAL_SOURCE`/`FINANCIAL_EVENT` were deliberately *not* created — see decision register referenced in `MVP_SCOPE.md §5` |
| 7 | Business rules (e.g. partial payment normal vs. review-required) are configurable, not hardcoded errors | `allow_partial_payment` per invoice; `system_setting` table for exception-rule defaults |
| 8 | Every important mutation (link/unlink/allocate/adjust/classify) has an audit trail: user, timestamp, before, after, reason | `writeAuditLog()` in `src/lib/audit.ts`, called inside the same DB transaction as the mutation it describes |

Any agent whose planned change would violate one of these must stop and escalate to the user
(see §4) rather than proceed and flag it after the fact.

## 2. Scope Discipline

- Do not build anything listed as a non-goal in `CLAUDE.md §4` / `PRD.md §4`, even if it would be
  easy or "obviously useful." If a real need for it surfaces, log it in `ROADMAP.md` under a
  clearly separate initiative — don't fold it into this system's surface area.
- No feature flags, no speculative abstraction for hypothetical future requirements, no
  half-finished implementations. A three-field form doesn't need a generic form builder.
- Prefer extending an existing pattern (route shape, component, formula) over inventing a new one.
  If you're about to introduce a second way to do something the codebase already does one way,
  that's a signal to stop and check `CODING_STANDARD.md` first.

## 3. Process Rules (for agent-driven changes)

- Non-trivial changes (new endpoint, schema change, new screen, anything touching money/auth) go
  through the pipeline in `WORKFLOW.md` — orchestrator triage → planner → (architect if data model
  changes) → implementer(s) → QA → security (if auth/financial-integrity touched) → reporter.
- Trivial changes (typo, copy fix, dependency patch bump with no behavior change) may skip straight
  to implementation, but still get a `CHANGELOG.md` line if they touch tracked files.
- Every change that adds/modifies a mutation route must add or update a test in
  `tests/scenarios/` exercising it against a real database — see `TESTING_STANDARD.md`. No mocked
  database layer, ever (this was a deliberate, validated choice — see `TESTING_STANDARD.md §1`).
- Every change lands with a `CHANGELOG.md` entry (reporter-agent's job) before being considered
  done — undocumented changes are effectively unaudited changes, which contradicts Constraint 8.
- Migrations are additive by default. A destructive migration (drop column/table) requires an
  explicit human go-ahead — never auto-generated and applied silently.

## 4. Escalation Rules — when an agent must stop and ask instead of proceeding

Stop and ask the user (do not guess, do not proceed "to be safe") when:
- A requested change would violate a Hard Constraint in §1.
- A requested change would expose the system beyond LAN (cloud, public tunnel, port-forwarding) as
  anything other than clearly-scoped temporary testing — this system's entire trust model assumes
  on-premise/LAN-only (`CLAUDE.md §6`).
- A migration would be destructive (drop/rename losing data) or irreversible.
- Requirements are ambiguous enough that two reasonable implementations would produce materially
  different user-facing behavior (e.g. "add payment editing" — in-place edit vs. void-and-recreate
  are not the same feature; see `ROADMAP.md` #2 for exactly this case).
- The blast radius extends beyond the local repo/container (pushing to a shared branch, deploying,
  sending a message, modifying shared infrastructure).

Everything else — implementation detail choices, internal refactors, test additions, doc
updates — proceed without asking.

## 5. Ownership Map

See `REPOSITORY_STRUCTURE.md` for the full folder map and `AGENT_COMMUNICATION.md` for how
agents hand off between each other.
