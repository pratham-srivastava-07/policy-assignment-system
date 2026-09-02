import { format, formatDistanceToNowStrict } from "date-fns"
import type { IsoDate, IsoDateTime } from "@policy/shared"

/**
 * `null` means "today", which is also what an absent `?asOf=` means. Keeping the
 * two spellings identical is what lets a query key be compared safely (§35.1).
 */
export type AsOf = IsoDate | null

export const ASOF_PARAM = "asOf"

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export const isIsoDay = (value: string): boolean => {
  if (!ISO_DAY.test(value)) return false

  const [year, month, day] = value.split("-").map(Number) as [number, number, number]
  const parsed = new Date(year, month - 1, day)

  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  )
}

/**
 * The operator's calendar day, not UTC's. `@policy/shared`'s `todayIsoDate()`
 * reads in UTC, which puts an admin west of Greenwich a day ahead every evening.
 */
export const todayIso = (): IsoDate => {
  const now = new Date()
  const month = `${now.getMonth() + 1}`.padStart(2, "0")
  const day = `${now.getDate()}`.padStart(2, "0")

  return `${now.getFullYear()}-${month}-${day}`
}

/** `YYYY-MM-DD` read as a local calendar day, so formatting never shifts it. */
export const parseIsoDay = (value: IsoDate): Date => {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number]

  return new Date(year, month - 1, day)
}

/** `Jan 1, 2026` */
export const formatDay = (value: IsoDate): string =>
  format(parseIsoDay(value), "MMM d, yyyy")

/** `January 1, 2026` */
export const formatDayLong = (value: IsoDate): string =>
  format(parseIsoDay(value), "MMMM d, yyyy")

/** Audit rows are instants, effective dates are days. Never mix them (§8.1). */
export const formatDayTime = (value: IsoDateTime): string =>
  format(new Date(value), "MMM d, yyyy HH:mm")

export const formatRelative = (value: IsoDateTime): string =>
  formatDistanceToNowStrict(new Date(value), { addSuffix: true })

/**
 * A reconcile can close and reopen an assignment on the same day, leaving a
 * `[d, d)` row. It is real and empty; §8.4 says never render it.
 */
export const isZeroLengthPeriod = (period: {
  effectiveFrom: IsoDate
  effectiveTo: IsoDate | null
}): boolean => period.effectiveTo !== null && period.effectiveFrom === period.effectiveTo

export const formatEffectivePeriod = (period: {
  effectiveFrom: IsoDate
  effectiveTo: IsoDate | null
}): string =>
  period.effectiveTo === null
    ? `From ${formatDay(period.effectiveFrom)}`
    : `${formatDay(period.effectiveFrom)} – ${formatDay(period.effectiveTo)}`

/** Reads `?asOf=`, normalising today and anything malformed to `null`. */
export const readAsOf = (params: URLSearchParams | null | undefined): AsOf => {
  const raw = params?.get(ASOF_PARAM)

  if (!raw || !isIsoDay(raw) || raw === todayIso()) return null

  return raw
}

export const isHistorical = (asOf: AsOf): asOf is IsoDate => asOf !== null

/** What to send to the API: today is implicit server-side, so omit it. */
export const asOfQueryValue = (asOf: AsOf): IsoDate | undefined => asOf ?? undefined

/** Carries `asOf` across navigation (§8), omitting it when today (§34). */
export const withAsOf = (href: string, asOf: AsOf): string => {
  if (!isHistorical(asOf)) return href

  const [path, existing] = href.split("?")
  const params = new URLSearchParams(existing)
  params.set(ASOF_PARAM, asOf)

  return `${path}?${params.toString()}`
}
