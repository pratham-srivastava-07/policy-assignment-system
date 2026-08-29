import { Router } from "express"
import { employeeController } from "../controllers"
import { requireAuth } from "../middlewares/auth"

export const employeeRouter = Router()

// Employees are org-scoped, so every route here is authenticated: the
// organization comes from the session, and without one there is nothing to scope
// the query to.
employeeRouter.use(requireAuth)

employeeRouter.post("/", employeeController.create)
employeeRouter.get("/", employeeController.list)

// Before "/:id", otherwise a literal path segment would be read as an id.
employeeRouter.get("/:id/attribute-history", employeeController.getAttributeHistory)

employeeRouter.get("/:id", employeeController.getById)
employeeRouter.put("/:id", employeeController.replace)
employeeRouter.patch("/:id", employeeController.patch)
employeeRouter.delete("/:id", employeeController.delete)
