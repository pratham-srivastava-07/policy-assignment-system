import express, { Request, Response } from "express"
import cors from "cors"
import { env } from "./config/env"
import { router } from "./routes"
import { globalErrorHandler } from "./utils/error"

const app = express()

// The AUTH rate limit tier is keyed by client IP, so `req.ip` has to be the real
// caller and not whatever proxy sat in front of us. Express only consults
// X-Forwarded-For when it is told to trust a proxy.
//
// ASSUMPTION: exactly one trusted reverse proxy (a load balancer or ingress)
// terminates TLS in front of this process. Trusting one hop means a client
// cannot forge its own IP by sending X-Forwarded-For, because the proxy appends
// the real address last. Running this with no proxy in front, or with two, makes
// the AUTH tier easy to evade — revisit this line when the deployment shape is
// settled.
app.set("trust proxy", 1)

app.use(cors())

app.use(express.json())

app.get("/health", (_req: Request, res: Response) => res.json({ status: "ok" }))

app.use("/api/v1", router)

app.use(globalErrorHandler) // must be last, after routes

app.listen(env.PORT, () => console.log(`Server on http://localhost:${env.PORT}`))