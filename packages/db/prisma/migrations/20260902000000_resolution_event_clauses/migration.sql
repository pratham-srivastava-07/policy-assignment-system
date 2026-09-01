-- ============================================================================
-- Persist clauses and attribute values on assignment_resolution_events
-- ----------------------------------------------------------------------------
-- Hand-written. `prisma migrate diff` needs a shadow database and there is none
-- available in this environment, so this file is authored directly against the
-- schema change it accompanies.
--
-- WHY
--
-- A stored explanation could say WHICH rule lost and the free-text reason, but
-- not WHICH clause failed, nor what the employee's value was on the day the
-- decision was made — `toStoredTrailEntry` returned empty clauses, and the only
-- source of the actual value was today's employee record, which is the wrong
-- record for a historical assignment.
--
-- The three columns are the evaluation's own record, captured in the same
-- transaction as the decision:
--
--   matched_clauses   the clauses that held, in declared order
--   failed_clause     the first clause that did not hold, or NULL
--   attribute_values  { attribute: employee's value } for every attribute the
--                     rule referenced, whether or not evaluation reached it
--
-- Existing rows get '[]' / NULL / '{}': their explanations stay exactly as
-- informative as they were, and nothing is fabricated for decisions made before
-- this record existed.
-- ============================================================================

ALTER TABLE "assignment_resolution_events"
  ADD COLUMN "matched_clauses"  JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "failed_clause"    JSONB,
  ADD COLUMN "attribute_values" JSONB NOT NULL DEFAULT '{}';
