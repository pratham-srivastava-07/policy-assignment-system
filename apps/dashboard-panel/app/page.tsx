import { ConflictTrail, EnterWorkspace, ResolutionMachine } from "@/components/landing"

/**
 * The landing page (docs/landing.md).
 *
 * Two sections, and the hero carries the argument: an asymmetric split with the
 * claim on the left and a working miniature of the engine on the right. There is
 * no screenshot, because a real component preview is both more honest and more
 * convincing than a picture of one.
 */
export default function Home() {
  return (
    <div className="min-h-[100dvh] bg-bg">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
        <span className="flex items-center gap-2">
          <span
            className="inline-block size-2.5 rounded-[2px] bg-accent"
            aria-hidden
          />
          <span className="text-sm font-semibold tracking-tight text-ink">Policy</span>
        </span>
        <EnterWorkspace variant="ghost" />
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pt-6 pb-16 md:px-6 md:pt-8 lg:pb-20">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-12">
            <div className="flex flex-col items-start gap-5 lg:pt-6">
              <h1 className="text-4xl leading-[1.06] font-semibold tracking-tight text-ink md:text-[2.75rem] lg:text-[2.9rem]">
                Policy assignments that resolve themselves.
              </h1>

              <p className="max-w-prose text-base text-ink-muted md:text-[17px] md:leading-7">
                Write rules against location, tenure, department or the org chart.
                Conflicts resolve deterministically, and every assignment keeps its
                reason.
              </p>

              <EnterWorkspace />
            </div>

            <ResolutionMachine />
          </div>
        </section>

        <section className="border-t border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
            <ConflictTrail />
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-6 md:px-6">
          <p className="text-xs text-ink-subtle">
            Assignment rules, conflict resolution and audit for company administrators.
          </p>
        </div>
      </footer>
    </div>
  )
}
