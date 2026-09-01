import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  ERROR_CODES,
  Page,
  PolicyAssignmentDTO,
  PolicyCategoryDTO,
  PolicyDTO,
  fromIsoDate,
  todayIsoDate,
} from "@policy/shared"
import {
  AssignmentRepository,
  AuditEventRepository,
  Policy,
  PolicyCategory,
  PolicyCategoryRepository,
  PolicyRepository,
  TransactionManager,
} from "@policy/core"
import {
  PolicyCategoryServiceInterface,
  PolicyServiceInterface,
} from "../interfaces/policy"
import {
  AsOfPaginationQuery,
  CreatePolicyCategoryInput,
  CreatePolicyInput,
  ListPoliciesQuery,
  ListPolicyCategoriesQuery,
  PatchPolicyCategoryInput,
  PatchPolicyInput,
  ReplacePolicyInput,
} from "../validators"
import { AppError } from "@policy/core"
import { toPolicyAssignmentDTO, toPolicyCategoryDTO, toPolicyDTO } from "@policy/core"

/**
 * Policy categories — the unit that carries assignment cardinality.
 *
 * Nothing here enqueues reconciliation: a category's name and key do not
 * participate in rule evaluation, and its cardinality cannot be edited (see the
 * validator).
 */
export class PolicyCategoryService implements PolicyCategoryServiceInterface {

  constructor(
    private transactions: TransactionManager,
    private categories: PolicyCategoryRepository,
    private audit: AuditEventRepository,
  ) {}

  async create(
    organizationId: string,
    actorId: string,
    data: CreatePolicyCategoryInput,
  ): Promise<PolicyCategoryDTO> {

    const duplicate = await this.categories.findByKey(organizationId, data.key)

    if (duplicate) {

      throw new AppError(
        "A policy category with this key already exists",
        409,
        ERROR_CODES.ALREADY_EXISTS,
      )
    }

    const category = await this.transactions.run(async (tx) => {

      const created = await this.categories.create(organizationId, data, tx)

      await this.audit.record(
        organizationId,
        {
          actorId,
          action: AUDIT_ACTIONS.POLICY_CATEGORY_CREATED,
          entityType: AUDIT_ENTITY_TYPES.POLICY_CATEGORY,
          entityId: created.id,
          afterState: this.snapshot(created),
        },
        tx,
      )

      return created
    })

    return toPolicyCategoryDTO(category)
  }

  async list(
    organizationId: string,
    query: ListPolicyCategoriesQuery,
  ): Promise<Page<PolicyCategoryDTO>> {

    // Categories are a small, bounded set per organization, so this reads them
    // all and pages in memory rather than adding a count query.
    const rows = await this.categories.findAll(organizationId)

    return {
      items: rows.slice(query.offset, query.offset + query.limit).map(toPolicyCategoryDTO),
      total: rows.length,
      limit: query.limit,
      offset: query.offset,
    }
  }

  async getById(organizationId: string, id: string): Promise<PolicyCategoryDTO> {

    return toPolicyCategoryDTO(await this.require(organizationId, id))
  }

  async patch(
    organizationId: string,
    actorId: string,
    id: string,
    data: PatchPolicyCategoryInput,
  ): Promise<PolicyCategoryDTO> {

    const before = await this.require(organizationId, id)

    if (data.key && data.key !== before.key) {

      const duplicate = await this.categories.findByKey(organizationId, data.key)

      if (duplicate) {

        throw new AppError(
          "A policy category with this key already exists",
          409,
          ERROR_CODES.ALREADY_EXISTS,
        )
      }
    }

    const after = await this.transactions.run(async (tx) => {

      const updated = await this.categories.update(organizationId, id, data, tx)

      if (updated === 0) {

        throw new AppError("Policy category not found", 404, ERROR_CODES.NOT_FOUND)
      }

      const row = await this.categories.findById(organizationId, id, tx)

      if (!row) {

        throw new AppError("Policy category not found", 404, ERROR_CODES.NOT_FOUND)
      }

      await this.audit.record(
        organizationId,
        {
          actorId,
          action: AUDIT_ACTIONS.POLICY_CATEGORY_UPDATED,
          entityType: AUDIT_ENTITY_TYPES.POLICY_CATEGORY,
          entityId: id,
          beforeState: this.snapshot(before),
          afterState: this.snapshot(row),
        },
        tx,
      )

      return row
    })

    return toPolicyCategoryDTO(after)
  }

