/**
 * Service composition root: repositories in, services out.
 */

import {
  auditEventRepository,
  employeeAttributeHistoryRepository,
  employeeGroupRepository,
  employeeRepository,
  groupRepository,
  organizationMembershipRepository,
  organizationRepository,
  outboxEventRepository,
  sessionRepository,
  userRepository,
} from "../repositories"
import { AuthService } from "./auth"
import { EmployeeService } from "./employee"
import { GroupService } from "./group"
import { UserService } from "./user"

export const authService = new AuthService(
  organizationRepository,
  userRepository,
  organizationMembershipRepository,
  sessionRepository,
  auditEventRepository,
)

export const userService = new UserService(
  userRepository,
  organizationMembershipRepository,
  employeeRepository,
  auditEventRepository,
)

export const employeeService = new EmployeeService(
  employeeRepository,
  employeeAttributeHistoryRepository,
  auditEventRepository,
  outboxEventRepository,
)

export const groupService = new GroupService(
  groupRepository,
  employeeGroupRepository,
  employeeRepository,
  auditEventRepository,
  outboxEventRepository,
)

export { AuthService } from "./auth"
export { EmployeeService } from "./employee"
export { GroupService } from "./group"
export { UserService } from "./user"
