# Project Memory

This project has three genuinely different kinds of "memory." Conflating them is a common way
documentation frameworks rot — each one has a different owner, lifetime, and update trigger.

## 1. Claude's Cross-Session Memory (outside this repo)

Claude Code's own persistent memory system (`~/.claude/projects/.../memory/`) — carries facts
across *conversations*, not across code. This is where things like "the user prefers to be asked
before exposing the app publicly" or "the user wants tests kept against a real DB, not mocks" get
recorded, if and when they come up as explicit feedback in a session. This document doesn't
control that system directly — it exists so agents know it's a separate layer and don't try to
duplicate its job by, e.g., writing user-preference notes into `CLAUDE.md`.

**Rule of thumb**: if it's about *how the user likes to collaborate* (independent of this specific
codebase), it belongs in Claude's memory system, not in a repo file. If it's about *this
codebase's own facts*, it belongs in one of the two layers below.

## 2. Repo-Level Documentation Memory (this repo, human + agent readable)

| File | What it remembers | Update trigger |
|---|---|---|
| `CLAUDE.md` | Product context, discovery findings, hard constraints, condensed version history | Rarely — only when product context or a hard constraint genuinely changes |
| `CHANGELOG.md` | Canonical, detailed version history | Every non-trivial change (`reporter-agent`'s job, see `WORKFLOW.md`) |
| `docs/PRD.md` | Current requirements, what's done vs. not | When a requirement is added, implemented, or reconsidered |
| `docs/ROADMAP.md` | Prioritized backlog | When a new need surfaces or an item ships |
| `MVP_SCOPE.md`, `SYSTEM_CONSISTENCY_REPORT.md`, `UI_IMPLEMENTATION_REPORT.md` | Point-in-time build reports | Frozen historical record — do not edit after the fact; superseded information gets corrected in `PRD.md`/`CHANGELOG.md` instead, with a note if it contradicts an old report |

This layer is git-versioned, so its own history is recoverable — no separate backup mechanism
needed for the memory itself.

## 3. Application-Level Memory (`audit_log` table)

The system's actual product feature — not documentation, but structurally the same idea: a
permanent, append-only record of what happened, by whom, when, and why. Every meaningful mutation
writes here via `writeAuditLog()` (`PROJECT_RULES.md` constraint 8). This is the memory the
*notary office* relies on; the two layers above are the memory *the development process* relies
on. Don't confuse a request to "improve traceability" as being about `CHANGELOG.md` — it almost
always means this layer, and the correct owner is `backend-agent`, not `reporter-agent`.

## 4. What Goes Where — Quick Reference

| If it's... | It goes in... |
|---|---|
| A fact about how the user wants to collaborate across sessions | Claude's memory system (not this repo) |
| A fact about why the product works the way it does | `CLAUDE.md` |
| A record of a specific change that shipped | `CHANGELOG.md` |
| A current, still-true requirement | `docs/PRD.md` |
| Something not built yet but worth doing | `docs/ROADMAP.md` |
| A record of a financial mutation in the running application | `audit_log` table (via `writeAuditLog()`) — this is code, not documentation |
