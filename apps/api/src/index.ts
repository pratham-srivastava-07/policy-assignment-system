import express, { Request, Response } from "express"
import cors from "cors"
import { env } from "./config/env"
import { router } from "./routes"
import { globalErrorHandler } from "./utils/error"

const app = express()

app.set("trust proxy", 1)

app.use(cors())

app.use(express.json())

app.get("/health", (_req: Request, res: Response) => res.json({ status: "ok" }))

app.use("/api/v1", router)

app.use(globalErrorHandler) // must be last, after routes

app.listen(env.PORT, () => console.log(`Server on http://localhost:${env.PORT}`))