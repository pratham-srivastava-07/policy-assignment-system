"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import { Command } from "cmdk"
import { useQuery } from "@tanstack/react-query"
import { Search } from "lucide-react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { QUERY_TIERS } from "@/lib/query"
import { useAsOf, withAsOf } from "@/lib/dates"
import { listEmployees } from "@/features/employees/api"
import { listRules } from "@/features/rules/api"
import { listPolicies } from "@/features/reference/api"

/**
 * The command palette (design.md §33).
 *
 * It navigates; it never fires an EXPENSIVE call. Reconcile and Preview both
 * spend an organization-wide budget of 5, so an accidental Enter here must not
 * be able to drain it for every other admin in the tenant.
 */

const CommandMenuContext = createContext<{ open: () => void } | null>(null)

const useDebounced = (value: string, delay = 300) => {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)

    return () => window.clearTimeout(timer)
  }, [value, delay])

  return debounced
}

export const CommandMenu = () => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const search = useDebounced(query)
  const router = useRouter()
  const { asOf } = useAsOf()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }

    document.addEventListener("keydown", onKey)

    return () => document.removeEventListener("keydown", onKey)
  }, [])

  const enabled = open && search.trim().length > 1

  const employees = useQuery({
    queryKey: ["command", "employees", search],
    queryFn: ({ signal }) =>
      listEmployees({ search, status: "ACTIVE" }, { limit: 5, offset: 0 }, signal),
    enabled,
    ...QUERY_TIERS.READ,
  })

  const rules = useQuery({
    queryKey: ["command", "rules", search],
    queryFn: ({ signal }) => listRules({ search }, { limit: 5, offset: 0 }, signal),
    enabled,
    ...QUERY_TIERS.READ,
  })

  const policies = useQuery({
    queryKey: ["command", "policies", search],
    queryFn: ({ signal }) => listPolicies({ search }, signal),
    enabled,
    ...QUERY_TIERS.READ,
  })

  const go = useCallback(
    (href: string) => {
      setOpen(false)
      setQuery("")
      router.push(withAsOf(href, asOf))
    },
    [router, asOf],
  )

  const NAV = useMemo(
    () => [
      { href: "/employees", label: "Employees" },
      { href: "/rules", label: "Rules" },
      { href: "/policies", label: "Policies" },
      { href: "/groups", label: "Groups" },
      { href: "/activity", label: "Activity" },
      { href: "/audit", label: "Audit" },
      { href: "/settings", label: "Settings" },
    ],
    [],
  )

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-overlay-in" />
        <DialogPrimitive.Content className="fixed top-[18%] left-1/2 z-50 w-[92vw] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-bg shadow-lg data-[state=open]:animate-dialog-in">
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search employees, rules and policies, or jump to a section.
          </DialogPrimitive.Description>

          <Command shouldFilter={false} loop>
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-4 shrink-0 text-ink-subtle" aria-hidden />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search employees, rules, policies..."
                className="h-11 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
              />
            </div>

            <Command.List className="max-h-80 overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-6 text-center text-sm text-ink-muted">
                {search.trim().length > 1 ? "Nothing matched." : "Type to search."}
              </Command.Empty>

              {(employees.data?.items.length ?? 0) > 0 ? (
                <Command.Group
                  heading="Employees"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-subtle"
                >
                  {employees.data!.items.map((employee) => (
                    <Command.Item
                      key={employee.id}
                      value={employee.id}
                      onSelect={() => go(`/employees/${employee.id}`)}
                      className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-ink data-[selected=true]:bg-surface"
                    >
                      <span className="truncate">{employee.name}</span>
                      <span className="shrink-0 text-xs text-ink-subtle">
                        {employee.department ?? "No department"}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              {(rules.data?.items.length ?? 0) > 0 ? (
                <Command.Group
                  heading="Rules"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-subtle"
                >
                  {rules.data!.items.map((rule) => (
                    <Command.Item
                      key={rule.id}
                      value={rule.id}
                      onSelect={() => go(`/rules/${rule.id}`)}
                      className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-ink data-[selected=true]:bg-surface"
                    >
                      <span className="truncate">{rule.name}</span>
                      <span className="tabular shrink-0 text-xs text-ink-subtle">
                        {rule.ruleType} · {rule.priority}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              {(policies.data?.items.length ?? 0) > 0 ? (
                <Command.Group
                  heading="Policies"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-subtle"
                >
                  {policies.data!.items.slice(0, 5).map((policy) => (
                    <Command.Item
                      key={policy.id}
                      value={policy.id}
                      onSelect={() => go(`/policies/${policy.id}`)}
                      className="cursor-pointer truncate rounded-md px-2 py-1.5 text-sm text-ink data-[selected=true]:bg-surface"
                    >
                      {policy.name}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              <Command.Group
                heading="Go to"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-subtle"
              >
                {NAV.map((item) => (
                  <Command.Item
                    key={item.href}
                    value={`nav-${item.label}`}
                    onSelect={() => go(item.href)}
                    className="cursor-pointer rounded-md px-2 py-1.5 text-sm text-ink data-[selected=true]:bg-surface"
                  >
                    {item.label}
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export const CommandMenuTrigger = () => {
  const context = useContext(CommandMenuContext)

  return (
    <button
      type="button"
      onClick={() => {
        context?.open()

        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
        )
      }}
      className="hidden h-8 items-center gap-2 rounded-md border border-border px-2 text-xs text-ink-subtle transition-colors duration-150 hover:bg-surface hover:text-ink md:inline-flex"
    >
      <Search className="size-3.5" aria-hidden />
      Search
      <kbd className="rounded-sm border border-border px-1 font-sans text-[10px]">
        Ctrl K
      </kbd>
    </button>
  )
}

export const CommandMenuProvider = ({ children }: { children: ReactNode }) => children
