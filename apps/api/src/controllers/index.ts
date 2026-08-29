/**
 * Controller composition root: services in, controllers out.
 */

import { authService, employeeService, groupService, userService } from "../services"
import { AuthController } from "./auth"
import { EmployeeController } from "./employee"
import { GroupController } from "./group"
import { UserController } from "./user"

export const authController = new AuthController(authService)
export const userController = new UserController(userService)
export const employeeController = new EmployeeController(employeeService)
export const groupController = new GroupController(groupService)

export { AuthController } from "./auth"
export { EmployeeController } from "./employee"
export { GroupController } from "./group"
export { UserController } from "./user"