  async delete(
    organizationId: string,
    actorId: string,
    id: string,
  ): Promise<PolicyCategoryDTO> {

    const category = await this.require(organizationId, id)

    await this.transactions.run(async (tx) => {

      await this.audit.record(
        organizationId,
        {
          actorId,
          action: AUDIT_ACTIONS.POLICY_CATEGORY_DELETED,
          entityType: AUDIT_ENTITY_TYPES.POLICY_CATEGORY,
          entityId: id,
          beforeState: this.snapshot(category),
        },
        tx,
      )

      // The FK from policies is Restrict, so this raises P2003 -> 409 while any
      // policy still references the category. That is the intended behaviour:
      // deleting a category out from under live policies would strand their
      // cardinality.
      const deleted = await this.categories.delete(organizationId, id, tx)

      if (deleted === 0) {

        throw new AppError("Policy category not found", 404, ERROR_CODES.NOT_FOUND)
      }
    })

    return toPolicyCategoryDTO(category)
  }

  private async require(organizationId: string, id: string): Promise<PolicyCategory> {

    const category = await this.categories.findById(organizationId, id)

    if (!category) {

      throw new AppError("Policy category not found", 404, ERROR_CODES.NOT_FOUND)
    }

    return category
  }

  private snapshot(category: PolicyCategory) {

    return {
      name: category.name,
      key: category.key,
      cardinality: category.cardinality,
    }
  }
}

/**
 * Policies.
 *
 * A policy on its own assigns nothing — rules do that — so no write here enqueues
 * reconciliation.
 *
 * `status` DOES gate evaluation: only ACTIVE policies are resolved. A rule that
 * points at a DRAFT or ARCHIVED policy is skipped and the skip is recorded as
 * SKIPPED_POLICY_INACTIVE, so archiving a policy stops it producing new
 * assignments without deleting anything or breaking the explanation of the
 * assignments it already produced.
 */
export class PolicyService implements PolicyServiceInterface {

  constructor(
    private transactions: TransactionManager,
    private policies: PolicyRepository,
    private categories: PolicyCategoryRepository,
    private audit: AuditEventRepository,
    private assignments: AssignmentRepository,
  ) {}

  async listAssignments(
    organizationId: string,
    id: string,
    query: AsOfPaginationQuery,
  ): Promise<Page<PolicyAssignmentDTO>> {

    await this.require(organizationId, id)

    const asOf = fromIsoDate(query.asOf ?? todayIsoDate())

    const [rows, total] = await Promise.all([
      this.assignments.findForPolicyAsOf(organizationId, id, asOf, query),
      this.assignments.countForPolicyAsOf(organizationId, id, asOf),
    ])

    return {
      items: rows.map(toPolicyAssignmentDTO),
      total,
      limit: query.limit,
      offset: query.offset,
    }
  }

  async create(
    organizationId: string,
    actorId: string,
    data: CreatePolicyInput,
  ): Promise<PolicyDTO> {

    // Resolving the category through the org-scoped repository is what stops a
    // policy in one tenant pointing at a category in another.
    const category = await this.categories.findById(organizationId, data.categoryId)

    if (!category) {

      throw new AppError("Policy category not found", 404, ERROR_CODES.NOT_FOUND)
    }

    const policy = await this.transactions.run(async (tx) => {

      const created = await this.policies.create(
        organizationId,
        {
          categoryId: data.categoryId,
          name: data.name,
          description: data.description ?? null,
          status: data.status ?? "DRAFT",
        },
        tx,
      )

      await this.audit.record(
        organizationId,
        {
          actorId,
          action: AUDIT_ACTIONS.POLICY_CREATED,
          entityType: AUDIT_ENTITY_TYPES.POLICY,
          entityId: created.id,
          afterState: this.snapshot(created),
        },
        tx,
      )

      return created
    })

    return toPolicyDTO(policy)
  }

