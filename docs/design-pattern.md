# design-patterns.md

Visual design system for the product — the landing page (`landing.md`) and the real-time dashboard both draw from this. Read this before touching any UI code.

**Invoke the `design-taste`, `frontend-design`, and `ui-ux-pro` skills before making layout, color, typography, or component decisions anywhere in this codebase.** The existing frontend is functionally correct but visually generic — the fix is design taste applied consistently, not just prettier CSS on the same structural choices. Treat these skills as required input, not a final pass.

## Why the current design falls short (working assumption until code review confirms specifics)

Generic admin-tool look: default component spacing, default type scale, no real visual hierarchy beyond font-weight, likely default shadcn/Tailwind defaults left untouched. The fix is usually not "add more visual flourish" — it's tightening spacing rhythm, picking a real type scale, and using color with intent instead of decoration.

## Design principles

1. **Density with clarity.** This is a data-heavy admin tool (rules, employees, policies, audit logs) — the instinct to add whitespace for "modern feel" fights against the actual job of scanning dense information quickly. Aim for information-dense-but-legible, not sparse-but-empty.
2. **Color means something.** Reserve color for state (added/removed/conflict/pending), not decoration. A resolved assignment, a conflicting rule, and a manual override should be visually distinguishable at a glance without reading text.
3. **Motion explains, it doesn't decorate.** Animate state transitions that are genuinely informative (a policy diff appearing, a live reconciliation running) — skip animation that exists only to feel "modern."
4. **Real typographic scale.** Pick a deliberate type scale (not default browser/Tailwind sizes) and stick to it everywhere — headline, section labels, table text, metadata/timestamps each get one consistent size+weight combination, reused everywhere that kind of content appears.

## Real-time dashboard requirements

The dashboard is the core product surface — this is where admins actually work, so it needs to feel alive, not like a static CRUD table.

### Core views

- **Employee resolution view** — pick an employee, see their full resolved policy state across every category (time off, pay, benefits, access, compliance, org), each one annotated with *which rule* produced it (mirrors the `CLAUDE.md` explainability model).
- **Rule editor** — define/edit assignment rules with visible priority ordering; changing priority should show, live, which employees would be affected before saving.
- **Live reconciliation feed** — a real-time stream of assignment changes as they happen (employee attribute changed → policies recalculated → diff applied), not a page that needs manual refresh. This is the single best place to make "real-time" actually visible and felt.
- **Audit/history view** — timeline of changes to rules and assignments, answering "why does employee X have assignment Y as of date Z" directly in the UI, not just in an API response.

### Real-time mechanism

- Prefer **WebSocket or SSE** push from the `apps/worker` reconciliation process to the dashboard, rather than polling — the whole pitch of this feature is "you watch it happen," which polling undermines with visible lag.
- Every live update should render as a **diff**, not a full re-render — highlight exactly what changed (added/removed/modified), briefly, then settle. This is both better UX and cheaper to render.
- Connection state should be visible (live / reconnecting / stale) — a real-time feature that silently goes stale is worse than one that's honest about polling.

### Component patterns to standardize

- **Policy chip/badge** — one consistent visual treatment for "a policy applied to an employee," reused across employee view, rule editor, and the live feed. Include a hover/click affordance to see "why" without navigating away.
- **Diff row** — a consistent added/removed/changed row pattern, since this shows up in the live feed, the rule-priority preview, and the audit history — build it once, reuse everywhere.
- **Rule condition builder** — visual (not just a form with dropdowns) representation of "when X and Y, apply Z" — this is the single highest-leverage component for the non-engineer admin persona `CLAUDE.md` describes.

## Explicit non-goals

- Not trying to look like a consumer app — restraint and legibility over personality/illustration.
- No generic dashboard-template look (random KPI cards with icons and up/down arrows unless the number genuinely matters here).
- No skeleton-loading everything by default — for a dashboard about real-time state, showing stale-but-labeled data while fresh data streams in is often better than a loading flash.