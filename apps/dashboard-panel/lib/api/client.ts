import {
  ERROR_CODES,
  RATE_LIMIT_TIERS,
  type ApiResponse,
  type RateLimitTierName,
} from "@policy/shared"
import { API_BASE_URL } from "./config"
import { ApiError, NetworkError } from "./errors"

export type QueryValue = string | number | boolean | null | undefined

export interface RequestOptions {
  query?: Record<string, QueryValue>
  body?: unknown
  signal?: AbortSignal
  /** Attach the bearer token. Only the auth endpoints set this to false. */
  auth?: boolean
  /**
   * Which rate-limit bucket the call spends. Drives the 429 fallback delay and
   * tells the query layer whether an automatic retry is ever allowed (§35.2).
   */
  tier?: RateLimitTierName
}

type TokenReader = () => string | null

let readToken: TokenReader = () => null
let onAuthFailure: (() => void) | null = null

/** Wired once by `lib/auth`; the client never imports storage directly. */
export const configureApiClient = (options: {
  getToken: TokenReader
  onAuthFailure: () => void
}) => {
  readToken = options.getToken
  onAuthFailure = options.onAuthFailure
}

const buildUrl = (path: string, query?: Record<string, QueryValue>) => {
  const url = new URL(`${API_BASE_URL}${path}`)

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue
    url.searchParams.set(key, String(value))
  }

  return url.toString()
}

/**
 * `Retry-After` is not a CORS-safelisted response header and the API does not
 * expose it, so a browser reads `null` even though the header is on the wire.
 * Falling back to the tier's own refill rate keeps §40.5's countdown honest
 * rather than inventing a number.
 */
const retryAfterFrom = (response: Response, tier: RateLimitTierName | undefined) => {
  const header = response.headers.get("Retry-After")
  const parsed = header === null ? Number.NaN : Number(header)

  if (Number.isFinite(parsed) && parsed >= 0) return Math.ceil(parsed)
  if (tier) return Math.ceil(1 / RATE_LIMIT_TIERS[tier].refillPerSecond)

  return 30
}

const parseEnvelope = async <T,>(response: Response): Promise<ApiResponse<T> | null> => {
  const text = await response.text()

  if (!text) return null

  try {
    return JSON.parse(text) as ApiResponse<T>
  } catch {
    return null
  }
}

export const request = async <T,>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  options: RequestOptions = {},
): Promise<T> => {
  const { auth = true } = options
  const headers = new Headers({ Accept: "application/json" })

  if (options.body !== undefined) headers.set("Content-Type", "application/json")

  if (auth) {
    const token = readToken()
    if (token) headers.set("Authorization", `Bearer ${token}`)
  }

  let response: Response

  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      signal: options.signal,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause

    throw new NetworkError(path, cause)
  }

  const envelope = await parseEnvelope<T>(response)

  if (response.ok && envelope?.success === true) return envelope.data

  const failure = envelope && envelope.success === false ? envelope : null
  const code =
    failure?.code ??
    (response.status === 429 ? ERROR_CODES.RATE_LIMIT_EXCEEDED : ERROR_CODES.INTERNAL_ERROR)

  const error = new ApiError({
    message: failure?.message ?? `Request failed with status ${response.status}`,
    status: response.status,
    code,
    path,
    retryAfterSeconds:
      response.status === 429 ? retryAfterFrom(response, options.tier) : null,
  })

  if (auth && error.isAuthFailure) onAuthFailure?.()

  throw error
}

export const api = {
  get: <T,>(path: string, options?: Omit<RequestOptions, "body">) =>
    request<T>("GET", path, options),
  post: <T,>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("POST", path, { ...options, body }),
  put: <T,>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PUT", path, { ...options, body }),
  patch: <T,>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PATCH", path, { ...options, body }),
  delete: <T,>(path: string, options?: RequestOptions) =>
    request<T>("DELETE", path, options),
}
