/**
 * A minimal SSE reader built on `fetch`, not `EventSource`.
 *
 * `EventSource` cannot set request headers, so using it would mean putting the
 * bearer token in the query string. design.md §9.2 says the token never enters
 * a URL, and a token in a URL is a token in every access log and `Referer`
 * header between here and the API. Reading the body stream ourselves costs one
 * small parser and keeps `Authorization: Bearer` where it belongs.
 *
 * The trade is that reconnection is ours to implement rather than the browser's.
 * That turns out to be the better half of the deal: the reconnect policy is
 * visible, backs off, and is what the connection indicator reports.
 */

export interface SseFrame {
  id: string | null
  event: string
  data: string
}

/** Splits an SSE byte stream into frames. One instance per connection. */
export class SseParser {

  private buffer = ""

  push(chunk: string): SseFrame[] {

    this.buffer += chunk

    const frames: SseFrame[] = []

    // Frames are separated by a blank line. Normalise CRLF first so a proxy
    // that rewrites line endings does not silently stop the stream.
    const normalised = this.buffer.replace(/\r\n/g, "\n")
    const parts = normalised.split("\n\n")

    this.buffer = parts.pop() ?? ""

    for (const part of parts) {

      const frame = this.parseFrame(part)

      if (frame) frames.push(frame)
    }

    return frames
  }

  private parseFrame(block: string): SseFrame | null {
    let id: string | null = null
    let event = "message"
    const dataLines: string[] = []

    for (const line of block.split("\n")) {
      // A line starting with ":" is a comment, which is how servers keep a
      // connection warm without emitting an event.
      if (line.startsWith(":") || line.length === 0) continue

      const separator = line.indexOf(":")
      const field = separator === -1 ? line : line.slice(0, separator)
      const raw = separator === -1 ? "" : line.slice(separator + 1)
      const value = raw.startsWith(" ") ? raw.slice(1) : raw

      if (field === "id") id = value
      else if (field === "event") event = value
      else if (field === "data") dataLines.push(value)
    }

    return dataLines.length === 0 && id === null ? null : {
      id,
      event,
      data: dataLines.join("\n"),
    }
  }
}

export interface SseConnectionOptions {
  url: string
  getToken: () => string | null
  onFrame: (frame: SseFrame) => void
  onOpen: () => void
  onClosed: (reason: "error" | "ended") => void
  getLastEventId: () => string | null
}

/**
 * Reads one connection to completion. Resolves when the stream ends or fails;
 * the caller owns the retry loop, so backoff policy lives in one place.
 */
export const readSseStream = async (
  options: SseConnectionOptions,
  signal: AbortSignal,
): Promise<void> => {

  const headers = new Headers({ Accept: "text/event-stream" })
  const token = options.getToken()

  if (token) headers.set("Authorization", `Bearer ${token}`)

  const lastEventId = options.getLastEventId()

  if (lastEventId) headers.set("Last-Event-ID", lastEventId)

  const response = await fetch(options.url, {
    headers,
    signal,
    cache: "no-store",
  })

  if (!response.ok || !response.body) {
    options.onClosed("error")

    throw new Error(`Stream refused with status ${response.status}`)
  }

  options.onOpen()

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const parser = new SseParser()

  try {
    for (;;) {
      const { done, value } = await reader.read()

      if (done) break

      for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
        options.onFrame(frame)
      }
    }

    options.onClosed("ended")
  } catch (error) {
    options.onClosed("error")

    throw error
  } finally {
    reader.releaseLock()
  }
}

/** Exponential backoff with jitter, so a restarted API is not stampeded. */
export const backoffDelay = (attempt: number): number => {
  const base = Math.min(1000 * 2 ** Math.max(0, attempt - 1), 15_000)

  return base + Math.random() * 400
}
