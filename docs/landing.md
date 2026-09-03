# landing.md

Design brief for the marketing/landing page. This is a spec for implementation — read `design-patterns.md` first for the underlying visual system this draws from.

**Before writing any UI code for this page, invoke the `design-taste`, `frontend-design`, and `ui-ux-pro` skills.** This page is judged on visual quality, not just functional correctness — treat those skills as mandatory input to every layout, spacing, and color decision here, not optional polish at the end.

## Brief

One clear job: explain what this product does and make the value obvious in under 10 seconds of scanning. This is not a marketing site with pricing tables, testimonials, and a footer full of links — it's a **tight, confident, 1–2 section page** that a company admin lands on and immediately gets it.

## Section 1 — Hero (required)

**Goal:** communicate the core value prop instantly: *"Define once. Resolves everywhere, correctly, automatically."*

- Headline: short, concrete, no buzzword soup. Something like "Policy assignments that resolve themselves" — not "Revolutionize your HR workflows with next-gen automation."
- Subheadline: one sentence grounding it — rules based on location, tenure, department, org chart; conflicts resolved deterministically; every assignment explainable.
- A single, real visual — not a stock illustration. Options, pick one:
  - A live-feeling mini version of the resolution flow (Employee → matching rules → resolved policy), animated on load or on scroll
  - A condensed real interaction: change one employee attribute (e.g. department) and watch the "Removed / Added" policy diff animate in, exactly like the example in `CLAUDE.md`'s "Changing Employee Information" section — this is the single most compelling demo of what the product does, so prefer this over a generic hero graphic
- One primary CTA. No secondary CTA competing for attention.

## Section 2 — Proof of mechanism (optional, only if section 1 needs support)

Only include this if the hero alone doesn't fully land the "why this is hard and we solved it" story. If included:

- Pick ONE dimension to go deep on rather than listing all six rule types shallowly — e.g. show the priority/conflict resolution mechanism concretely: two rules matching the same employee, and which one wins and why, in a single clean visual.
- Do not turn this into a feature list. A feature list is not a section, it's a spec sheet — this page shows one idea well rather than six ideas thinly.

## Explicit non-goals for this page

- No pricing section, no logos/social proof wall, no testimonials, no footer sitemap.
- No more than 2 sections total, including the hero.
- No stock "team collaborating around a laptop" imagery.
- No scroll-jacking or gimmicky animation that delays getting to the point.

## Tone

Confident, plain, technical-adjacent — the audience is company admins and the engineers evaluating whether to buy/build this, not consumers. Precision reads as credibility here more than enthusiasm does.