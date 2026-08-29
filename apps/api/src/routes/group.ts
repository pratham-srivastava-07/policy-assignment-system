import { Router } from "express"
import { groupController } from "../controllers"
import { requireAuth } from "../middlewares/auth"

export const groupRouter = Router()

groupRouter.use(requireAuth)

groupRouter.post("/", groupController.create)
groupRouter.get("/", groupController.list)

// Membership routes come before "/:id" so their literal segments are never read
// as an id.
groupRouter.get("/:id/members", groupController.listMembers)
groupRouter.post("/:id/members", groupController.addMember)
groupRouter.delete("/:id/members/:employeeId", groupController.removeMember)

groupRouter.get("/:id", groupController.getById)
groupRouter.put("/:id", groupController.replace)
groupRouter.patch("/:id", groupController.patch)
groupRouter.delete("/:id", groupController.delete)
