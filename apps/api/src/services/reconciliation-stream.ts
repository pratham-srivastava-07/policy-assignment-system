import IORedis from "ioredis"
import {
  RECONCILIATION_STREAM_REPLAY_LIMIT,
  ReconciliationStreamEvent,
  reconciliationChannel,
} from "@policy/shared"
import { env } from "../config/env"

/**
 * The browser-facing end of the reconciliation stream.
 *
 * The worker publishes to Redis; this subscribes and fans out to the SSE
 * responses the API is holding open. The worker is never exposed to a browser:
 * it has no session, no RBAC and no organization scoping, and
 * `docs/architecture.md` §4 calls tenant isolation a critical security boundary.
 * Putting the relay here means live updates inherit the auth boundary that
 * already exists on every other route.
 *
 * Isolation is structural rather than a filter: the hub subscribes to
 * `policy:reconciliation:<organizationId>` only while that organization has a
 * listener attached, so a tenant with nobody watching never has its events
 * delivered into this process at all.
 */

export type StreamListener = (event: ReconciliationStreamEvent) => void

export class ReconciliationStreamHub {

  private subscriber: IORedis | null = null

  private listeners = new Map<string, Set<StreamListener>>()

  /**
   * The last few events per organization, for replaying to a client that
   * reconnects with `Last-Event-ID`.
   *
   * In-process and bounded, so it is a courtesy and not a guarantee: behind more
   * than one API instance a reconnect can land on a process that never saw the
   * missed events. The client is told to refetch on reconnect for that reason.
   */
  private recent = new Map<string, ReconciliationStreamEvent[]>()

  private connect(): IORedis {

    if (this.subscriber) {

      return this.subscriber
    }

    const client = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null })

    client.on("message", (channel, payload) => this.dispatch(channel, payload))

    client.on("error", (error) => console.warn("[stream] subscriber error", error))

    this.subscriber = client

    return client
  }

  private dispatch(channel: string, payload: string): void {

    const targets = this.listeners.get(channel)

    if (!targets || targets.size === 0) {

      return
    }

    let event: ReconciliationStreamEvent

    try {

      event = JSON.parse(payload) as ReconciliationStreamEvent
    } catch {

      console.warn(`[stream] unparseable payload on ${channel}`)

      return
    }

    this.remember(channel, event)

    for (const listener of targets) {

      listener(event)
    }
  }

  private remember(channel: string, event: ReconciliationStreamEvent): void {

    const buffer = this.recent.get(channel) ?? []

    buffer.push(event)

    if (buffer.length > RECONCILIATION_STREAM_REPLAY_LIMIT) {

      buffer.splice(0, buffer.length - RECONCILIATION_STREAM_REPLAY_LIMIT)
    }

    this.recent.set(channel, buffer)
  }

  /** Everything buffered after `lastEventId`. Empty when the id is unknown. */
  replay(organizationId: string, lastEventId: string | null): ReconciliationStreamEvent[] {

    if (!lastEventId) {

      return []
    }

    const buffer = this.recent.get(reconciliationChannel(organizationId)) ?? []
    const index = buffer.findIndex((event) => event.id === lastEventId)

    return index === -1 ? [] : buffer.slice(index + 1)
  }

  /** Attach a listener for one organization. Returns the detach function. */
  async subscribe(organizationId: string, listener: StreamListener): Promise<() => void> {

    const channel = reconciliationChannel(organizationId)
    const client = this.connect()

    const existing = this.listeners.get(channel)

    if (existing) {

      existing.add(listener)
    } else {

      this.listeners.set(channel, new Set([listener]))

      await client.subscribe(channel)
    }

    return () => void this.unsubscribe(channel, listener)
  }

  private async unsubscribe(channel: string, listener: StreamListener): Promise<void> {

    const targets = this.listeners.get(channel)

    if (!targets) {

      return
    }

    targets.delete(listener)

    if (targets.size > 0) {

      return
    }

    this.listeners.delete(channel)

    // The replay buffer goes with the last listener. Holding events for an
    // organization nobody is watching is memory spent on a reconnect that, by
    // definition, has not happened.
    this.recent.delete(channel)

    try {

      await this.subscriber?.unsubscribe(channel)
    } catch (error) {

      console.warn(`[stream] could not unsubscribe ${channel}`, error)
    }
  }
}

export const reconciliationStreamHub = new ReconciliationStreamHub()
