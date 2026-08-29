/**
 * Calendar-day helpers.
 *
 * Effective dating in this system is an org-local calendar day, not an instant.
 * Everything here works in whole days and treats a `Date` as the UTC midnight
 * that Postgres hands back for a `DATE` column, so that no timezone offset can
 * shift a boundary by a day.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** True for a `YYYY-MM-DD` string that names a real calendar day. */
export const isIsoDate = (value: string): boolean => {

  if (!ISO_DATE_PATTERN.test(value)) {

    return false
  }

  const parsed = new Date(`${value}T00:00:00.000Z`)

  return !Number.isNaN(parsed.getTime()) && toIsoDate(parsed) === value
}

/** `Date` -> `YYYY-MM-DD`, read in UTC. */
export const toIsoDate = (value: Date): string => value.toISOString().slice(0, 10)

/** `YYYY-MM-DD` -> the UTC midnight `Date` that Postgres stores for it. */
export const fromIsoDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`)

/** Today as a calendar day, in UTC. */
export const todayIsoDate = (): string => toIsoDate(new Date())

/** Whole days from `start` to `end`, negative if `end` precedes `start`. */
export const daysBetween = (start: Date, end: Date): number => {

  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())

  return Math.floor((endDay - startDay) / MS_PER_DAY)
}

/**
 * Tenure in whole days as of a given day. Never stored — always derived from the
 * hire date at the moment of evaluation.
 */
export const tenureDaysAsOf = (hireDate: Date, asOf: Date = new Date()): number => {

  return Math.max(0, daysBetween(hireDate, asOf))
}

/**
 * The system-wide point-in-time predicate, in code form:
 *
 *     effectiveFrom <= asOf AND (effectiveTo IS NULL OR effectiveTo > asOf)
 *
 * `effectiveTo` is exclusive; NULL means open-ended.
 */
export const isEffectiveOn = (
  period: { effectiveFrom: Date; effectiveTo: Date | null },
  asOf: Date,
): boolean => {

  if (daysBetween(period.effectiveFrom, asOf) < 0) {

    return false
  }

  if (period.effectiveTo === null) {

    return true
  }

  return daysBetween(asOf, period.effectiveTo) > 0
}
