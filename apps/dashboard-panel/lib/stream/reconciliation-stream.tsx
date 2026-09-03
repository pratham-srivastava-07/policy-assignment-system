"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  RECONCILIATION_STREAM_STALE_AFTER_MS,
  type ReconciliationStreamEvent,
} from "@policy/shared"
import { API_BASE_URL } from "@/lib/api"
import { getToken, useSession } from "@/lib/auth"
import { queryKeys } from "@/lib/query"
import { backoffDelay, readSseStream } from "./sse"

/**
 * Live reconciliation, subscribed once for the whole application.
 *
 * `connecting` — the first attempt has not resolved yet.
 * `live`       — frames are arriving.
 * `reconnecting` — the connection dropped; a retry is scheduled.
 * `stale`      — the socket is nominally open but has been silent past the
 *                heartbeat window, so what is on screen may be behind.
 * `offline`    — retries have been abandoned, or there is no session.
 *
 * `stale` exists because a silently dead connection is the failure mode that
 * makes a live feature worse than polling: the page looks current and is not.
 */
export type StreamStatus = "connecting" | "live" | "reconnecting" | "stale" | "offline"

const MAX_ATTEMPTS = 8

const FEED_LIMIT = 200

interface StreamValue {
  status: StreamStatus
  events: ReconciliationStreamEvent[]
  lastMessageAt: number | null
  /** Ids seen since the last `acknowledge`, so a view can highlight what is new. */
  unseen: ReadonlySet<string>
  acknowledge: () => void
  reconnect: () => void
}

const StreamContext = createContext<StreamValue | null>(null)

export const ReconciliationStreamProvider = ({ children }: { children: ReactNode }) => {
  const { status: sessionStatus, session } = useSession()
  const queryClient = useQueryClient()

  const [status, setStatus] = useState<StreamStatus>("connecting")
  const [events, setEvents] = useState<ReconciliationStreamEvent[]>([])
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null)
  const [unseen, setUnseen] = useState<ReadonlySet<string>>(new Set())

  const lastEventIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const retryRef = useRef<number | null>(null)
  const [restartToken, setRestartToken] = useState(0)

  const organizationId = session?.organization.id ?? null
  const connected = sessionStatus === "authenticated" && organizationId !== null

  /**
   * A reconciliation happened, so what TanStack Query holds for that employee is
   * now wrong. Invalidating by entity rather than clearing everything (§35.3)
   * keeps the rest of the page from flashing while one row updates.
   */
  const invalidateFor = useCallback(
    (event: ReconciliationStreamEvent) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.employee(event.employeeId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.reconciliationStatus() })
    },
    [queryClient],
  )

  useEffect(() => {
    if (!connected) {
      setStatus("offline")

      return
    }

    let cancelled = false
    let attempt = 0

    const clearRetry = () => {
      if (retryRef.current !== null) {
        window.clearTimeout(retryRef.current)
        retryRef.current = null
      }
    }

    const run = async () => {
      while (!cancelled && attempt <= MAX_ATTEMPTS) {
        const controller = new AbortController()
        abortRef.current = controller

        try {
          await readSseStream(
            {
              url: `${API_BASE_URL}/reconciliation/stream`,
              getToken,
              getLastEventId: () => lastEventIdRef.current,
              onOpen: () => {
                attempt = 0
                setStatus("live")
                setLastMessageAt(Date.now())
              },
              onClosed: () => {
                abortRef.current = null
              },
              onFrame: (frame) => {
                setLastMessageAt(Date.now())
                setStatus("live")

                if (frame.event === "heartbeat" || frame.event === "connected") return
                if (frame.event !== "reconciliation.applied") return

                let event: ReconciliationStreamEvent

                try {
                  event = JSON.parse(frame.data) as ReconciliationStreamEvent
                } catch {
                  return
                }

                if (frame.id) lastEventIdRef.current = frame.id

                setEvents((current) => [event, ...current].slice(0, FEED_LIMIT))
                setUnseen((current) => new Set(current).add(event.id))
                invalidateFor(event)
              },
            },
            controller.signal,
          )
        } catch {
          // Every failure lands here: refused, dropped, aborted. The abort case
          // is filtered by `cancelled` below rather than by inspecting the error.
        }

        if (cancelled) return

        attempt += 1

        if (attempt > MAX_ATTEMPTS) {
          setStatus("offline")

          return
        }

        setStatus("reconnecting")

        await new Promise<void>((resolve) => {
          retryRef.current = window.setTimeout(resolve, backoffDelay(attempt))
        })
      }
    }

    void run()

    return () => {
      cancelled = true
      clearRetry()
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [connected, organizationId, invalidateFor, restartToken])

  /**
   * Silence detection. An open connection that stops heartbeating is not an
   * error the transport will report, so it has to be timed here.
   */
  useEffect(() => {
    if (status !== "live" || lastMessageAt === null) return

    const timer = window.setTimeout(
      () => setStatus("stale"),
      RECONCILIATION_STREAM_STALE_AFTER_MS,
    )

    return () => window.clearTimeout(timer)
  }, [status, lastMessageAt])

  const reconnect = useCallback(() => {
    abortRef.current?.abort()
    setStatus("connecting")
    setRestartToken((token) => token + 1)
  }, [])

  const acknowledge = useCallback(() => setUnseen(new Set()), [])

  const value = useMemo<StreamValue>(
    () => ({ status, events, lastMessageAt, unseen, acknowledge, reconnect }),
    [status, events, lastMessageAt, unseen, acknowledge, reconnect],
  )

  return <StreamContext.Provider value={value}>{children}</StreamContext.Provider>
}

export const useReconciliationStream = (): StreamValue => {
  const value = useContext(StreamContext)

  if (!value) {
    throw new Error("useReconciliationStream must be used inside ReconciliationStreamProvider")
  }

  return value
}

export const STREAM_STATUS_LABELS: Record<StreamStatus, string> = {
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
  stale: "Stale",
  offline: "Offline",
}
