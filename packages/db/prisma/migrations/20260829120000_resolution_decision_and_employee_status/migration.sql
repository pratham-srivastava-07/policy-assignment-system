-- ============================================================================
-- Resolution decision vocabulary + employee termination
-- ----------------------------------------------------------------------------
-- Hand-written. `prisma migrate diff` needs a shadow database and there is none
-- available in this environment, so this file is authored directly against the
-- schema change it accompanies. It has NOT been applied to any database.
--
-- Two changes:
--
--   1. `assignment_resolution_events.decision` stops being free text and becomes
--      the ResolutionDecision enum. The Assignment Engine now exists and its
--      decision vocabulary is fixed, so the column can be constrained.
--
--   2. Employees gain a lifecycle. Hard deletion is replaced by termination:
--      `DELETE /employees/:id` sets `status = 'TERMINATED'` and `terminated_on`,
--      and end-dates every open group membership and assignment. The row and its
--      history stay, which is the whole point — an assignment cannot be
--      explained against an employee that no longer exists.
-- ============================================================================

-- CreateEnum
CREATE TYPE "ResolutionDecision" AS ENUM (
  'MATCHED_WON',
  'MATCHED_LOST',
  'NOT_MATCHED',
  'SKIPPED_DISABLED',
  'SKIPPED_OUT_OF_WINDOW',
  'SKIPPED_POLICY_INACTIVE'
);

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'TERMINATED');

-- AlterTable
--
-- The USING clause is safe because nothing has written to this table yet: the
-- engine that populates it ships in the same change as this migration. Any row
-- that somehow exists and does not spell a valid decision would fail the cast,
-- which is the correct outcome — a decision log with unreadable decisions is
-- worse than a failed migration.
ALTER TABLE "assignment_resolution_events"
  ALTER COLUMN "decision" TYPE "ResolutionDecision"
  USING "decision"::"ResolutionDecision";

-- AlterTable
ALTER TABLE "employees"
  ADD COLUMN "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "terminated_on" DATE;

-- CreateIndex
--
-- "every active employee in this org" — the population sweep behind
-- /rules/:id/matching-employees and /rules/simulate, and the filter that keeps
-- terminated employees out of resolution.
CREATE INDEX "employees_organization_id_status_idx"
  ON "employees" ("organization_id", "status");
