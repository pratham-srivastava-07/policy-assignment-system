-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Cardinality" AS ENUM ('SINGLE', 'MULTIPLE');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('MANUAL', 'ROLE', 'DEPARTMENT', 'LOCATION', 'TENURE', 'GROUP', 'DEFAULT');

-- CreateEnum
CREATE TYPE "ResolutionStatus" AS ENUM ('AUTOMATIC', 'MANUAL_OVERRIDE');

-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('COMPANY_ADMIN', 'HR_ADMIN', 'MANAGER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "employee_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "role" "OrganizationRole" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "hire_date" DATE NOT NULL,
    "employment_type" TEXT NOT NULL,
    "department" TEXT,
    "role" TEXT,
    "location" TEXT,
    "state" TEXT,
    "country" TEXT,
    "is_manager" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_groups" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_categories" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "cardinality" "Cardinality" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "policy_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "PolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_rules" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "employee_id" UUID,
    "name" TEXT NOT NULL,
    "rule_type" "RuleType" NOT NULL,
    "priority" INTEGER NOT NULL,
    "conditions" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "policy_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_rule_versions" (
    "id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "policy_id" UUID NOT NULL,
    "employee_id" UUID,
    "name" TEXT NOT NULL,
    "rule_type" "RuleType" NOT NULL,
    "priority" INTEGER NOT NULL,
    "conditions" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_rule_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "cardinality" "Cardinality" NOT NULL,
    "source_rule_id" UUID NOT NULL,
    "source_rule_version" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "resolution_status" "ResolutionStatus" NOT NULL,
    "resolution_reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_resolution_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "assignment_id" UUID,
    "rule_id" UUID NOT NULL,
    "rule_version" INTEGER NOT NULL,
    "policy_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evaluated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_resolution_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before_state" JSONB,
    "after_state" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_attribute_history" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "attribute" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "changed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_attribute_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");

-- CreateIndex
CREATE INDEX "organization_memberships_organization_id_idx" ON "organization_memberships"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_user_id_organization_id_key" ON "organization_memberships"("user_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "employees_organization_id_department_idx" ON "employees"("organization_id", "department");

-- CreateIndex
CREATE INDEX "employees_organization_id_state_idx" ON "employees"("organization_id", "state");

-- CreateIndex
CREATE INDEX "employees_organization_id_employment_type_idx" ON "employees"("organization_id", "employment_type");

-- CreateIndex
CREATE INDEX "employees_organization_id_role_idx" ON "employees"("organization_id", "role");

-- CreateIndex
CREATE INDEX "employees_organization_id_hire_date_idx" ON "employees"("organization_id", "hire_date");

-- CreateIndex
CREATE UNIQUE INDEX "employees_organization_id_email_key" ON "employees"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "groups_organization_id_name_key" ON "groups"("organization_id", "name");

-- CreateIndex
CREATE INDEX "employee_groups_group_id_effective_from_idx" ON "employee_groups"("group_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "employee_groups_employee_id_group_id_effective_from_key" ON "employee_groups"("employee_id", "group_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "policy_categories_organization_id_key_key" ON "policy_categories"("organization_id", "key");

-- CreateIndex
CREATE INDEX "policies_organization_id_status_idx" ON "policies"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "policies_organization_id_category_id_name_key" ON "policies"("organization_id", "category_id", "name");

-- CreateIndex
CREATE INDEX "policy_rules_organization_id_enabled_effective_from_idx" ON "policy_rules"("organization_id", "enabled", "effective_from");

-- CreateIndex
CREATE INDEX "policy_rules_organization_id_rule_type_enabled_idx" ON "policy_rules"("organization_id", "rule_type", "enabled");

-- CreateIndex
CREATE INDEX "policy_rules_policy_id_idx" ON "policy_rules"("policy_id");

-- CreateIndex
CREATE INDEX "policy_rules_employee_id_idx" ON "policy_rules"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "policy_rule_versions_rule_id_version_key" ON "policy_rule_versions"("rule_id", "version");

-- CreateIndex
CREATE INDEX "assignments_organization_id_employee_id_effective_from_idx" ON "assignments"("organization_id", "employee_id", "effective_from");

-- CreateIndex
CREATE INDEX "assignments_organization_id_policy_id_idx" ON "assignments"("organization_id", "policy_id");

-- CreateIndex
CREATE INDEX "assignments_source_rule_id_source_rule_version_idx" ON "assignments"("source_rule_id", "source_rule_version");

-- CreateIndex
CREATE INDEX "assignment_resolution_events_organization_id_employee_id_ev_idx" ON "assignment_resolution_events"("organization_id", "employee_id", "evaluated_at");

-- CreateIndex
CREATE INDEX "assignment_resolution_events_assignment_id_idx" ON "assignment_resolution_events"("assignment_id");

-- CreateIndex
CREATE INDEX "assignment_resolution_events_rule_id_rule_version_idx" ON "assignment_resolution_events"("rule_id", "rule_version");

-- CreateIndex
CREATE INDEX "audit_events_organization_id_entity_type_entity_id_created__idx" ON "audit_events"("organization_id", "entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_organization_id_created_at_idx" ON "audit_events"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "employee_attribute_history_employee_id_attribute_effective__idx" ON "employee_attribute_history"("employee_id", "attribute", "effective_from");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_groups" ADD CONSTRAINT "employee_groups_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_groups" ADD CONSTRAINT "employee_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_categories" ADD CONSTRAINT "policy_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "policy_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_rules" ADD CONSTRAINT "policy_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_rules" ADD CONSTRAINT "policy_rules_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_rules" ADD CONSTRAINT "policy_rules_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_rule_versions" ADD CONSTRAINT "policy_rule_versions_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "policy_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_rule_versions" ADD CONSTRAINT "policy_rule_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "policy_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_source_rule_id_source_rule_version_fkey" FOREIGN KEY ("source_rule_id", "source_rule_version") REFERENCES "policy_rule_versions"("rule_id", "version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_resolution_events" ADD CONSTRAINT "assignment_resolution_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_resolution_events" ADD CONSTRAINT "assignment_resolution_events_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_resolution_events" ADD CONSTRAINT "assignment_resolution_events_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_resolution_events" ADD CONSTRAINT "assignment_resolution_events_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "policy_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_resolution_events" ADD CONSTRAINT "assignment_resolution_events_rule_version_fkey" FOREIGN KEY ("rule_id", "rule_version") REFERENCES "policy_rule_versions"("rule_id", "version") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_resolution_events" ADD CONSTRAINT "assignment_resolution_events_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_resolution_events" ADD CONSTRAINT "assignment_resolution_events_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "policy_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_attribute_history" ADD CONSTRAINT "employee_attribute_history_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_attribute_history" ADD CONSTRAINT "employee_attribute_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================================
-- Hand-written constraints
-- ----------------------------------------------------------------------------
-- Prisma's schema language cannot express CHECK constraints or partial unique
-- indexes, so the two invariants below are appended by hand. `prisma migrate
-- diff` will NOT reproduce them: they must be carried forward manually into any
-- future migration that recreates these tables.
-- ============================================================================

-- A MANUAL rule targets exactly one employee; every other rule type targets a
-- population and must not name one. Locked decision: manual overrides are rules,
-- not a separate table.
ALTER TABLE "policy_rules"
  ADD CONSTRAINT "policy_rules_manual_employee_chk"
  CHECK (("employee_id" IS NOT NULL) = ("rule_type" = 'MANUAL'));

-- SINGLE cardinality, enforced in the database rather than only in application
-- code: an employee may hold at most one open-ended (current) assignment per
-- policy category when that category is SINGLE. MULTIPLE categories are excluded
-- from the index entirely, so application access, groups and trainings stack
-- freely.
--
-- `cardinality` is denormalized onto assignments from policy_categories purely
-- so this predicate can select the SINGLE rows.
--
-- NOTE: this guards CURRENT state (effective_to IS NULL). It does not prevent two
-- historical SINGLE assignments with overlapping closed date ranges. Full
-- temporal exclusion would require btree_gist:
--
--   CREATE EXTENSION IF NOT EXISTS btree_gist;
--   ALTER TABLE "assignments" ADD CONSTRAINT "assignments_single_no_overlap"
--     EXCLUDE USING gist (
--       "organization_id" WITH =, "employee_id" WITH =, "category_id" WITH =,
--       daterange("effective_from", "effective_to", '[)') WITH &&
--     ) WHERE ("cardinality" = 'SINGLE');
--
-- The '[)' bound matches the system-wide point-in-time predicate exactly. Left
-- commented out because the partial unique index is what was specified.
CREATE UNIQUE INDEX "assignments_single_current_uniq"
  ON "assignments" ("organization_id", "employee_id", "category_id")
  WHERE "cardinality" = 'SINGLE' AND "effective_to" IS NULL;
