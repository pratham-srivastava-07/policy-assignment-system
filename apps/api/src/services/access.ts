import {
  APPLICATION_ACCESS_CATEGORY_KEY,
  AssignmentDTO,
  ERROR_CODES,
  Page,
  RuleDTO,
  fromIsoDate,
  todayIsoDate,
} from "@policy/shared"
import {
  AssignmentRepository,
  PolicyCategoryRepository,
  PolicyRepository,
} from "../repositories"
import { AccessServiceInterface } from "../interfaces/assignment"
import { AccessQuery, GrantAccessInput } from "../validators"
import { AppError } from "../utils/AppError"
import { toAssignmentDTO } from "../utils/serialize"
import { RuleService } from "./rule"

/**
 * Application access.
 *
 * Access is derived, exactly like every other policy assignment — which is why
 * there is no POST here and no way to write an access row directly. Reading is a
 * filtered view over the assignments in the APPLICATION_ACCESS category, and
 * granting is the creation of a MANUAL override rule that produces an
 * application policy. The engine then turns that rule into an assignment on the
 * next reconciliation, with the same explanation trail as anything else.
 *
 * Writing an assignment straight into the table would produce access that no
 * rule accounts for: reconciliation would remove it on its next run, and until
 * then nobody could say why it existed.
 */
export class AccessService implements AccessServiceInterface {

  constructor(
    private categories: PolicyCategoryRepository,
    private policies: PolicyRepository,
    private assignments: AssignmentRepository,
    private rules: RuleService,
  ) {}

  async list(organizationId: string, query: AccessQuery): Promise<Page<AssignmentDTO>> {

    const category = await this.requireCategory(organizationId)
    const asOf = fromIsoDate(query.asOf ?? todayIsoDate())

    const rows = await this.assignments.findForEmployeeAsOf(organizationId, query.emp, asOf)

    const access = rows
      .filter((assignment) => assignment.categoryId === category.id)
      .map(toAssignmentDTO)

    return {
      items: access.slice(query.offset, query.offset + query.limit),
      total: access.length,
      limit: query.limit,
      offset: query.offset,
    }
  }

  /**
   * PUT / PATCH — grant or re-grant access by creating a manual override rule.
   *
   * DECISION: both verbs land here and both create a new MANUAL rule. An
   * override is effective-dated and versioned, so "change the grant" is a new
   * rule or an edit through `/rules`, not a mutation of an existing row behind a
   * different verb. Revoking is `DELETE /overrides/:id`, which soft-deletes the
   * rule the way every other rule is soft-deleted.
   */
  async grant(
    organizationId: string,
    actorId: string,
    data: GrantAccessInput,
  ): Promise<RuleDTO> {

    const category = await this.requireCategory(organizationId)
    const policy = await this.policies.findById(organizationId, data.policyId)

    if (!policy) {

      throw new AppError("Policy not found", 404, ERROR_CODES.NOT_FOUND)
    }

    if (policy.categoryId !== category.id) {

      throw new AppError(
        `Policy "${policy.name}" is not in the "${APPLICATION_ACCESS_CATEGORY_KEY}" category`,
        409,
        ERROR_CODES.CONFLICT,
      )
    }

    return this.rules.createOverride(organizationId, actorId, data.employeeId, {
      policyId: data.policyId,
      priority: data.priority,
      effectiveFrom: data.effectiveFrom ?? todayIsoDate(),
      effectiveTo: data.effectiveTo ?? null,
    })
  }

  /**
   * The access category is a convention, not a schema constraint: an
   * organization that has not created it has no application access to report,
   * and saying so is better than returning an empty list that looks like a
   * revocation.
   */
  private async requireCategory(organizationId: string) {

    const category = await this.categories.findByKey(
      organizationId,
      APPLICATION_ACCESS_CATEGORY_KEY,
    )

    if (!category) {

      throw new AppError(
        `This organization has no "${APPLICATION_ACCESS_CATEGORY_KEY}" policy category`,
        404,
        ERROR_CODES.NOT_FOUND,
      )
    }

    return category
  }
}
