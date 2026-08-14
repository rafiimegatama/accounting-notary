# Repository Structure

Folder-by-folder map with which agent role (`.claude/agents/`) primarily owns each area. "Owns"
means "implements changes here" — QA, security, and reporter touch most folders regardless.

```
notary_accounting/
├── CLAUDE.md                    Product context & instructions — read first, always
├── README.md                    Public-facing project overview
├── CHANGELOG.md                 Canonical version history
├── MVP_SCOPE.md                 Discovery findings, MUST HAVE status, assumptions, unknowns
├── SYSTEM_CONSISTENCY_REPORT.md Evidence-based audit of key constraints vs. real code/DB
├── UI_IMPLEMENTATION_REPORT.md  UI build report: screens, components, auth, bugs found
├── ddl_notary_financial_control.sql   Authoritative DDL (triggers/checks Prisma can't express)
│
├── docs/                        This framework — PRD, rules, standards, agent-facing docs
│   ├── PRD.md
│   ├── PROJECT_RULES.md
│   ├── SYSTEM_OVERVIEW.md
│   ├── AGENT_COMMUNICATION.md
│   ├── PROJECT_MEMORY.md
│   ├── WORKFLOW.md
│   ├── REPOSITORY_STRUCTURE.md  (this file)
│   ├── CODING_STANDARD.md
│   ├── TESTING_STANDARD.md
│   ├── DEPLOYMENT.md
│   └── ROADMAP.md
│
├── .claude/agents/              Operational subagent definitions
│   ├── orchestrator.md
│   ├── planner-agent.md
│   ├── architect-agent.md
│   ├── frontend-agent.md
│   ├── backend-agent.md
│   ├── qa-agent.md
│   ├── debug-agent.md
│   ├── security-agent.md
│   ├── devops-agent.md
│   └── reporter-agent.md
│
├── prisma/
│   ├── schema.prisma             Data model — owner: architect-agent, implementer: backend-agent
│   └── migrations/                One folder per migration, timestamp-prefixed
│
├── src/
│   ├── app/
│   │   ├── (app)/                 Authenticated pages — owner: frontend-agent
│   │   │   ├── clients/, matters/, transactions/, invoices/, payments/,
│   │   │   │   deposits/, disbursements/, cost-details/, review/, sources/,
│   │   │   │   audit-log/, reports/, settings/, search/
│   │   ├── api/                   Route handlers, one folder per resource — owner: backend-agent
│   │   │   ├── attachments/, audit-log/, auth/, clients/, cost-details/,
│   │   │   │   deposits/, disbursements/, exceptions/, invoices/, matters/,
│   │   │   │   payment-allocations/, payments/, reports/, search/, sources/,
│   │   │   │   trace/, transactions/
│   │   └── login/                 Unauthenticated entry point
│   │
│   ├── components/                Owner: frontend-agent
│   │   ├── ui/                    Shared primitives: Button, Card, StatusBadge, EmptyState,
│   │   │                          Skeleton, SummaryCard, Tabs, Toast
│   │   ├── charts/                FinancialTrendChart, ReviewDonutChart (recharts)
│   │   └── *.tsx                  Feature components: FinancialPositionView, LinkDrawer,
│   │                              TransactionActions, TransactionTraceView, GlobalSearch, etc.
│   │
│   └── lib/                       Owner: backend-agent (business logic), shared by frontend for types
│       ├── apiResponse.ts         Response envelope + ApiError + withApiHandler — see CODING_STANDARD.md
│       ├── audit.ts               writeAuditLog() — mandatory for every meaningful mutation
│       ├── currentUser.ts         Session-cookie verification for API routes
│       ├── session.ts             HMAC session signing/verification
│       ├── requireSession.ts      Session verification for Server Components (pages)
│       ├── position.ts            Financial position formulas — see SYSTEM_OVERVIEW.md §4
│       ├── exceptionRules.ts      NORMAL/WARNING/REVIEW_REQUIRED classification rules
│       ├── trace.ts, history.ts   Transaction trace / timeline construction
│       ├── search.ts              Global search query logic
│       ├── dashboard.ts, listAggregates.ts, reviewQueue.ts, sources.ts   Read-model helpers
│       └── enums.ts, formatCurrency.ts, timelineLabel.ts   Shared constants/formatters
│
├── scripts/
│   ├── seed-demo.ts               Seeds via real route handlers (not raw SQL) — owner: devops-agent
│   └── reset-test-db.sh           DROP/CREATE test DB (DELETE is trigger-blocked by design)
│
├── tests/                         Owner: qa-agent
│   ├── scenarios/                 End-to-end scenario tests against a real Postgres DB
│   ├── unit/                      Pure-function unit tests
│   └── helpers/callApi.ts         Calls route handlers directly with a real signed session cookie
│
├── attachments/                   Uploaded file storage (filesystem, path stored in DB)
├── Dockerfile, docker-compose.yml Owner: devops-agent
└── .env, .env.example, .env.test  Never commit real .env — see PROJECT_RULES.md / DEPLOYMENT.md
```

## Naming Conventions

- **Routes**: REST-ish, resource-named folders (`/api/invoices`, `/api/invoices/[id]`). Action
  sub-routes for non-CRUD operations: `/api/transactions/[id]/link`, `/api/payments/[id]/allocate`.
- **Components**: PascalCase, feature name + role suffix where relevant (`TransactionTraceView`,
  `CreateInvoiceModal`, `UnlinkedReviewTable`).
- **lib functions**: verb-first for actions (`writeAuditLog`, `getCurrentUser`), noun-first for
  pure computation modules (`position.ts`, `search.ts`).
- **Migrations**: Prisma default timestamp prefix + short description
  (`20260810153247_add_staff_auth`).
- **IDs**: always UUID (`@db.Uuid`), never expose or accept a name as an identifier in a route
  param.
