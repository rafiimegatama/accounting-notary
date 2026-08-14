# Agent Communication Protocol

How specialist agents hand off work to each other, given the constraint below.

## 1. The Constraint That Shapes Everything Here

Claude Code subagents (`.claude/agents/*.md`) cannot invoke other subagents — only the top-level
session (the one the user is actually talking to) can call the Agent tool. This means:

- `orchestrator` cannot literally "dispatch" work to `planner-agent` etc. It can only **read**
  context and **produce a plan document** recommending what should happen next and in what order.
- The top-level session is the real orchestrator in practice. It reads the plan `orchestrator`
  produces (or skips straight to it for simple requests) and invokes each specialist agent in
  turn, passing along the previous agent's output.
- Every agent definition in `.claude/agents/` is written knowing this — none of them assume they
  can call another agent directly.

## 2. Handoff Artifact: the Report

Every agent, when invoked as part of the pipeline, returns a structured report in its final
message so the next step (whether that's the top-level session or a human) can act on it without
re-deriving context. Shape:

```markdown
## <agent-name> report

**Status**: DONE | BLOCKED | NEEDS_INPUT | FAILED

**Summary**: one paragraph, what was done/found.

**Changes**: file paths touched, or "none (read-only analysis)".

**Next step recommended**: which agent (if any) should pick this up, and why.

**Escalation** (only if BLOCKED or NEEDS_INPUT): the specific question that needs a human answer,
per PROJECT_RULES.md §4 — not a vague "let me know if this looks right."
```

Agents should not silently expand scope beyond what they were asked — if they notice something
adjacent that needs fixing, it goes in the report as a recommendation, not as an unrequested
change bundled into the same diff.

## 3. Status Vocabulary

| Status | Meaning | Who acts next |
|---|---|---|
| `DONE` | Work completed and (if applicable) verified | Pipeline continues to the next step |
| `BLOCKED` | Cannot proceed — hard constraint, destructive op, or missing prerequisite | Escalate to human per `PROJECT_RULES.md §4` |
| `NEEDS_INPUT` | Ambiguity that a reasonable person could resolve two different ways | Escalate to human — do not guess |
| `FAILED` | Attempted and did not succeed (e.g. tests still red after a fix attempt) | Hand to `debug-agent` if not already there, or escalate if `debug-agent` itself is stuck |

## 4. Artifact Locations

Agents write durable outputs to consistent places so later steps (and humans) can find them
without asking:

| Artifact | Location |
|---|---|
| Implementation plans | Inline in the agent's report — no separate plan file unless the user asked for one via Claude Code's own Plan mode |
| Architecture/data-model decisions | `docs/SYSTEM_OVERVIEW.md` if it changes the current-state picture; `docs/PRD.md` if it changes a requirement |
| Changelog entries | `CHANGELOG.md` (canonical) + one condensed row in `CLAUDE.md §8` — `reporter-agent`'s job |
| Roadmap items discovered mid-work | `docs/ROADMAP.md` |
| Test additions | `tests/scenarios/` or `tests/unit/` per `TESTING_STANDARD.md` |

## 5. Escalating to the Human

When any agent's report has `BLOCKED` or `NEEDS_INPUT` status, the top-level session surfaces the
specific question to the user (via `AskUserQuestion` or plain text) — it does not paraphrase it
into something vaguer, and it does not pick an answer on the agent's behalf. See
`PROJECT_RULES.md §4` for exactly which situations require this.