  async list(organizationId: string, query: ListPoliciesQuery): Promise<Page<PolicyDTO>> {

    const [rows, total] = await Promise.all([
      this.policies.findMany(organizationId, query),
      this.policies.count(organizationId, query),
    ])

    return {
      items: rows.map(toPolicyDTO),
      total,
      limit: query.limit,
      offset: query.offset,
    }
  }

  async getById(organizationId: string, id: string): Promise<PolicyDTO> {

    return toPolicyDTO(await this.require(organizationId, id))
  }

  /** PUT: an omitted description is cleared and an omitted status resets to DRAFT. */
  async replace(
    organizationId: string,
    actorId: string,
    id: string,
    data: ReplacePolicyInput,
  ): Promise<PolicyDTO> {

    return this.applyUpdate(organizationId, actorId, id, {
      name: data.name,
      description: data.description ?? null,
      status: data.status ?? "DRAFT",
    })
  }

  async patch(
    organizationId: string,
    actorId: string,
    id: string,
    data: PatchPolicyInput,
  ): Promise<PolicyDTO> {

    return this.applyUpdate(organizationId, actorId, id, {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description ?? null }),
      ...(data.status !== undefined && { status: data.status }),
    })
  }

  async delete(organizationId: string, actorId: string, id: string): Promise<PolicyDTO> {

    const policy = await this.require(organizationId, id)

    await this.transactions.run(async (tx) => {

      await this.audit.record(
        organizationId,
        {
          actorId,
          action: AUDIT_ACTIONS.POLICY_DELETED,
          entityType: AUDIT_ENTITY_TYPES.POLICY,
          entityId: id,
          beforeState: this.snapshot(policy),
        },
        tx,
      )

      // Restrict from policy_rules: a policy that rules still point at cannot be
      // deleted, which keeps every assignment's explanation intact.
      const deleted = await this.policies.delete(organizationId, id, tx)

      if (deleted === 0) {

        throw new AppError("Policy not found", 404, ERROR_CODES.NOT_FOUND)
      }
    })

    return toPolicyDTO(policy)
  }

  private async applyUpdate(
    organizationId: string,
    actorId: string,
    id: string,
    patch: Parameters<PolicyRepository["update"]>[2],
  ): Promise<PolicyDTO> {

    const before = await this.require(organizationId, id)

    const after = await this.transactions.run(async (tx) => {

      const updated = await this.policies.update(organizationId, id, patch, tx)

      if (updated === 0) {

        throw new AppError("Policy not found", 404, ERROR_CODES.NOT_FOUND)
      }

      const row = await this.policies.findById(organizationId, id, tx)

      if (!row) {

        throw new AppError("Policy not found", 404, ERROR_CODES.NOT_FOUND)
      }

      await this.audit.record(
        organizationId,
        {
          actorId,
          action: AUDIT_ACTIONS.POLICY_UPDATED,
          entityType: AUDIT_ENTITY_TYPES.POLICY,
          entityId: id,
          beforeState: this.snapshot(before),
          afterState: this.snapshot(row),
        },
        tx,
      )

      return row
    })

    return toPolicyDTO(after)
  }

  private async require(organizationId: string, id: string): Promise<Policy> {

    const policy = await this.policies.findById(organizationId, id)

    if (!policy) {

      throw new AppError("Policy not found", 404, ERROR_CODES.NOT_FOUND)
    }

    return policy
  }

  private snapshot(policy: Policy) {

    return {
      categoryId: policy.categoryId,
      name: policy.name,
      description: policy.description,
      status: policy.status,
    }
  }
}
