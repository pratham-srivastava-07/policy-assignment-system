import { NextFunction, Response } from "express"
import {
  RECONCILIATION_STREAM_HEARTBEAT_MS,
  ReconciliationStreamEvent,
} from "@policy/shared"
import { toHttpError } from "@policy/core"
import { AuthedRequest } from "../interfaces/auth"
import { requireAuthContext } from "../middlewares/auth"
import { ReconciliationStreamHub } from "../services/reconciliation-stream"

/**
 * `GET /reconciliation/stream` — server-sent events for one organization.
 *
 * SSE rather than a websocket: this is one-directional server to client, it
 * needs no protocol upgrade through whatever sits in front of the API, and the
 * framing already carries an event id, which is what makes resuming after a
 * dropped connection a two-line affair instead of an application protocol.
 *
 * The organization comes from the session, never from a parameter, so a caller
 * cannot ask for another tenant's stream by editing a URL.
 */
export class ReconciliationStreamController {

  constructor(private hub: ReconciliationStreamHub) {}

  stream = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)

      res.status(200).set({
        "Content-Type": "text/event-stream; charset=utf-8",
        // `no-transform` matters as much as `no-cache`: a proxy that gzips this
        // will buffer it, and a buffered stream is a stream that never arrives.
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      })

      res.flushHeaders()

      const send = (name: string, data: unknown, id?: string): void => {

        if (res.writableEnded) {

          return
        }

        if (id) {

          res.write(`id: ${id}\n`)
        }

        res.write(`event: ${name}\n`)
        res.write(`data: ${JSON.stringify(data)}\n\n`)
      }

      send("connected", {
        serverTime: new Date().toISOString(),
        heartbeatMs: RECONCILIATION_STREAM_HEARTBEAT_MS,
      })

      const lastEventId = this.lastEventId(req)

      for (const missed of this.hub.replay(auth.organizationId, lastEventId)) {

        send("reconciliation.applied", missed, missed.id)
      }

      const onEvent = (event: ReconciliationStreamEvent): void =>
        send("reconciliation.applied", event, event.id)

      const detach = await this.hub.subscribe(auth.organizationId, onEvent)

      // A heartbeat rather than a bare `:` comment, so the client can measure
      // silence and call itself stale on a connection that is open but dead.
      const heartbeat = setInterval(
        () => send("heartbeat", { serverTime: new Date().toISOString() }),
        RECONCILIATION_STREAM_HEARTBEAT_MS,
      )

      const close = (): void => {

        clearInterval(heartbeat)

        detach()

        if (!res.writableEnded) {

          res.end()
        }
      }

      req.on("close", close)

      res.on("error", close)
    } catch (err) {

      next(toHttpError(err))
    }
  }

  /**
   * The standard `Last-Event-ID` header, with a query fallback.
   *
   * The dashboard reads this stream with `fetch` rather than `EventSource`, so
   * that the bearer token can travel in an `Authorization` header instead of the
   * URL (design.md §9.2). That client sets the header; the query parameter is
   * there for anything that cannot.
   */
  private lastEventId(req: AuthedRequest): string | null {

    const header = req.headers["last-event-id"]

    if (typeof header === "string" && header.length > 0) {

      return header
    }

    const query = req.query.lastEventId

    return typeof query === "string" && query.length > 0 ? query : null
  }
}
