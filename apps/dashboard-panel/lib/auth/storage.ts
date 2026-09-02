/**
 * design.md §9.2. `sessionStorage`, not `localStorage`: the API sets no cookie
 * and has no CSRF protection, and a token that dies with the tab is the right
 * default for an HR tool on a shared machine.
 */

export const TOKEN_STORAGE_KEY = "policy.session.token"

const store = (): Storage | null => {
  if (typeof window === "undefined") return null

  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

const listeners = new Set<() => void>()

const notify = () => {
  for (const listener of listeners) listener()
}

export const getToken = (): string | null => {
  try {
    return store()?.getItem(TOKEN_STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

export const setToken = (token: string): void => {
  try {
    store()?.setItem(TOKEN_STORAGE_KEY, token)
  } catch {
    // A blocked storage means the session lasts one page load. Nothing else to do.
  }

  notify()
}

export const clearToken = (): void => {
  try {
    store()?.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    // Ignored for the same reason as setToken.
  }

  notify()
}

export const subscribeToToken = (onChange: () => void): (() => void) => {
  listeners.add(onChange)
  window.addEventListener("storage", onChange)

  return () => {
    listeners.delete(onChange)
    window.removeEventListener("storage", onChange)
  }
}

/**
 * `undefined` is the pre-hydration answer, distinct from `null` for "no token".
 * It keeps the session in `loading` for the hydration render, so nothing
 * redirects on a token the server could not possibly have seen.
 */
export const tokenServerSnapshot = (): string | null | undefined => undefined
