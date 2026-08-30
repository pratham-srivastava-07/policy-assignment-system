-- ============================================================================
-- Groups become soft-deleted: groups.deleted_on
-- ----------------------------------------------------------------------------
-- Hand-written. `prisma migrate diff` needs a shadow database and there is none
-- available in this environment, so this file is authored directly against the
-- schema change it accompanies.
--
-- WHY
--
-- `DELETE /groups/:id` used to remove the row, and `employee_groups` cascaded
-- away with it. That destroyed both halves of what the deletion owed:
--
--   * the affected population — the outbox row named only the group, and by the
--     time the relay read it there were no memberships left to enumerate, so
--     `group.deleted` was rejected outright and every former member kept an
--     assignment no reconciliation would ever remove;
--
--   * the history — an assignment explained by "member of group X" cannot be
--     explained once X and the membership rows are gone.
--
-- So a group is now retired the way a rule is (disabled + end-dated) and an
-- employee is (terminated, row retained): the row stays, `deleted_on` records
-- the calendar day, and every open `employee_groups` row is end-dated on that
-- same day rather than cascaded away. The relay can then derive the affected
-- population from the memberships, which still exist.
--
-- DATE, not TIMESTAMPTZ: membership end-dating is calendar-day arithmetic
-- (`effective_to` is an exclusive DATE), and a deletion instant that disagreed
-- with the day the memberships closed would put the two out of step. This
-- mirrors `employees.terminated_on` exactly.
--
-- NOTE: the partial unique index at the bottom of this file is appended BY
-- HAND. Prisma's schema language cannot express a WHERE predicate on an index,
-- so `prisma migrate diff` will NOT reproduce it — exactly as with the
-- hand-written constraints in 20260829000000_init and 20260830000000_employee_org_chart.
-- It must be carried forward manually into any future migration that recreates
-- this table.
-- ============================================================================

-- AlterTable
ALTER TABLE "groups" ADD COLUMN "deleted_on" DATE;

-- DropIndex
--
-- The unconditional unique index reserved a deleted group's name forever: with
-- the row retained, "Contractors" could never be created again once a group of
-- that name had been deleted. It is replaced below by the same uniqueness
-- restricted to live rows.
DROP INDEX "groups_organization_id_name_key";

-- CreateIndex
--
-- "the live groups in this org" — what `GET /groups` and every group read now
-- filter on, since a soft-deleted group must not appear in either.
CREATE INDEX "groups_organization_id_deleted_on_idx"
  ON "groups" ("organization_id", "deleted_on");

-- ============================================================================
-- Hand-written constraints
-- ----------------------------------------------------------------------------
-- See the NOTE above: `prisma migrate diff` will not regenerate what follows.
-- ============================================================================

-- Group names stay unique per organization, but only among groups that still
-- exist. Deleted rows drop out of the index entirely, so a name is released the
-- moment the group holding it is deleted, and two deleted groups may share a
-- name (a name can be created, deleted and created again any number of times).
CREATE UNIQUE INDEX "groups_organization_id_name_live_uniq"
  ON "groups" ("organization_id", "name")
  WHERE "deleted_on" IS NULL;
