-- ============================================================================
-- Org chart: employees.manager_id
-- ----------------------------------------------------------------------------
-- Hand-written. `prisma migrate diff` needs a shadow database and there is none
-- available in this environment, so this file is authored directly against the
-- schema change it accompanies.
--
-- The reporting structure is a single self-referencing edge on `employees`: one
-- manager per employee, any number of reports per manager. That is the whole org
-- chart — there is no separate edge table, because a second table would let the
-- chart disagree with the employee row about who reports to whom.
--
-- ON DELETE SET NULL, not CASCADE: a manager row disappearing must never take
-- their reports with it. (In practice employees are terminated rather than
-- deleted, so this fires only for a genuine hard delete.)
--
-- `is_manager` stays where it is and stays DERIVED from this column. It is
-- maintained on write by EmployeeService, which recomputes it for the old and
-- the new manager inside the same transaction as the `manager_id` change.
-- `manager_id` is the source of truth; if the two disagree, `is_manager` is the
-- one that is wrong.
--
-- NOTE: the CHECK constraint at the bottom of this file is appended BY HAND.
-- Prisma's schema language cannot express CHECK constraints, so `prisma migrate
-- diff` will NOT reproduce it — exactly as with the two hand-written constraints
-- in 20260829000000_init. It must be carried forward manually into any future
-- migration that recreates this table.
-- ============================================================================

-- AlterTable
ALTER TABLE "employees" ADD COLUMN "manager_id" UUID;

-- CreateIndex
--
-- "who reports to this employee?" — the direct-report lookup, the recursive
-- subtree walk, and the `is_manager` recount all lead with (org, manager).
CREATE INDEX "employees_organization_id_manager_id_idx"
  ON "employees" ("organization_id", "manager_id");

-- AddForeignKey
ALTER TABLE "employees"
  ADD CONSTRAINT "employees_manager_id_fkey"
  FOREIGN KEY ("manager_id") REFERENCES "employees"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Hand-written constraints
-- ----------------------------------------------------------------------------
-- See the NOTE above: `prisma migrate diff` will not regenerate what follows.
-- ============================================================================

-- The one cycle the database can actually see: an employee managing themselves.
-- A row-level CHECK sees only its own row, so this catches A -> A and nothing
-- longer. Deeper cycles (A -> B -> A) need to walk other rows, which a CHECK
-- constraint may not do; they are rejected in EmployeeService, which refuses a
-- manager that already sits inside the employee's own subtree.
ALTER TABLE "employees" ADD CONSTRAINT "employees_not_own_manager_chk"
  CHECK ("manager_id" IS NULL OR "manager_id" <> "id");
